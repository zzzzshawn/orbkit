"use client";

import Link from "next/link";
import { memo } from "react";

import type { OrbComponent } from "@/lib/orb-component-map";
import type { OrbState } from "@/orbs/core/orba-core";

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
  /** Rendered orb diameter inside the card, in CSS pixels. */
  previewSize?: number;
}

/**
 * A gallery card is a link, not a button — clicking an orb opens it in the
 * playground rather than a details drawer, so tuning is one click away.
 */
export const OrbGalleryGridCard = memo(function OrbGalleryGridCard({
  item,
  PreviewComponent,
  state,
  previewSize = 190
}: OrbGalleryGridCardProps) {
  return (
    <Link
      href={`/playground?orb=${encodeURIComponent(item.slug)}`}
      className="group relative aspect-square overflow-hidden rounded-3xl bg-surface/80 transition-[transform,background-color] duration-200 ease-out focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5"
      aria-label={`Open ${item.title} in the playground`}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
        style={{ background: "var(--orb-card-glow)" }}
        aria-hidden="true"
      />

      <span className="theme-text-strong pointer-events-none absolute inset-x-2 bottom-2 z-20 rounded-md px-2 py-1 text-center text-[11px] font-medium tracking-wide">
        {item.title}
      </span>

      <span className="relative flex h-full items-center justify-center">
        {/* The orb pauses itself when scrolled out of view — see ShaderOrb. */}
        <PreviewComponent size={previewSize} state={state} />
      </span>
    </Link>
  );
});
