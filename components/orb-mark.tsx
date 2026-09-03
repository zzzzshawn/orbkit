"use client";

import { orbComponentMap } from "@/lib/orb-component-map";

const MarkOrb = orbComponentMap["shdr-11"];

/**
 * The size the mark's geometry was drawn at. Every measurement below is a
 * ratio of it, so the whole thing scales from a header chip to a plaque
 * without redrawing anything.
 */
const BASE = 140;

export interface OrbMarkProps {
  /** Rendered edge length in px. */
  size?: number;
  className?: string;
}

/**
 * The Orba mark: a dashed globe wireframe with a live shader orb sitting
 * inside it under a glass lens.
 *
 * Deliberately plate-less — it draws in `currentColor` and expects to sit on
 * the page, so it inherits the surrounding text colour and works on either
 * theme without configuration. Anything placing it on its own filled chip has
 * to set a colour that reads against that fill.
 *
 * Note this mounts a WebGL context per instance. That is cheap at one or two
 * per page, but it counts against the browser's ~16-context cap, which the
 * gallery's own preview budget is also drawing from.
 */
export function OrbMark({ size = BASE, className }: OrbMarkProps) {
  const k = size / BASE;

  /*
    Stroke and dash are expressed in viewBox units, so they shrink with the
    box. Dividing by the scale cancels that out and holds the dash rhythm at a
    constant ~2 device pixels — without it the wireframe collapses into a
    faint solid line at header size.
  */
  const stroke = 0.8 / k;
  const dash = 2 / k;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {/*
        The limb plus three latitudes and the equator, all sharing one rx so
        they read as a single sphere the orb sits inside. Drawn before the orb
        so the lines pass behind it.
      */}
      <svg
        viewBox={`0 0 ${BASE} ${BASE}`}
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <g stroke="currentColor" strokeWidth={stroke} strokeDasharray={`${dash} ${dash}`}>
          <circle cx="70" cy="70" r="60" />
          <ellipse cx="70" cy="70" rx="60" ry="10" />
          <ellipse cx="70" cy="70" rx="60" ry="26" />
          <ellipse cx="70" cy="70" rx="60" ry="42" />
          <line x1="10" y1="70" x2="130" y2="70" />
        </g>
      </svg>

      <div
        className="relative flex items-center justify-center overflow-hidden rounded-full bg-background/80"
        style={{
          width: size * 0.65,
          height: size * 0.65,
          padding: 2 * k,
          boxShadow: `0 ${15 * k}px ${20 * k}px ${-5 * k}px #00000045`
        }}
      >
        <MarkOrb size={Math.round(size * (72 / BASE))} state="speaking" pauseOffscreen={false} className="invert!" />

        {/* The lens: a frosted disc, then two raking highlights across it. */}
        <div
          className="absolute inset-0 z-10 rounded-full bg-white/5 backdrop-blur-xs"
          style={{ backdropFilter: `blur(${5 * k}px) saturate(50%)` }}
        >
          <div
            style={{
              maskImage:
                "linear-gradient(45deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)",
              boxShadow: `${1 * k}px ${1 * k}px ${1 * k}px 0px #ffffffc0 inset, ${-1 * k}px ${-1 * k}px ${2 * k}px 0px #ffffffa0 inset`
            }}
            className="absolute inset-0 rounded-[inherit]"
          />
          <div
            style={{
              maskImage:
                "linear-gradient(45deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)",
              boxShadow: `${2 * k}px ${2 * k}px ${2 * k}px 0px #ffffff90 inset`
            }}
            className="absolute inset-0 rounded-[inherit]"
          />
          <div
            style={{
              maskImage:
                "linear-gradient(45deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)",
              boxShadow: `${1 * k}px ${1 * k}px ${1 * k}px 0px #ffffff inset`
            }}
            className="absolute inset-0 rounded-[inherit]"
          />
          <div className="absolute inset-px rounded-full bg-linear-to-b from-white/7 via-transparent to-white/15 -rotate-225"></div>
        </div>
      </div>
    </div>
  );
}
