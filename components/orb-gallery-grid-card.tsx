"use client";

import { motion, useReducedMotion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";

import type { OrbComponent } from "@/lib/orb-component-map";
import type { OrbState } from "@/orbs/core/orbkit-core";

export interface OrbCard {
  slug: string;
  title: string;
  description: string;
  componentName: string;
}

interface OrbGalleryGridCardProps {
  item: OrbCard;
  PreviewComponent: OrbComponent;
  state: OrbState;
  /** Opens the details drawer for this orb. */
  onSelect: (slug: string) => void;
  /** Rendered orb diameter inside the card, in CSS pixels. */
  previewSize?: number;
  /** Seconds to wait before this card fades in, for the page-load stagger. */
  enterDelay?: number;
}

/*
 * Page-wide budget of live orb previews.
 *
 * Every mounted orb holds a WebGL context, and browsers cap those per page
 * at ~16 — past the cap the oldest context is evicted, its orb re-requests
 * it, the restore evicts the next-oldest, and the cascade blanks every
 * canvas on the page. The budget makes that unreachable: at most
 * MAX_LIVE_PREVIEWS cards hold a context at once, whatever the viewport
 * shows, and the rest wait for a slot.
 *
 * 9: the mark in the header and the one in the footer each hold a context on
 * every page, and this page adds its own hero mark, so three of the cap are
 * spoken for before a single card mounts — and nine cards is three full rows
 * of the grid, which is what the viewport shows at once.
 */
const MAX_LIVE_PREVIEWS = 9;
let livePreviewCount = 0;
const slotWaiters = new Set<() => void>();

function releasePreviewSlot() {
  livePreviewCount--;
  // Wake waiters on a fresh task — a release happens during one card's
  // effect cleanup, and another card's state must not change mid-commit.
  const waiters = [...slotWaiters];
  slotWaiters.clear();
  setTimeout(() => {
    for (const wake of waiters) wake();
  }, 0);
}

/**
 * Near-viewport tracking. Starts TRUE — previews must never depend on the
 * observer actually delivering (throttled documents delay it indefinitely,
 * and the budget above keeps the initial burst under the context cap
 * anyway). Once the observer does deliver, it takes over granting and
 * revoking nearness as the user scrolls, which is what hands slots from
 * scrolled-away cards to the rows coming into view.
 */
function useNearViewport(margin: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setNear(Boolean(entries[0]?.isIntersecting)),
      { rootMargin: margin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin]);

  return { ref, near };
}

/** Holds one of the page-wide preview slots while `wanted` is true. */
function usePreviewSlot(wanted: boolean) {
  const [live, setLive] = useState(false);
  const holding = useRef(false);

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    const tryAcquire = () => {
      if (!active || holding.current) return;
      if (livePreviewCount < MAX_LIVE_PREVIEWS) {
        livePreviewCount++;
        holding.current = true;
        setLive(true);
      } else {
        slotWaiters.add(tryAcquire);
      }
    };
    // Deferred a tick: acquisition sets state, and a sync setState in an
    // effect trips the compiler lint. Slot wakes are already async.
    const id = setTimeout(tryAcquire, 0);
    return () => {
      active = false;
      clearTimeout(id);
      slotWaiters.delete(tryAcquire);
      if (holding.current) {
        holding.current = false;
        releasePreviewSlot();
      }
      setLive(false);
    };
  }, [wanted]);

  return live;
}

/**
 * True once `wait` ms have gone by without `resolved` turning true.
 *
 * Gates the placeholder below. Every card starts without a slot and takes one
 * on the very next tick, so a placeholder rendered on `!live` alone appeared
 * in EVERY card for a frame on first paint — a pulsing disc announcing a wait
 * that was already over, which is the flash you see on load. Cards genuinely
 * queued behind the slot budget still cross this threshold and show it.
 */
function useWaitExceeds(resolved: boolean, wait: number) {
  const [waited, setWaited] = useState(false);

  // Only the timer ever sets state; nothing resets it, because the guard on
  // the way out already hides the placeholder for as long as a slot is held.
  useEffect(() => {
    if (resolved) return;
    const id = setTimeout(() => setWaited(true), wait);
    return () => clearTimeout(id);
  }, [resolved, wait]);

  return waited && !resolved;
}

/**
 * A gallery card is a button, not a link — clicking an orb opens its details
 * drawer in place rather than navigating away, so browsing the grid never
 * costs a page load. The drawer links on to the playground for tuning.
 */
export const OrbGalleryGridCard = memo(function OrbGalleryGridCard({
  item,
  PreviewComponent,
  state,
  onSelect,
  previewSize = 220,
  enterDelay = 0
}: OrbGalleryGridCardProps) {
  const reduceMotion = useReducedMotion();
  const { ref, near } = useNearViewport("100px 0px");
  const live = usePreviewSlot(near);
  // Long enough that the take-a-slot-next-tick case never paints it.
  const waiting = useWaitExceeds(live, 200);

  return (
    /*
      The root is the motion element rather than a wrapper around it: this is a
      grid item AND carries `aspect-square`, so an extra div between the two
      would take the cell and leave the button sizing to its content.
    */
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: reduceMotion ? 0 : enterDelay }}
      data-cue="bloom"
      onClick={() => onSelect(item.slug)}
      className="group relative aspect-square overflow-hidden rounded-[36px] bg-surface/60 transition-[transform,background-color]  ease-out focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none"
      aria-label={`View ${item.title} details`}
    >
      {/*
        Hover: a dot matrix that only reads around the rim.

        The mask is `closest-side`, so its 100% lands on the edge midpoints
        rather than the corners — that clears the middle, where the orb is,
        and lets the field build toward all four edges evenly instead of
        pooling in the corners the way a farthest-corner circle would. It
        stays fully clear until 62%, so what survives is a band hugging the
        border rather than a wash across the card.

        The grid is tight (4px) with dots well under half that, which is what
        keeps it reading as a matrix instead of the haze you get once the dots
        start meeting. Drawn in currentColor so the card carries its theme.
      */}
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-35"
        style={{
          backgroundImage: "radial-gradient(currentColor 0.3px, transparent 1px)",
          backgroundSize: "3px 3px",
          maskImage: "radial-gradient(ellipse closest-side, transparent 62%, black 260%)",
          WebkitMaskImage: "radial-gradient(ellipse closest-side, transparent 62%, black 260%)"
        }}
        aria-hidden="true"
      />

      <span className="theme-text-strong pointer-events-none absolute inset-x-2 bottom-2 z-20 rounded-md px-2 py-1 text-center text-[12px] font-medium text-[#ffffff]/60!">
        {item.title}
      </span>

      <span ref={ref} className="relative flex h-full items-center justify-center">
        {/* Live only while holding a preview slot — see the budget above.
            pauseOffscreen off: the orb's internal IntersectionObserver is
            what it gates DRAWING on, and observer delivery is unreliable
            (throttled documents defer it indefinitely) — cards were mounting
            healthy contexts that never painted. The slot system already
            unmounts far-away cards wholesale, which is a stronger version of
            the same optimization, so the orb should just draw while mounted
            — exactly what the playground does for the same reason.
            maxDpr 1.5: many volumetric shaders animate at once on this grid,
            and at ~190px the retina-vs-1.5x difference is invisible on these
            soft looks while the fragment work drops by almost half. */}
        {live ? (
          <PreviewComponent
            size={previewSize}
            state={state}
            maxDpr={1.5}
            pauseOffscreen={false}
          />
        ) : waiting ? (
          // skeleton orb while the card waits for a preview slot: an
          // orb-shaped disc in the theme's raised surface tone, shaded like
          // a sphere and pulsing until the real shader takes over
          <span
            aria-hidden="true"
            className="animate-pulse rounded-full motion-reduce:animate-none"
            style={{
              width: previewSize * 0.82,
              height: previewSize * 0.82,
              background:
                "radial-gradient(circle at 38% 32%, var(--color-surface-raised), var(--color-surface-soft) 72%)"
            }}
          />
        ) : null}
      </span>
    </motion.button>
  );
});
