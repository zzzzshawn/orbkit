"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Link from "next/link";
import { memo, type ReactNode } from "react";

import { DRAWER_CONTENT_REVEAL } from "@/components/orb-details-drawer.constants";
import { ORB_STATES, type OrbState } from "@/orbs/core/orbkit-core";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking"
};

interface DrawerPreviewPaneProps {
  selectedSlug?: string;
  selectedTitle?: string;
  selectedDescription?: string;
  preview: ReactNode;
  state: OrbState;
  onStateChange: (state: OrbState) => void;
}

/*
  Left pane of the drawer.

  Matrix puts the loader's name in the top strip; orbs carry more to say — a
  one-line note, a description, and the agent state the orb is reacting to —
  so the identity block sits under the orb instead, and the top strip keeps
  only the playground link. The orb gets the whole middle of the pane.
*/
export const DrawerPreviewPane = memo(function DrawerPreviewPane({
  selectedSlug,
  selectedTitle,
  selectedDescription,
  preview,
  state,
  onStateChange
}: DrawerPreviewPaneProps) {
  const reduceMotion = useReducedMotion();

  /*
    Matches the timing of the right panel's reveal so the two halves read as
    one gesture rather than two lists racing each other.
  */
  const revealContainer: Variants = DRAWER_CONTENT_REVEAL
    ? { hidden: {}, show: { transition: { delayChildren: 0.13, staggerChildren: 0.07 } } }
    : { hidden: {}, show: {} };
  const revealItem: Variants = !DRAWER_CONTENT_REVEAL
    ? { hidden: {}, show: {} }
    : {
      hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)" },
      show: {
        opacity: 1,
        ...(reduceMotion ? {} : { filter: "blur(0px)" }),
        transition: { duration: 0.22, ease: "easeOut" }
      }
    };

  if (!selectedTitle) {
    return null;
  }

  return (
    <motion.section
      className="flex h-full min-h-0 flex-col rounded-lg"
      variants={revealContainer}
      initial="hidden"
      animate="show"
    >
      <motion.div
        variants={revealItem}
        className="flex min-w-0 shrink-0 items-center justify-between gap-3 px-3 pt-3"
      >
        <div
          className="flex flex-wrap items-center gap-1"
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
                onClick={() => onStateChange(value)}
                className={`relative rounded-lg px-3 py-1.5 text-xs tracking-wide transition-colors duration-150 ease-out ${active ? "text-fg-strong" : "text-fg-dim hover:text-link-hover"
                  }`}
              >
                {/*
                  Same shared-pill treatment as the gallery's state selector,
                  under its OWN layoutId: the drawer opens over that selector,
                  so both are mounted at once and a shared id would have Motion
                  morph one pill between the two — the gallery's indicator
                  flying into the drawer on open.

                  Radius as an inline pixel value (8, matching rounded-lg) for
                  the usual reason: a layout animation is a scale underneath,
                  and Motion only un-distorts corners it can read in px.
                */}
                {active ? (
                  <motion.span
                    layoutId="drawer-state-indicator"
                    className="absolute inset-0 bg-preset"
                    style={{ borderRadius: 8 }}
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
        </div>

        {selectedSlug ? (
          <Link
            href={`/playground?orb=${encodeURIComponent(selectedSlug)}`}
            className="theme-text shrink-0 rounded-md hover:bg-surface-soft px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-200 ease-out bg-background hover:text-link-hover active:scale-[0.98] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            Open in playground
          </Link>
        ) : null}
      </motion.div>

      <motion.div
        variants={revealItem}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-2"
      >
        {preview}
      </motion.div>

      <motion.div variants={revealContainer} className="shrink-0 space-y-2 px-5 pb-6">
        <motion.div variants={revealItem} className="min-w-0 space-y-1">
          <h2
            className={` theme-text-strong text-2xl tracking-tighter`}
          >
            {selectedTitle}
          </h2>
        </motion.div>

        {selectedDescription ? (
          <motion.p
            variants={revealItem}
            className="theme-text-muted max-w-[65%] text-balance text- leading-relaxed"
          >
            {selectedDescription}
          </motion.p>
        ) : null}
      </motion.div>
    </motion.section>
  );
});
