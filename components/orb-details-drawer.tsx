"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  AnimatePresence,
  motion,
  scale,
  useReducedMotion,
  type Variants
} from "framer-motion";

import { playCue } from "@/lib/sound-cues";
import {
  PackageManagerInstallCard,
  TitledCodeCopyCard,
  shadcnRegistryAddCommand,
  type ShadcnPackageManager
} from "@/components/package-manager-install-toolbar";
import {
  DIALOG_CODE_SCROLL_CLASS,
  DRAWER_CONTENT_REVEAL
} from "@/components/orb-details-drawer.constants";
import "@/components/drawer-scroll-fade.css";
import { DrawerPreviewPane } from "@/components/orb-details-drawer/drawer-preview-pane";
import { ExampleUsageDotRail } from "@/components/orb-details-drawer/example-usage-dot-rail";
import { FloatingCloseCrossDots } from "@/components/orb-details-drawer/floating-close-cross-dots";
import { MeasuredCliManualDotRail } from "@/components/orb-details-drawer/measured-cli-manual-dot-rail";
import { HIDE_CODE_SCROLLBARS } from "@/lib/hide-code-scrollbar-class";
import { OrbPropsReference } from "@/lib/orb-props-reference";
import { orbVariantMap } from "@/lib/orb-component-map";
import { scopedItemName } from "@/lib/site-config";
import type { OrbState } from "@/orbs/core/orbkit-core";
import Link from "next/link";
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { filter } from "framer-motion/client";

const MemoOrbPropsReference = memo(OrbPropsReference);

/*
  Ported from Dot Matrix's LoaderDetailsDrawer so the two sites behave
  identically: same Base UI dialog, same two sliding panels, same 190ms
  transition, same CLI / Manual dot rails and code cards.

  Diverges from the reference in two related ways, both in the tree below.

  It no longer uses two sibling Dialog.Popups. Base UI treats one popup per
  root as THE dialog and everything else as background, so the second one was
  getting aria-hidden="true" and data-base-ui-inert — the preview panel and
  its state pills were hidden from screen readers while plainly visible and
  clickable. There is now a single popup spanning the viewport with both
  panels inside it, which reads correctly and looks identical.

  And the transitions are Motion's rather than data-starting-style CSS, which
  is what the one popup buys: both panels share a presence, so they enter and
  leave together off a single AnimatePresence instead of two independently
  timed CSS transitions that could drift.
*/

/** The timing the CSS transitions used, kept so the drawer feels unchanged. */
const DRAWER_EASE = { type: "spring", stiffness: 325, damping: 35 } as const;

export interface OrbDetailsCard {
  slug: string;
  title: string;
  description: string;
  componentName: string;
  sourceCode: string;
}

export type ExamplePreviewId = "ex-all";

interface OrbDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: OrbDetailsCard | null;
  preview: ReactNode;
  activeExamplePreviewId: ExamplePreviewId | null;
  onExamplePreview: (id: ExamplePreviewId) => void;
  state: OrbState;
  onStateChange: (state: OrbState) => void;
}

export function OrbDetailsDrawer({
  open,
  onOpenChange,
  selected,
  preview,
  activeExamplePreviewId,
  onExamplePreview,
  state,
  onStateChange
}: OrbDetailsDrawerProps) {
  /*
    Base UI holds the dialog mounted until this is called — see the Portal
    below. Without it the popup would vanish on close and the exit animation
    would have nothing left to animate.
  */
  const actionsRef = useRef<Dialog.Root.Actions>(null);
  const reduceMotion = useReducedMotion();

  /*
    Both panels take the same shape so the props spread cleanly. Normal motion
    slides and never touches opacity, which is what the CSS did; reduced motion
    holds them still and fades instead — gentler rather than absent.
  */
  /*
    Content reveal, once the panels are most of the way in.

    `revealItem(false)` is for anything wrapping a backdrop-filter — the
    install card holds a copy button with `backdrop-blur-[2px]`, and a filter
    on an ancestor starts a new backdrop root, which would stop it sampling.
    Motion also leaves `filter: blur(0px)` behind once it lands, so the
    breakage would outlive the animation. Those blocks fade without blurring.
  */
  const revealContainer: Variants = DRAWER_CONTENT_REVEAL
    ? { hidden: {}, show: { transition: { delayChildren: 0.13, staggerChildren: 0.07 } } }
    : { hidden: {}, show: {} };
  const revealItem = (blur: boolean): Variants =>
    !DRAWER_CONTENT_REVEAL
      ? { hidden: {}, show: {} }
      : {
          hidden: blur && !reduceMotion ? { opacity: 0, filter: "blur(8px)" } : { opacity: 0 },
          show: {
            opacity: 1,
            ...(blur && !reduceMotion ? { filter: "blur(0px)" } : {}),
            transition: { duration: 0.22, ease: "easeOut" }
          }
        };

  const panelMotion = (enter: string, leave: string) => ({
    initial: reduceMotion ? { x: 0, opacity: 0 } : { x: enter, opacity: 0, filter: "blur(20px)", scale: 0.8 },
    animate: { x: 0, opacity: 1, filter: "blur(0px)", scale: 1 },
    exit: reduceMotion ? { x: 0, opacity: 0 } : { x: leave, opacity: 0, filter: "blur(20px)", scale: 0.8 }
  });

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cli" | "manual">("cli");
  /*
    Manual sits to the right of CLI on the rail, so its panel arrives from the
    right (1) and CLI's from the left (-1). The direction is stored with the
    tab so the exiting panel, which can no longer see fresh props, still
    slides the right way through `custom`.
  */
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const selectTab = useCallback((tab: "cli" | "manual") => {
    setTabDirection(tab === "manual" ? 1 : -1);
    setActiveTab(tab);
  }, []);

  /* Tab panels slide in the direction of travel; reduced motion crossfades instead. */
  const tabSlide: Variants = {
    enter: (direction: number) =>
      reduceMotion ? { x: 0, opacity: 0, } : { x: `${50 * direction}%`, opacity: 0, filter: "blur(10px)" },
    center: { x: 0, opacity: 1, filter: "blur(0px)" },
    exit: (direction: number) =>
      reduceMotion ? { x: 0, opacity: 0 } : { x: `${-50 * direction}%`, opacity: 0, filter: "blur(10px)" }
  };
  const tabSlideTransition = { type: "spring" as const, stiffness: 420, damping: 38 } as const;
  const [packageManager, setPackageManager] = useState<ShadcnPackageManager>("pnpm");
  const installCommand = selected
    ? shadcnRegistryAddCommand(packageManager, scopedItemName(selected.slug))
    : "";
  const demoUsageCode = selected
    ? `import { ${selected.componentName} } from "@/components/ui/${selected.slug}";

export function Example() {
  return <${selected.componentName} />;
}`
    : "";

  /*
    One example rather than four, showing every prop the orb takes.

    Built from the orb's OWN schema — its first param and first colour, with
    their real defaults — so the snippet compiles against the component it sits
    next to. The old per-topic cards hardcoded `speed` and `tint`, and neither
    exists on most orbs, so they were showing code that would not typecheck.

    `className` and `style` are the two props left out: they size the canvas,
    which directly contradicts the `size` prop shown here, and the props table
    below already documents them.
  */
  const propExampleCards = useMemo(() => {
    if (!selected) {
      return [];
    }
    const C = selected.componentName;
    const variant = orbVariantMap[selected.slug];
    const p = variant?.params[0];
    const c = variant?.colors[0];
    const pKey = p?.key ?? "speed";
    const pVal = p ? Number((p.default + p.step * 4).toFixed(3)) : 1.4;
    const pAlt = p ? Number((p.default + p.step * 8).toFixed(3)) : 1.8;

    // Every state spelled out, so the three-state shape of these props is
    // visible rather than implied by a single entry.
    const colourLines = c
      ? [
          `      colors={{ ${c.key}: "${c.default}" }}`,
          `      stateColors={{`,
          `        idle: { ${c.key}: "${c.default}" },`,
          `        thinking: { ${c.key}: "${c.default}" },`,
          `        speaking: { ${c.key}: "${c.default}" }`,
          `      }}`
        ]
      : [];

    const lines = [
      `      size={280}`,
      `      state="speaking"`,
      `      params={{ ${pKey}: ${pVal} }}`,
      ...colourLines,
      `      statePresets={{`,
      `        idle: { ${pKey}: ${p ? p.default : 0.9} },`,
      `        thinking: { ${pKey}: ${pVal} },`,
      `        speaking: { ${pKey}: ${pAlt} }`,
      `      }}`,
      `      stateVolumes={{`,
      `        idle: { input: 0, output: 0.2 },`,
      `        thinking: { input: 0.1, output: 0.45 },`,
      `        speaking: { input: 0.2, output: 0.8 }`,
      `      }}`,
      `      volumes={{ input: 0, output: 0.6 }}`,
      `      wrapper="ring"`,
      `      wrapperColor="currentColor"`,
      `      paused={false}`,
      `      pauseOffscreen`,
      `      maxDpr={1.5}`,
      `      ariaLabel="Assistant status"`
    ];

    return [
      {
        id: "ex-all" as const,
        title: "Every prop",
        copyToken: "example-usage-all" as const,
        code: `import { ${C} } from "@/components/ui/${selected.slug}";

export function Example() {
  return (
    <${C}
${lines.join("\n")}
    />
  );
}`
      }
    ];
  }, [selected]);

  // Every orb opens on the CLI tab with pnpm selected. Reset during render
  // rather than in an effect — orbkit's lint bans setState in an effect body
  // (cascading renders), and this is the documented derived-state form.
  const slug = selected?.slug;
  const [tabSlug, setTabSlug] = useState(slug);
  if (slug !== tabSlug) {
    setTabSlug(slug);
    setActiveTab("cli");
    setPackageManager("pnpm");
  }

  const copySnippet = useCallback(async (token: string, content: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedToken(token);
      playCue("success");
      window.setTimeout(() => {
        setCopiedToken((prev) => (prev === token ? null : prev));
      }, 1400);
    } catch {
      // Copy failed in an unsupported environment; at least say so.
      playCue("error");
    }
  }, []);

  const exampleUsageCardList = useMemo(
    () => (
      <div className="grid gap-3">
        <p className="theme-text-strong text-base font-semibold tracking-tight">Example usage</p>
        {propExampleCards.map((card) => {
          const active = activeExamplePreviewId === card.id;
          return (
            <TitledCodeCopyCard
              key={card.id}
              title={card.title}
              titleEnd={
                <button
                  type="button"
                  onClick={() => onExamplePreview(card.id)}
                  className={[
                    "theme-text shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums transition",
                    "focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)",
                    active
                      ? "border-border bg-shell-overlay"
                      : "border-transparent bg-code-bg hover:text-link-hover"
                  ].join(" ")}
                  aria-pressed={active}
                >
                  Preview
                </button>
              }
              code={card.code}
              highlightLang="tsx"
              copied={copiedToken === card.copyToken}
              onCopy={() => copySnippet(card.copyToken, card.code)}
              copyAriaLabel={`Copy ${card.title} example`}
              codeBlockClassName={HIDE_CODE_SCROLLBARS}
              codeScrollClassName={DIALOG_CODE_SCROLL_CLASS}
              titleClassName="theme-text min-w-0 text-left text-xs font-medium normal-case tracking-normal"
              showCodeLineNumbers={false}
            />
          );
        })}
      </div>
    ),
    [activeExamplePreviewId, copiedToken, copySnippet, onExamplePreview, propExampleCards]
  );

  return (
    <Dialog.Root
      open={open}
      /*
        `preventUnmountOnClose()` is the piece that makes a JS exit possible at
        all. By default Base UI waits for a CSS transition on the popup and
        then unmounts — and with the transitions gone there is nothing to wait
        for, so it unmounted at once and stamped `hidden` on the popup
        (DialogPopup sets `hidden: !mounted`). Motion was then animating an
        invisible element, which is why the exit looked instant. Calling this
        holds `mounted` true until we say otherwise, which is what the
        `unmount()` below is for.
      */
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen) {
          eventDetails.preventUnmountOnClose();
          playCue("droplet");
        }
        onOpenChange(nextOpen);
      }}
      actionsRef={actionsRef}
    >
      {/*
        Motion owns the transitions, so Base UI must not unmount on close or
        the exit would never get to play. `actionsRef` hands us the unmount
        call and waits; `keepMounted` keeps the portal in place meanwhile.
        AnimatePresence fires `unmount()` once the last child has finished.
      */}
      <Dialog.Portal keepMounted>
        <AnimatePresence onExitComplete={() => actionsRef.current?.unmount()}>
          {open ? (
            <>
              <Dialog.Backdrop
                className="fixed inset-0 z-50 bg-backdrop backdrop-blur-[7px]"
                render={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={DRAWER_EASE}
                  />
                }
              />
              <Dialog.Viewport className="fixed inset-0 z-50">
                {/*
                  ONE popup spanning the viewport, with both panels as its
                  children. Base UI treats a single Dialog.Popup per root as
                  THE dialog and marks every other one aria-hidden and inert —
                  which used to hide the preview pane from screen readers even
                  though it was visible and clickable. It is also what lets the
                  two panels share a presence, so they enter and leave together
                  off one AnimatePresence rather than racing two.
                */}
                <Dialog.Popup className="pointer-events-none absolute inset-0">
                  <motion.div
                    {...panelMotion("-100%", "-100%")}
                    transition={DRAWER_EASE}
                    className="will-change-[transform,opacity,filter] motion-reduce:will-change-auto pointer-events-auto absolute inset-y-2 left-2 hidden h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(50%-0.75rem)] flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg bg-surface md:flex origin-left"
                  >
                    <DrawerPreviewPane
                      selectedSlug={selected?.slug}
                      selectedTitle={selected?.title}
                      selectedNote={selected ? orbVariantMap[selected.slug]?.note : undefined}
                      selectedDescription={selected?.description}
                      preview={preview}
                      state={state}
                      onStateChange={onStateChange}
                    />
                  </motion.div>
                  <motion.div
                    {...panelMotion("100%", "100%")}
                    transition={DRAWER_EASE}
                    className="drawer-scroll-scope will-change-[transform,opacity,filter] motion-reduce:will-change-auto pointer-events-auto absolute inset-y-2 left-2 right-2 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] min-h-0 w-auto flex-col overflow-hidden rounded-lg bg-surface md:left-auto md:right-2 md:w-[calc(50%-0.75rem)] origin-right"
                  >
                    <div
                      className="drawer-bottom-fade pointer-events-none absolute inset-x-0 bottom-0 z-50 h-16 backdrop-blur-[2px]"
                      style={{
                        backgroundImage: "var(--drawer-fade)",
                        WebkitMaskImage:
                          "linear-gradient(to top, var(--color-fg-strong) 0%, var(--color-fg-strong) 40%, transparent 100%)",
                        maskImage:
                          "linear-gradient(to top, var(--color-fg-strong) 0%, var(--color-fg-strong) 40%, transparent 100%)"
                      }}
                    />
                    <div
                      className="drawer-bottom-fade pointer-events-none absolute inset-x-0 bottom-0 z-50 h-30 backdrop-blur-[3px]"
                      style={{
                        backgroundImage: "var(--drawer-fade)",
                        WebkitMaskImage:
                          "linear-gradient(to top, var(--color-fg-strong) 0%, var(--color-fg-strong) 40%, transparent 100%)",
                        maskImage:
                          "linear-gradient(to top, var(--color-fg-strong) 0%, var(--color-fg-strong) 40%, transparent 100%)"
                      }}
                    />

                    {selected ? (
                      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden sm:px-1.5">
                        <div className="shrink-0 px-4 pt-4">
                          <MeasuredCliManualDotRail activeTab={activeTab} onTabChange={selectTab} />
                        </div>
                        <section className="drawer-scroll-source relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pt-2 pb-6">
                          <AnimatePresence mode="popLayout" initial={false} custom={tabDirection}>
                            <motion.div
                              key={activeTab}
                              custom={tabDirection}
                              variants={tabSlide}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={tabSlideTransition}
                              className="min-w-0"
                            >
                          {activeTab === "cli" ? (
                            <motion.div
                              className="grid gap-4"
                              variants={revealContainer}
                              initial="hidden"
                              animate="show"
                            >
                              <motion.div variants={revealItem(false)} className="min-w-0">
                              <PackageManagerInstallCard
                                value={packageManager}
                                onValueChange={setPackageManager}
                                copied={copiedToken === "install-command"}
                                onCopy={() => copySnippet("install-command", installCommand)}
                                command={installCommand}
                                codeBlockClassName={HIDE_CODE_SCROLLBARS}
                                codeScrollClassName={DIALOG_CODE_SCROLL_CLASS}
                              />
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="min-w-0">
                              <TitledCodeCopyCard
                                title="Demo Usage"
                                code={demoUsageCode}
                                highlightLang="tsx"
                                copied={copiedToken === "demo-usage"}
                                onCopy={() => copySnippet("demo-usage", demoUsageCode)}
                                copyAriaLabel="Copy demo usage"
                                codeBlockClassName={HIDE_CODE_SCROLLBARS}
                                codeScrollClassName={DIALOG_CODE_SCROLL_CLASS}
                              />
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="grid min-w-0 gap-4">
                                {exampleUsageCardList}
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="min-w-0">
                                <MemoOrbPropsReference slug={selected.slug} />
                              </motion.div>
                            </motion.div>
                          ) : (
                            <motion.div
                              className="flex min-h-0 flex-col gap-4"
                              variants={revealContainer}
                              initial="hidden"
                              animate="show"
                            >
                              <motion.div variants={revealItem(true)} className="grid min-w-0 shrink-0 gap-1">
                                <h3 className="theme-text text-lg">Manual Usage</h3>
                                <p className="theme-text text-sm leading-relaxed">
                                  You need to manually create the shared runtime file before using
                                  individual orbs. Follow the{" "}
                                  <Link
                                    href="/getting-started/manual"
                                    className="theme-link underline underline-offset-4"
                                  >
                                    Getting Started Manually
                                  </Link>{" "}
                                  guide first.
                                </p>
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="flex min-h-0 min-w-0 flex-col">
                              <TitledCodeCopyCard
                                title={`components/ui/${selected.slug}.tsx`}
                                titleClassName="theme-text-dim truncate text-left font-mono text-xs font-medium normal-case tracking-normal"
                                code={selected.sourceCode}
                                highlightLang="tsx"
                                shellClassName="flex min-h-0 flex-col"
                                codeWrapperClassName="flex min-h-0 flex-col"
                                codeBlockClassName="min-h-0"
                                codeScrollClassName={DIALOG_CODE_SCROLL_CLASS}
                                copied={copiedToken === "orb-source"}
                                onCopy={() => copySnippet("orb-source", selected.sourceCode)}
                                copyAriaLabel="Copy orb source"
                              />
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="grid min-w-0 gap-4">
                                {exampleUsageCardList}
                              </motion.div>
                              <motion.div variants={revealItem(true)} className="min-w-0">
                                <MemoOrbPropsReference slug={selected.slug} />
                              </motion.div>
                            </motion.div>
                          )}
                            </motion.div>
                          </AnimatePresence>
                        </section>
                      </div>
                    ) : null}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: 0.17 } }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="will-change-[transform,opacity] motion-reduce:will-change-auto pointer-events-none absolute inset-x-0 max-sm:bottom-1 sm:top-1/2 sm:-translate-y-1/2 z-50 flex justify-center"
                  >
                    <Dialog.Close
                      aria-label="Close dialog"
                      data-cue="none"
                      className="pointer-events-auto inline-grid place-items-center rounded-lg bg-bg p-2 h-max text-fg-strong"
                    >
                      <FloatingCloseCrossDots />
                    </Dialog.Close>
                  </motion.div>
                </Dialog.Popup>
              </Dialog.Viewport>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
