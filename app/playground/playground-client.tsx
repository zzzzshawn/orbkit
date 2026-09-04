"use client";

import { DialStore, useDialKit, type DialConfig } from "dialkit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { HeroInstallCommand } from "@/components/hero-install-command";
import { ShikiCodeView } from "@/components/shiki-code-view";
import { orbComponentMap, orbVariantMap } from "@/lib/orb-component-map";
import { shadcnAddCommand } from "@/lib/site-config";
import {
  ORB_STATES,
  ORB_WRAPPERS,
  type OrbState,
  type OrbVariant,
  type OrbWrapper
} from "@/orbs/core/orbkit-core";

const PANEL_NAME = "Orb Playground";
const DEFAULT_SIZE = 420;

export interface PlaygroundOrbOption {
  slug: string;
  title: string;
  componentName: string;
}

interface PlaygroundClientProps {
  initialSlug?: string;
  /** `?state=` — loads straight into that state, so a link can share one. */
  initialState?: string;
  orbs: PlaygroundOrbOption[];
}

/** Everything the user can author for ONE state. */
interface StateDraft {
  params: Record<string, number>;
  colors: Record<string, string>;
  /** While true the engine synthesizes the drive and the two values below are
      inert — that is the default, and what every built-in orb does. */
  autoDrive: boolean;
  input: number;
  output: number;
}

/*
  Where each state's drive sits when you switch it off auto. These mirror what
  the engine's own synthesis averages to, so flipping the toggle holds the look
  roughly steady instead of jumping — you start from where you were and adjust.
*/
const DRIVE_SEED: Record<OrbState, [number, number]> = {
  idle: [0, 0.3],
  thinking: [0.4, 0.5],
  speaking: [0.7, 0.8]
};

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

/** The value a param takes at a given state when the user hasn't authored one. */
function presetValue(variant: OrbVariant, state: OrbState, key: string): number {
  const def = variant.params.find((p) => p.key === key);
  return variant.statePresets?.[state]?.[key] ?? def?.default ?? 0;
}

/** The colour counterpart of `presetValue` — same resolution order. */
function presetColor(variant: OrbVariant, state: OrbState, key: string): string {
  const def = variant.colors.find((c) => c.key === key);
  return variant.stateColors?.[state]?.[key] ?? def?.default ?? "#ffffff";
}

/** A state's starting point: the orb's own preset for it. */
function draftFromPreset(variant: OrbVariant, state: OrbState): StateDraft {
  const params: Record<string, number> = {};
  for (const p of variant.params) params[p.key] = presetValue(variant, state, p.key);
  const colors: Record<string, string> = {};
  for (const c of variant.colors) colors[c.key] = presetColor(variant, state, c.key);
  const [input, output] = DRIVE_SEED[state];
  return { params, colors, autoDrive: true, input, output };
}

function draftsFromPreset(variant: OrbVariant): Record<OrbState, StateDraft> {
  return {
    idle: draftFromPreset(variant, "idle"),
    thinking: draftFromPreset(variant, "thinking"),
    speaking: draftFromPreset(variant, "speaking")
  };
}

/** Reads the panel's current controls back out as a draft. */
function readDraftFromPanel(panelId: string, variant: OrbVariant): StateDraft {
  const params: Record<string, number> = {};
  for (const p of variant.params) {
    params[p.key] = (DialStore.getValue(panelId, `params.${p.key}`) as number) ?? p.default;
  }
  const colors: Record<string, string> = {};
  for (const c of variant.colors) {
    colors[c.key] = (DialStore.getValue(panelId, `colors.${c.key}`) as string) ?? c.default;
  }
  return {
    params,
    colors,
    autoDrive: (DialStore.getValue(panelId, "drive.auto") as boolean) ?? true,
    input: (DialStore.getValue(panelId, "drive.input") as number) ?? 0,
    output: (DialStore.getValue(panelId, "drive.output") as number) ?? 0
  };
}

/**
 * The three drafts, tagged with the orb whose schema built them. A draft is
 * only meaningful against that schema, so the two travel together — which is
 * what makes a set belonging to a different orb impossible to read by accident.
 */
interface DraftSet {
  slug: string;
  byState: Record<OrbState, StateDraft>;
}

function findPanelId(): string | undefined {
  return DialStore.getPanels().find((panel) => panel.name === PANEL_NAME)?.id;
}

export function PlaygroundClient({ initialSlug, initialState, orbs }: PlaygroundClientProps) {
  const startState: OrbState = (ORB_STATES as readonly string[]).includes(initialState ?? "")
    ? (initialState as OrbState)
    : "idle";
  const fallbackSlug = orbs[0]?.slug ?? "shdr-11";
  const startSlug = orbs.some((orb) => orb.slug === initialSlug)
    ? (initialSlug as string)
    : fallbackSlug;

  // `slug` mirrors the dial's `orb` select; it drives which schema builds the
  // control set, so it has to live in React state, not only in the store.
  const [slug, setSlug] = useState(startSlug);
  const variant = orbVariantMap[slug] ?? orbVariantMap[fallbackSlug];
  const SelectedOrb = orbComponentMap[slug] ?? orbComponentMap[fallbackSlug];

  /*
   * The three states the user is authoring.
   *
   * The panel only ever shows ONE state — whichever is selected — so this
   * holds the other two and swaps them into the panel on every state change.
   * That keeps the control surface the size of one state while still letting
   * you design all three: switch to Thinking, dial it in, switch back to Idle,
   * and your Idle work is still there.
   *
   * The SELECTED state is deliberately not stored here — it is whatever the
   * dials currently read, which is the same thing. Storing it too would mean
   * writing on every frame of a slider drag and keeping the two copies in
   * step; instead its draft is captured once, at the moment you switch away.
   */
  const [drafts, setDrafts] = useState<DraftSet>(() => ({
    slug: startSlug,
    byState: draftsFromPreset(variant)
  }));
  const [activeState, setActiveState] = useState<OrbState>(startState);
  const loadedKeyRef = useRef<string>("");

  const config = useMemo<DialConfig>(() => {
    /*
      Control defaults are the INITIAL STATE'S PRESET, not the schema
      defaults. The panel's first publish is what the orb's first frame is
      drawn from — the effect below that writes a state's draft into the
      panel only runs after mount — so seeding these with schema defaults
      painted frame one from them and then cross-faded to the preset. On an
      orb whose idle preset differs from its defaults (most of them) that is
      a blink on every load; on a `?state=` link it is a blink from idle's
      palette into the requested state's.
    */
    const params: DialConfig = { _collapsed: false };
    for (const p of variant.params) {
      params[p.key] = [presetValue(variant, startState, p.key), p.min, p.max, p.step];
    }

    const colors: DialConfig = { _collapsed: false };
    for (const c of variant.colors) {
      colors[c.key] = { type: "color", default: presetColor(variant, startState, c.key) };
    }

    return {
      orb: {
        type: "select",
        default: slug,
        options: orbs.map((orb) => ({ value: orb.slug, label: orb.title }))
      },
      state: {
        type: "select",
        default: startState,
        options: ORB_STATES.map((value) => ({ value, label: titleCase(value) }))
      },
      /*
        The panel is ordered by how often you reach for something while
        authoring a state, not by how the data is shaped. The reset actions and
        the colours sit above `params` because that list runs to a dozen
        sliders on some orbs — putting them underneath buried the two controls
        you touch most behind a scroll.
      */
      resetState: { type: "action", label: "Reset this state" },
      copyToOthers: { type: "action", label: "Copy state to other two" },
      resetAll: { type: "action", label: "Reset all three states" },
      ...(variant.colors.length > 0 ? { colors } : {}),
      size: [DEFAULT_SIZE, 120, 900, 10],
      /*
        Decoration around the orb. Whole-orb, not per-state: it sits here with
        `size` and `paused` rather than in `params`, and is deliberately left
        out of the drafts — switching to Thinking should not change the bezel.
      */
      wrapper: {
        type: "select",
        default: "none",
        options: ORB_WRAPPERS.map((value) => ({ value, label: titleCase(value) }))
      },
      paused: false,
      params,
      /*
        Volume drive — how hard this state pushes the two signals most shaders
        read as their reactivity. `auto` leaves it to the engine, which is what
        every built-in orb does; turn it off to pin the state's own energy.
      */
      drive: {
        _collapsed: true,
        auto: true,
        input: [0, 0, 1, 0.01],
        output: [0.3, 0, 1, 0.01]
      }
    };
  }, [variant, slug, orbs, startState]);

  /** Writes one state's draft into the panel's controls. */
  const pushDraftToPanel = useCallback(
    (panelId: string, draft: StateDraft) => {
      for (const p of variant.params) {
        DialStore.updateValue(panelId, `params.${p.key}`, draft.params[p.key]);
      }
      for (const c of variant.colors) {
        DialStore.updateValue(panelId, `colors.${c.key}`, draft.colors[c.key]);
      }
      DialStore.updateValue(panelId, "drive.auto", draft.autoDrive);
      DialStore.updateValue(panelId, "drive.input", draft.input);
      DialStore.updateValue(panelId, "drive.output", draft.output);
    },
    [variant]
  );

  const handleAction = useCallback(
    (action: string) => {
      const panelId = findPanelId();
      if (!panelId) return;
      const state = (DialStore.getValue(panelId, "state") as OrbState) ?? "idle";

      if (action === "resetState") {
        const fresh = draftFromPreset(variant, state);
        setDrafts((prev) => ({ slug, byState: { ...prev.byState, [state]: fresh } }));
        pushDraftToPanel(panelId, fresh);
        return;
      }

      if (action === "copyToOthers") {
        // Authoring three states usually means starting from one you like and
        // varying it, so this seeds the other two rather than making you
        // rebuild them slider by slider. The source is read back out of the
        // panel, which is where the selected state's values actually live.
        const source = readDraftFromPanel(panelId, variant);
        setDrafts((prev) => {
          const byState = { ...prev.byState };
          for (const other of ORB_STATES) {
            if (other === state) continue;
            byState[other] = {
              params: { ...source.params },
              colors: { ...source.colors },
              autoDrive: source.autoDrive,
              input: source.input,
              output: source.output
            };
          }
          return { slug, byState };
        });
        return;
      }

      if (action === "resetAll") {
        const fresh = draftsFromPreset(variant);
        setDrafts({ slug, byState: fresh });
        pushDraftToPanel(panelId, fresh[state]);
      }
    },
    [variant, slug, pushDraftToPanel]
  );

  const controls = useDialKit(PANEL_NAME, config, {
    onAction: handleAction,
    shortcuts: {
      size: { key: "s", interaction: "drag" }
    }
  });

  // Until DialKit publishes its first values this is undefined, and falling
  // back to "idle" here mounted the orb in idle and then cross-faded it to the
  // requested state — a visible blink on a `?state=` link. Fall back to the
  // state the page was asked to open in.
  const state = (controls.state as OrbState) ?? startState;
  const size = (controls.size as number) ?? DEFAULT_SIZE;
  const wrapper = (controls.wrapper as OrbWrapper) ?? "none";
  const paused = Boolean(controls.paused);
  const rawParams = controls.params as Record<string, number> | undefined;
  const rawColors = controls.colors as Record<string, string> | undefined;
  const rawDrive = controls.drive as Record<string, number | boolean> | undefined;
  const dialParams = useMemo(() => rawParams ?? {}, [rawParams]);
  const dialColors = useMemo(() => rawColors ?? {}, [rawColors]);
  const autoDrive = rawDrive?.auto !== false;
  const driveInput = (rawDrive?.input as number) ?? 0;
  const driveOutput = (rawDrive?.output as number) ?? 0;

  /** The selected state's draft — the dials ARE its storage. */
  const liveDraft = useMemo<StateDraft>(
    () => ({
      params: { ...dialParams },
      colors: { ...dialColors },
      autoDrive,
      input: driveInput,
      output: driveOutput
    }),
    [dialParams, dialColors, autoDrive, driveInput, driveOutput]
  );

  // Adjust state during render when the dial's select changes — React re-runs
  // this component before committing, so `variant` above is rebuilt from the new
  // slug in the same pass. Doing it in an effect would cascade an extra render.
  const dialSlug = controls.orb as string | undefined;
  if (dialSlug && dialSlug !== slug && orbVariantMap[dialSlug]) {
    setSlug(dialSlug);
  }

  /*
   * Rebuild the drafts in that same pass, for the same reason.
   *
   * A different orb declares different params and colours, so drafts built for
   * the previous one describe controls this one does not have. Everything
   * below — the props handed to the preview, and the snippet — reads all three
   * drafts against the CURRENT variant's schema, so leaving the rebuild to the
   * effect below left them one render reading the outgoing orb's drafts: every
   * colour the incoming orb declares and the outgoing one did not came back
   * undefined. Deriving it here means there is no such in-between render.
   */
  const orbDrafts = drafts.slug === slug ? drafts.byState : draftsFromPreset(variant);
  if (drafts.slug !== slug) {
    setDrafts({ slug, byState: orbDrafts });
  }

  /*
   * The selected state changed. Freeze what the dials are showing into the
   * state we are leaving — at this point they still hold its values, because
   * the panel has not been rewritten yet — and make the new one active.
   * Adjusting during render rather than in an effect, same as the slug above:
   * the snippet below then reads the new drafts in this very pass.
   */
  if (state !== activeState) {
    setDrafts((prev) => ({ ...prev, byState: { ...prev.byState, [activeState]: liveDraft } }));
    setActiveState(state);
  }

  /*
   * Swap the now-active state's draft into the panel. On an orb change that
   * draft is the incoming orb's preset, since the rebuild above has already
   * run — this only has to write it to the controls.
   */
  useEffect(() => {
    const key = `${slug}:${activeState}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    const panelId = findPanelId();
    if (!panelId) return;
    pushDraftToPanel(panelId, orbDrafts[activeState]);
    // `orbDrafts` is intentionally not a dependency: this must run when the
    // selected state or orb changes, not every time a slider nudges a draft —
    // re-pushing mid-drag would fight the user's own input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, activeState, pushDraftToPanel]);

  /*
   * What the orb is actually told to draw.
   *
   * All three states go through `statePresets` / `stateColors` /
   * `stateVolumes` — the very props the snippet below emits — rather than the
   * selected one being special-cased through `params` / `colors`. The preview
   * is therefore running the exported code, not something equivalent to it, so
   * the two cannot quietly diverge. The engine still glides toward whichever
   * state is selected, so switching cross-fades into the values you authored.
   */
  const draftFor = useCallback(
    (s: OrbState) => (s === activeState ? liveDraft : orbDrafts[s]),
    [activeState, liveDraft, orbDrafts]
  );

  const statePresets = useMemo(() => {
    const out: Partial<Record<OrbState, Record<string, number>>> = {};
    for (const s of ORB_STATES) out[s] = draftFor(s).params;
    return out;
  }, [draftFor]);

  const stateColors = useMemo(() => {
    if (variant.colors.length === 0) return undefined;
    const out: Partial<Record<OrbState, Record<string, string>>> = {};
    for (const s of ORB_STATES) out[s] = draftFor(s).colors;
    return out;
  }, [draftFor, variant]);

  const stateVolumes = useMemo(() => {
    const out: Partial<Record<OrbState, { input: number; output: number }>> = {};
    for (const s of ORB_STATES) {
      const d = draftFor(s);
      if (!d.autoDrive) out[s] = { input: d.input, output: d.output };
    }
    return out;
  }, [draftFor]);

  /*
   * The export.
   *
   * Everything you authored comes out as props on the component, so it pastes
   * straight into a page — no forking the orb's file to edit its variant.
   * `statePresets`, `stateColors` and `stateVolumes` merge key by key over
   * what the orb already ships, which is why only values that actually differ
   * from its own presets are emitted: an untouched playground gives you plain
   * JSX, and a light edit gives you a couple of lines rather than a wall of
   * every param at its default.
   */
  const snippet = useMemo(() => {
    const componentName =
      orbs.find((orb) => orb.slug === slug)?.componentName ?? "Shdr11";

    const presetEntries: string[] = [];
    const colorEntries: string[] = [];
    const volumeEntries: string[] = [];

    for (const s of ORB_STATES) {
      // The very accessor the preview reads above, rather than a second copy of
      // the same rule: the code you copy cannot be built from a different set
      // of drafts than the orb you are looking at.
      const draft = draftFor(s);

      const changed = variant.params
        .filter((p) => Math.abs(draft.params[p.key] - presetValue(variant, s, p.key)) > 1e-6)
        .map((p) => `      ${p.key}: ${formatNumber(draft.params[p.key])}`);
      if (changed.length > 0) {
        presetEntries.push(`    ${s}: {\n${changed.join(",\n")}\n    }`);
      }

      const changedColors = variant.colors
        .filter(
          (c) => draft.colors[c.key].toLowerCase() !== presetColor(variant, s, c.key).toLowerCase()
        )
        .map((c) => `      ${c.key}: "${draft.colors[c.key]}"`);
      if (changedColors.length > 0) {
        colorEntries.push(`    ${s}: {\n${changedColors.join(",\n")}\n    }`);
      }

      if (!draft.autoDrive) {
        volumeEntries.push(
          `    ${s}: { input: ${formatNumber(draft.input)}, output: ${formatNumber(draft.output)} }`
        );
      }
    }

    const props = [`  size={${formatNumber(size)}}`, `  state="${state}"`];
    if (wrapper !== "none") props.push(`  wrapper="${wrapper}"`);
    if (paused) props.push("  paused");
    if (presetEntries.length > 0) {
      props.push(`  statePresets={{\n${presetEntries.join(",\n")}\n  }}`);
    }
    if (colorEntries.length > 0) {
      props.push(`  stateColors={{\n${colorEntries.join(",\n")}\n  }}`);
    }
    if (volumeEntries.length > 0) {
      props.push(`  stateVolumes={{\n${volumeEntries.join(",\n")}\n  }}`);
    }

    return `<${componentName}\n${props.join("\n")}\n/>`;
  }, [orbs, slug, variant, size, state, wrapper, paused, draftFor]);

  /*
    Tap-to-copy on the snippet, routed through the copy button rather than
    duplicating its clipboard write. Two consequences worth having: the check
    icon answers a tap on the code, and there is only one copy state to reset.

    A press that ends a selection is not a copy — you were reaching for part
    of the snippet, and firing here would overwrite the clipboard with the
    whole of it.
  */
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const copyOnTap = useCallback(() => {
    if (window.getSelection()?.toString()) return;
    copyButtonRef.current?.click();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full flex-1 flex-col p-2">
      <section className="relative flex h-[98dvh] flex-col overflow-hidden rounded-lg bg-surface">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
          <SelectedOrb
            size={size}
            state={state}
            wrapper={wrapper}
            paused={paused}
            statePresets={statePresets}
            stateColors={stateColors}
            stateVolumes={stateVolumes}
            pauseOffscreen={false}
          />
        </div>

        {/*
          Anchored to the foot of the stage, centred. `absolute` rather than
          fixed so it belongs to this panel and sits inside its rounded rect
          instead of floating over the viewport edge. The command tracks the
          dial's orb selection.
        */}
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
          <HeroInstallCommand installCommand={shadcnAddCommand(slug)} />
        </div>

        <div className="absolute left-4 top-32 shrink-0 px-4 pb-4">
          <div className="mx-auto w-max rounded-lg p-3">
            <div className="absolute -top-8 mb-2 flex justify-end">
              <CopyButton
                ref={copyButtonRef}
                value={snippet}
                className="inline-flex items-center justify-center rounded-md bg-surface-soft p-2 text-fg-strong transition-opacity duration-150 ease-out hover:opacity-90"
                iconClassName="size-5"
                resetAfter={1400}
              />
            </div>
            {/*
              The code itself copies on tap. It forwards to the button rather
              than writing to the clipboard on its own, so one press drives the
              write, the check icon and its reset together — the icon reads as
              feedback for the tap, wherever the tap landed.

              Deliberately not focusable and carrying no role: the button
              beside it is the labelled control that keyboard and screen-reader
              users reach, and this is a pointer convenience over the same
              action.
            */}
            <div
              onClick={copyOnTap}
              className="cursor-copy"
            >
              <ShikiCodeView
                code={snippet}
                lang="tsx"
                lineNumbers={false}
                animateLines
                className="max-h-[70dvh] overflow-y-auto text-xs sm:text-[13px] [&_.shiki]:!bg-transparent [&_.shiki]:![background-color:transparent]"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
