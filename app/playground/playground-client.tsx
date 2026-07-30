"use client";

import { DialStore, useDialKit, type DialConfig } from "dialkit";
import { GeistSans } from "geist/font/sans";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { ShikiCodeView } from "@/components/shiki-code-view";
import { orbComponentMap, orbVariantMap } from "@/lib/orb-component-map";
import { ORB_STATES, type OrbState, type OrbVariant } from "@/orbs/core/orba-core";

const PANEL_NAME = "Orb Playground";
const DEFAULT_SIZE = 420;

export interface PlaygroundOrbOption {
  slug: string;
  title: string;
  componentName: string;
}

interface PlaygroundClientProps {
  initialSlug?: string;
  orbs: PlaygroundOrbOption[];
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

/** The value a param takes at a given state when the user hasn't overridden it. */
function presetValue(variant: OrbVariant, state: OrbState, key: string): number {
  const def = variant.params.find((p) => p.key === key);
  return variant.statePresets?.[state]?.[key] ?? def?.default ?? 0;
}

function findPanelId(): string | undefined {
  return DialStore.getPanels().find((panel) => panel.name === PANEL_NAME)?.id;
}

export function PlaygroundClient({ initialSlug, orbs }: PlaygroundClientProps) {
  const fallbackSlug = orbs[0]?.slug ?? "orb-hydrogen";
  const startSlug = orbs.some((orb) => orb.slug === initialSlug)
    ? (initialSlug as string)
    : fallbackSlug;

  // `slug` mirrors the dial's `orb` select; it drives which schema builds the
  // control set, so it has to live in React state, not only in the store.
  const [slug, setSlug] = useState(startSlug);
  const variant = orbVariantMap[slug] ?? orbVariantMap[fallbackSlug];
  const SelectedOrb = orbComponentMap[slug] ?? orbComponentMap[fallbackSlug];

  const config = useMemo<DialConfig>(() => {
    const params: DialConfig = { _collapsed: false };
    for (const p of variant.params) {
      params[p.key] = [p.default, p.min, p.max, p.step];
    }

    const colors: DialConfig = { _collapsed: false };
    for (const c of variant.colors) {
      colors[c.key] = { type: "color", default: c.default };
    }

    return {
      orb: {
        type: "select",
        default: slug,
        options: orbs.map((orb) => ({ value: orb.slug, label: orb.title }))
      },
      state: {
        type: "select",
        default: "idle",
        options: ORB_STATES.map((value) => ({
          value,
          label: value[0].toUpperCase() + value.slice(1)
        }))
      },
      size: [DEFAULT_SIZE, 120, 900, 10],
      paused: false,
      params,
      ...(variant.colors.length > 0 ? { colors } : {}),
      resetParams: { type: "action", label: "Reset to state preset" }
    };
  }, [variant, slug, orbs]);

  const handleAction = useCallback(
    (action: string) => {
      if (action !== "resetParams") return;
      const panelId = findPanelId();
      if (!panelId) return;
      const state = (DialStore.getValue(panelId, "state") as OrbState) ?? "idle";
      for (const p of variant.params) {
        DialStore.updateValue(panelId, `params.${p.key}`, presetValue(variant, state, p.key));
      }
    },
    [variant]
  );

  const controls = useDialKit(PANEL_NAME, config, {
    onAction: handleAction,
    shortcuts: {
      size: { key: "s", interaction: "drag" }
    }
  });

  const state = (controls.state as OrbState) ?? "idle";
  const size = (controls.size as number) ?? DEFAULT_SIZE;
  const paused = Boolean(controls.paused);
  const rawParams = controls.params as Record<string, number> | undefined;
  const rawColors = controls.colors as Record<string, string> | undefined;
  const dialParams = useMemo(() => rawParams ?? {}, [rawParams]);
  const dialColors = useMemo(() => rawColors ?? {}, [rawColors]);

  // Adjust state during render when the dial's select changes — React re-runs
  // this component before committing, so `variant` above is rebuilt from the new
  // slug in the same pass. Doing it in an effect would cascade an extra render.
  const dialSlug = controls.orb as string | undefined;
  if (dialSlug && dialSlug !== slug && orbVariantMap[dialSlug]) {
    setSlug(dialSlug);
  }

  /*
   * Push the active state's preset into the panel whenever the state (or orb)
   * changes, so the sliders always show exactly what is being rendered. Without
   * this the orb would follow the preset while the panel still showed defaults.
   * Any slider the user moves afterwards is a genuine override.
   */
  const presetKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${slug}:${state}`;
    if (presetKeyRef.current === key) return;
    const panelId = findPanelId();
    if (!panelId) return;
    presetKeyRef.current = key;
    for (const p of variant.params) {
      DialStore.updateValue(panelId, `params.${p.key}`, presetValue(variant, state, p.key));
    }
  }, [slug, state, variant]);

  const snippet = useMemo(() => {
    const componentName =
      orbs.find((orb) => orb.slug === slug)?.componentName ?? "OrbHydrogen";

    // Compare against the active state's preset, not the schema default: the
    // component already applies that preset for this state, so emitting those
    // values would be redundant. Only genuine overrides make it into the code.
    const overrides = variant.params
      .filter((p) => {
        const value = dialParams[p.key];
        return (
          typeof value === "number" &&
          Math.abs(value - presetValue(variant, state, p.key)) > 1e-6
        );
      })
      .map((p) => `    ${p.key}: ${formatNumber(dialParams[p.key])}`);

    const lines = [`  size={${formatNumber(size)}}`, `  state="${state}"`];
    if (paused) lines.push("  paused");
    if (overrides.length > 0) {
      lines.push(`  params={{\n${overrides.join(",\n")}\n  }}`);
    }
    for (const c of variant.colors) {
      const value = dialColors[c.key];
      if (value && value.toLowerCase() !== c.default.toLowerCase()) {
        lines.push(`  colors={{ ${c.key}: "${value}" }}`);
      }
    }

    return `<${componentName}\n${lines.join("\n")}\n/>`;
  }, [orbs, slug, variant, dialParams, dialColors, size, state, paused]);

  return (
    <main className={`${GeistSans.className} mx-auto flex min-h-dvh w-full flex-1 flex-col p-2`}>
      <section className="relative flex h-[98dvh] flex-col overflow-hidden rounded-lg bg-surface">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
          <SelectedOrb
            size={size}
            state={state}
            paused={paused}
            params={dialParams}
            colors={variant.colors.length > 0 ? dialColors : undefined}
            pauseOffscreen={false}
          />
        </div>

        <div className="absolute left-4 top-22 shrink-0 px-4 pb-4">
          <div className="mx-auto w-max rounded-lg p-3">
            <div className="absolute -top-6 mb-2 flex justify-end">
              <CopyButton
                value={snippet}
                className="inline-flex items-center justify-center rounded-md bg-surface-soft p-1.5 text-fg-strong transition-opacity duration-150 ease-out hover:opacity-90"
                iconClassName="size-[16px]"
                resetAfter={1400}
              />
            </div>
            <ShikiCodeView
              code={snippet}
              lang="tsx"
              lineNumbers={false}
              className="text-xs sm:text-[13px] [&_.shiki]:!bg-transparent [&_.shiki]:![background-color:transparent]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
