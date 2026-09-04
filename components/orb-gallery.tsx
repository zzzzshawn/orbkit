"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

import { HeroInstallCommand } from "@/components/hero-install-command";
import {
  OrbDetailsDrawer,
  type ExamplePreviewId,
  type OrbDetailsCard
} from "@/components/orb-details-drawer";
import { OrbGalleryGridCard } from "@/components/orb-gallery-grid-card";
import { OrbMark } from "@/components/orb-mark";
import { orbComponentMap, orbVariantMap } from "@/lib/orb-component-map";
import { shadcnAddCommand } from "@/lib/site-config";
import { ORB_STATES, type OrbState } from "@/orbs/core/orbkit-core";

/*
  Page entrance. The header blurs in top-down, then the grid follows.

  Cards take opacity ONLY: `filter` is not a compositor-only property, so
  blurring thirty-one of them at once means thirty-one live filter passes
  during the very frames the shaders are compiling. The eye reads the whole
  thing as one gesture either way.
*/
const ENTER_EASE = { duration: 0.5, ease: "easeOut" } as const;
const HEADER_STEP = 0.09;
const GRID_START = 0.54;
const CARD_STEP = 0.035;
/** Past this the cards arrive with the last staggered one — nobody is waiting
    on a card two screens down, and the tail would run for a full second. */
const CARD_STAGGER_CAP = 12;

/** Most of the orbs are referenced from XorDev's shader work. */
const XORDEV_URL = "https://x.com/XorDev";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking"
};

export function OrbGallery({ items }: { items: OrbDetailsCard[] }) {
  // Orbs have no color prop — their equivalent "try it" control is the agent
  // state, so the whole grid switches state together.
  const [state, setState] = useState<OrbState>("idle");

  // The drawer keeps rendering the orb it was opened with while it slides
  // out, so the slug is cleared on exit rather than at close — otherwise the
  // panels empty out mid-animation.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [examplePreviewId, setExamplePreviewId] = useState<ExamplePreviewId | null>(null);
  const selected = items.find((item) => item.slug === selectedSlug) ?? null;

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setSelectedSlug(null);
      setExamplePreviewId(null);
    }
  }, []);

  const handleSelect = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setExamplePreviewId(null);
  }, []);

  // Clicking Preview on an example card reconfigures the orb in the left pane
  // to match that snippet, so the code and the thing you are looking at agree.
  const handleExamplePreview = useCallback((id: ExamplePreviewId) => {
    setExamplePreviewId((prev) => (prev === id ? null : id));
  }, []);

  const drawerPreview = useMemo(() => {
    if (!selected) return null;
    const Component = orbComponentMap[selected.slug];
    if (!Component) return null;

    const variant = orbVariantMap[selected.slug];
    const p = variant?.params[0];
    const c = variant?.colors[0];

    switch (examplePreviewId) {
      /*
        Mirrors the drawer's single "Every prop" snippet, so pressing Preview
        shows the thing that code would actually render. Values come off the
        orb's own schema for the same reason the snippet does — a hardcoded
        param name is wrong for most of the gallery.
      */
      case "ex-all":
        return (
          <Component
            size={320}
            state="speaking"
            params={p ? { [p.key]: Number((p.default + p.step * 4).toFixed(3)) } : undefined}
            colors={c ? { [c.key]: c.default } : undefined}
            statePresets={
              p ? { thinking: { [p.key]: Number((p.default + p.step * 8).toFixed(3)) } } : undefined
            }
            stateColors={c ? { speaking: { [c.key]: c.default } } : undefined}
            stateVolumes={{ speaking: { input: 0.2, output: 0.8 } }}
            wrapper="ring"
            maxDpr={1.5}
            ariaLabel="Assistant status"
            pauseOffscreen={false}
          />
        );
      default:
        // pauseOffscreen off: the orb gates drawing on its own
        // IntersectionObserver, and inside a portaled dialog that delivery is
        // unreliable — same reason the grid cards turn it off.
        return <Component size={320} state={state} pauseOffscreen={false} />;
    }
  }, [selected, examplePreviewId, state]);

  const reduceMotion = useReducedMotion();

  /*
    Reduced motion keeps the fade and drops the blur — gentler, not absent.
    Both branches share a key shape so the props spread stays type-clean.
  */
  const enterFrom = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(10px)" },
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" },
    transition: { ...ENTER_EASE, delay }
  });

  /*
    Opacity only, for anything wrapping a backdrop-filter.

    A `filter` on an ancestor starts a new backdrop root, so a descendant's
    backdrop-filter stops sampling the page behind it — and Motion leaves
    `filter: blur(0px)` on the element once the animation lands, which is
    still a filter, so the breakage outlives the entrance. The orb mark's
    glass lens is exactly that case.
  */
  const fadeIn = (delay: number) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { ...ENTER_EASE, delay }
  });

  const firstSlug = items[0]?.slug ?? "shdr-11";
  const installCommand = shadcnAddCommand(firstSlug);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:gap-10 lg:px-8">
      <section>
        <div className="mt-10 grid gap-6 sm:mt-8 lg:grid-cols-[1.4fr_auto] lg:items-end">

          <div className="flex flex-col gap-8 items-center justify-center">
            <motion.div {...fadeIn(0)}>
              <OrbMark size={140} className="text-foreground" />
            </motion.div>
            <div className="flex flex-col items-center justify-center gap-4">
              <motion.h1 {...enterFrom(HEADER_STEP)} className="tracking-tighter text-4xl">
                Shader Orbs
              </motion.h1>
              <motion.p
                {...enterFrom(HEADER_STEP * 2)}
                className="max-w-sm text-center text-base tracking-tight"
              >
                A collection of free and open-source WebGL orbs, built with React, TypeScript,
                and shadcn.
              </motion.p>
            </div>
          </div>
        </div>
        <motion.div {...enterFrom(HEADER_STEP * 3)} className="mt-8 flex justify-center">
          <HeroInstallCommand installCommand={installCommand} />
        </motion.div>
      </section>

      <section className="flex flex-col items-center">

        <motion.div
          {...enterFrom(HEADER_STEP * 4)}
          className="flex flex-wrap justify-center items-center gap-1 mt-6"
          role="radiogroup"
          aria-label="Preview agent state"
        >
          {ORB_STATES.map((value) => {
            const active = value === state;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                data-cue="chime"
                onClick={() => setState(value)}
                className={`relative rounded-xl px-4 py-2 text-xs tracking-tight transition-colors duration-150 ease-out sm:text-sm ${active ? "text-fg-strong" : "text-fg-dim hover:text-link-hover"
                  }`}
              >
                {/*
                  One pill shared by all three buttons: it unmounts here and
                  mounts under the next one, and the matching layoutId is what
                  makes Motion glide it across instead of cutting.

                  The radius is an inline PIXEL value on purpose — a layout
                  animation is a scale underneath, which distorts corners, and
                  Motion only corrects for that when it can read the radius in
                  px rather than off `rounded-xl`.
                */}
                {active ? (
                  <motion.span
                    layoutId="orb-state-indicator"
                    className="absolute inset-0 bg-preset"
                    style={{ borderRadius: 12 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 450, damping: 37 }
                    }
                  />
                ) : null}
                <span className="relative z-10">{STATE_LABELS[value]}</span>
              </button>
            );
          })}
        </motion.div>
      </section>

      <section
        id="orb-grid"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 max-w-4xl 2xl:max-w-5xl w-full mx-auto"
      >
        {items.map((item, i) => {
          const PreviewComponent = orbComponentMap[item.slug];
          if (!PreviewComponent) return null;
          return (
            <OrbGalleryGridCard
              key={item.slug}
              item={item}
              PreviewComponent={PreviewComponent}
              state={state}
              onSelect={handleSelect}
              enterDelay={GRID_START + Math.min(i, CARD_STAGGER_CAP) * CARD_STEP}
            />
          );
        })}
      </section>

      <motion.aside
        {...enterFrom(GRID_START + CARD_STAGGER_CAP * CARD_STEP)}
        aria-label="Credits"
        className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-center 2xl:max-w-5xl my-20 sm:my-30"
      >
        <a
          href={XORDEV_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="@XorDev on X"
          className="group rounded-full transition-transform duration-200 ease-out hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-[#000] p-1 shadow-[0_-1px_1px_#808080,0_0_0_0.5px_#ffffff27] "
        >
          <Image
            src="/xordev.jpg"
            alt="@XorDev profile picture"
            width={56}
            height={56}
            className="size-18 select-none rounded-full ring-fg-dim/30 group-hover:ring-fg-dim/60 transition-[box-shadow] duration-200 ease-out"
          />
        </a>
        <p className="max-w-prose text-pretty text-sm leading-relaxed tracking-tight text-fg-muted sm:text-base">
          Credits: most of these orbs are referenced from shaders by{" "}
          <a
            href={XORDEV_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-fg-dim/50 underline-offset-4 transition-colors duration-200 ease-out hover:text-link-hover hover:decoration-link-hover focus-visible:text-link-hover"
          >
            @XorDev
          </a>{" "}
          on X. Go check out his account. It is a goldmine of shader art and
          techniques.
        </p>
      </motion.aside>

      <OrbDetailsDrawer
        open={Boolean(selected)}
        onOpenChange={handleOpenChange}
        selected={selected}
        preview={drawerPreview}
        activeExamplePreviewId={examplePreviewId}
        onExamplePreview={handleExamplePreview}
        state={state}
        onStateChange={setState}
      />
    </main>
  );
}
