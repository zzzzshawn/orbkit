"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ----------------------------------------------------------------------------
   Orbkit core — raw WebGL shader orb runtime. No dependencies.

   An orb is a full-screen triangle rendered into a transparent canvas by a
   fragment shader. Every orb declares a parameter schema (sliders + colors);
   the values are uploaded as uniforms each frame from a ref, so a controls
   panel can tune them live without ever remounting the canvas (a remount would
   drop the WebGL context).

   Animation model: every state synthesizes two volume signals — input (user
   speech energy) and output (agent speech energy) — smooths them, and the
   shaders react to those. The flow clock's speed itself follows the output
   volume, so orbs visibly quicken when the agent is talking.
---------------------------------------------------------------------------- */

export type OrbState = "idle" | "thinking" | "speaking";

export const ORB_STATES = ["idle", "thinking", "speaking"] as const;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Per-state [input, output] volume synthesis. */
/**
 * Transition rate shared by params, colours and the flow-speed multiplier.
 * They must move together: if the rate multiplier eases faster than the look,
 * a state change spins the orb up before it has finished cross-fading, which
 * reads as a lurch.
 *
 * This drives a critically damped spring rather than the exponential ease it
 * used to. An exponential's velocity is highest at the instant the target
 * changes, so every state change began with a jolt — and for params that are
 * spatial frequencies (Corona's warpFreq travels 5.25 -> 19.5 between states)
 * that jolt sweeps the field through its intermediate frequencies at maximum
 * rate, which is what read as the transition "scrambling".
 *
 * A spring starts at rest and accelerates, so the sweep is spread across the
 * transition instead of front-loaded. Measured on that warpFreq move it is a
 * 20% lower peak rate of change (20.3/s vs 25.3/s) AND it arrives sooner —
 * 1.50s to within 2% against the exponential's 2.18s, since an exponential
 * only ever asymptotes toward its target.
 */
const PARAM_EASE = 4;

/*
  One step of a critically damped spring, implicit (semi-implicit Euler would
  blow up at the frame times a backgrounded tab produces). Returns nothing and
  writes through the scratch pair so the hot loop allocates nothing.
*/
const springOut = { x: 0, v: 0 };
function springStep(x: number, v: number, target: number, dt: number, omega: number) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  springOut.x = (f * x + dt * v + hhoo * target) * detInv;
  springOut.v = (v + hoo * (target - x)) * detInv;
}

function targetVolumes(state: OrbState, t: number): [number, number] {
  switch (state) {
    case "idle":
      return [0, 0.3];
    case "speaking":
      return [
        clamp01(0.65 + Math.sin(t * 4.8) * 0.22),
        clamp01(0.75 + Math.sin(t * 3.6) * 0.22)
      ];
    case "thinking": {
      const base = 0.38 + 0.07 * Math.sin(t * 0.7);
      const wander = 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2);
      return [clamp01(base + wander), clamp01(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6))];
    }
  }
}

/* ------------------------------ param schema ------------------------------- */

export interface OrbParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /**
   * Rate params. The engine integrates them into a clock
   * (`clock += dt * value * volumeSpeed`) and uploads the clock instead of the
   * raw value, so changing the rate never jumps the phase — the motion speeds
   * up or slows down rather than snapping to a new position.
   */
  integrate?: boolean;
}

export interface OrbColorDef {
  key: string;
  label: string;
  /** hex, e.g. `#ff8b73` */
  default: string;
}

export interface OrbVariant {
  key: string;
  label: string;
  note: string;
  /** GLSL fragment shader body. Uniform declarations are generated for you. */
  frag: string;
  params: OrbParamDef[];
  colors: OrbColorDef[];
  /**
   * Per-state parameter targets. The engine glides each param toward the
   * active state's preset. Params passed explicitly via the `params` prop
   * always win over the preset.
   */
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
  /**
   * Per-state colour targets, the colour counterpart of `statePresets`.
   * Kept a separate map because presets are numeric and colours are hex
   * strings — a union would lose type safety on both. Colours glide in RGB
   * on the same easing as params, so a state change cross-fades rather
   * than cutting. Colours passed explicitly via the `colors` prop always
   * win, exactly as with params.
   */
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
}

export type OrbParamValues = Partial<Record<string, number>>;
export type OrbColorValues = Partial<Record<string, string>>;

/** Every param and color at its schema default. */
export function defaultValuesFor(variant: OrbVariant): {
  params: Record<string, number>;
  colors: Record<string, string>;
} {
  return {
    params: Object.fromEntries(variant.params.map((p) => [p.key, p.default])),
    colors: Object.fromEntries(variant.colors.map((c) => [c.key, c.default]))
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ------------------------------- GLSL shared ------------------------------- */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Prelude prepended to every orb fragment shader: uniforms, value noise, fbm,
 * and the centered aspect-corrected UV helper.
 */
export const ORB_GLSL_HELPERS = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;   // slow ambient clock (half real-time)
uniform float uAnim;   // flow clock — its speed follows the output volume
uniform float uInput;  // input volume 0..1: user speech energy
uniform float uOutput; // output volume 0..1: agent speech energy

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.7, 7.3);
    a *= 0.5;
  }
  return v;
}
vec2 orbUV() { return (2.0 * gl_FragCoord.xy - uRes) / min(uRes.x, uRes.y); }

// GLSL ES 1.0 has no tanh() — it arrived in ES 3.0. Shader-golf listings lean
// on it as a tone-mapper, so it ships here. Clamped against exp() overflow;
// accurate for the non-negative accumulators those shaders produce.
vec3 tanh3(vec3 x) {
  x = clamp(x, -10.0, 10.0);
  vec3 e = exp(2.0 * x);
  return (e - 1.0) / (e + 1.0);
}

`;

function paramUniformDecls(variant: OrbVariant): string {
  return [
    ...variant.params.map((p) => `uniform float uP_${p.key};`),
    ...variant.colors.map((c) => `uniform vec3 uC_${c.key};`)
  ].join("\n");
}

/* ------------------------------- engine ------------------------------------ */

/**
 * Per-canvas context-lifecycle controller. Created on first mount of a canvas
 * and kept for the element's whole life — the router can hide a page and show
 * the same DOM again, and React re-runs effects on the same canvas, so the
 * lost/restored listeners must outlive any single effect run: an uncanceled
 * webglcontextlost event marks the context permanently unrestorable.
 */
interface CanvasContextController {
  /** Whether a mounted orb currently wants this context alive. */
  desired: boolean;
  /** Builds a render generation; returns its teardown. Rebound per effect run. */
  start: (() => () => void) | null;
  /** Teardown of the live generation, if one is running. */
  stopGen: (() => void) | null;
}

const canvasControllers = new WeakMap<HTMLCanvasElement, CanvasContextController>();

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[orbkit] shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/* ----------------------------------------------------------------------------
   Wrappers — optional decoration drawn around, under and over the orb.

   A wrapper is pure CSS/SVG, never a shader: the orb keeps its own canvas and
   the decoration is composited on top of it by the browser. That keeps the
   whole set free for any orb (no per-variant shader work), costs nothing on
   the GPU budget the shaders are already spending, and means swapping one
   wrapper for another at runtime never touches the WebGL context. Turning a
   wrapper on or off does, since that is what moves the canvas into or out of
   the wrapper element — see the effect's `wrapped` dependency.

   Layout: a wrapped orb becomes a square box, and the canvas is absolutely
   positioned inside it with the spec's `inset`. The FOOTPRINT is unchanged —
   `size` is still the outer diameter — so dropping a wrapper onto an existing
   orb reflows nothing; the orb itself just shrinks to leave the ring room.

   Colour: every layer that isn't physically light or shadow paints in
   `currentColor`, so a wrapper picks up the surrounding text colour and reads
   correctly on light and dark pages with no configuration. `wrapperColor`
   sets that colour when you want something other than the inherited one.
---------------------------------------------------------------------------- */

export const ORB_WRAPPERS = [
  "none",
  "glass",
  "ring",
  "dotted",
  "ticks",
  "reticle",
  "grid",
  "halftone",
  "scanlines"
] as const;

export type OrbWrapper = (typeof ORB_WRAPPERS)[number];

/*
  Keyframes for the animated wrappers, shipped inside the component so an orb
  stays a single self-contained file with nothing to add to a global
  stylesheet. React 19 hoists a <style href precedence> into <head> and
  de-duplicates it, so a page full of wrapped orbs emits this exactly once;
  older React renders it inline, which is redundant but harmless.

  Reduced motion parks all of it. The shader runtime already honours the same
  preference for the orb itself (see the reduce-motion branch in the render
  loop), and a ring that keeps spinning around a frozen orb would be the worse
  half of the two still moving.
*/
const WRAPPER_STYLE_HREF = "orbkit-wrapper";
const WRAPPER_CSS = `
@keyframes orbkit-w-spin { to { transform: rotate(360deg); } }
@keyframes orbkit-w-roll { from { transform: translateY(-110%); } to { transform: translateY(360%); } }
@media (prefers-reduced-motion: reduce) {
  .orbkit-w-anim { animation: none !important; }
}
`;

interface WrapperSpec {
  /**
   * How far the canvas sits inside the box, in percent, leaving the
   * decoration room. Applied as explicit width/height rather than as `inset`:
   * a canvas is a REPLACED element, so an absolutely positioned one with
   * `left` and `right` both set does not stretch between them — it keeps its
   * intrinsic size and the over-constrained edge is dropped. The orb would
   * then be drawn into a canvas the size of the page.
   */
  inset: number;
  /**
   * Soft circular mask on the canvas. Only the wrappers that read as a
   * CONTAINER set one — a bubble has to hold the orb, whereas a bezel sits
   * beside it and clipping the halo there would just amputate the glow.
   */
  mask?: string;
  /** Cast by the assembly as a whole, on the outer box. */
  shadow?: string;

  /** True when the spec uses one of the keyframes above. */
  animated?: boolean;
  /** Painted beneath the canvas. */
  under?: ReactNode;
  /** Painted over it. */
  over?: ReactNode;
}

const DISC: CSSProperties = { borderRadius: "50%" };

/** One absolutely-positioned decoration layer, filling the wrapper box. */
function Layer({
  inset = 0,
  style,
  className
}: {
  inset?: number | string;
  style: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", inset, pointerEvents: "none", ...style }}
    />
  );
}

/**
 * A free-floating highlight — glass's specular and its bounce. These do not go
 * through `Layer` because they are placed with `left`/`top`/`width`, and a
 * style object that sets those on top of `Layer`'s `inset` shorthand is mixing
 * shorthand and longhand for the same property: React warns about it, and the
 * result depends on key order rather than on anything you would want to rely
 * on.
 */
function Highlight({ style }: { style: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{ position: "absolute", borderRadius: "50%", pointerEvents: "none", ...style }}
    />
  );
}

/**
 * The mask that makes a wrapper HOLD the orb: cuts the canvas back to the
 * bubble and stops a hairline short of the rim, so the orb never quite touches
 * the glass.
 *
 * The percentage has to be derived rather than written down. `closest-side`
 * measures the CANVAS, and a wrapper with a negative inset draws its canvas
 * LARGER than the bubble — at -7 the canvas is 114% of the box, so the rim
 * sits at 100/1.14 = 87.7% of the canvas's own radius, not at 100%.
 *
 * The gap is real pixels rather than a share of the size: it reads as the same
 * band at 120px and at 900px, which a percentage would not.
 */
const RIM_GAP_PX = 4;

function rimMask(inset: number): string {
  const rim = (100 / (1 - (2 * inset) / 100)).toFixed(2);
  // Feathered over the final pixel, so the cut is not a razor edge.
  const solid = RIM_GAP_PX + 0.5;
  const clear = RIM_GAP_PX - 0.5;
  return `radial-gradient(circle closest-side, #000 calc(${rim}% - ${solid}px), rgba(0,0,0,0) calc(${rim}% - ${clear}px))`;
}

/** Both spellings, since Safari still wants the prefix for mask-image. */
function masked(image: string): CSSProperties {
  return { WebkitMaskImage: image, maskImage: image };
}

const svgLayer: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "visible"
};

/** Glass's overfill, shared by its inset and the mask derived from it. */
const GLASS_INSET = -4;

const WRAPPER_SPECS: Record<Exclude<OrbWrapper, "none">, WrapperSpec> = {
  /*
    glass — a blown bubble with the orb suspended inside it.

    Five layers in the order light actually arrives: the body brightening
    toward the key light, the Fresnel ring where a sphere's edge turns almost
    edge-on and reflects nearly everything, the rim itself, the window
    reflection, and the bounce coming back up off whatever the bubble is
    sitting on. All of it is white and black rather than `currentColor` —
    glass has no colour of its own, only the light it moves around.
  */
  glass: {
    /*
      Negative on purpose. An orb's shader does not necessarily paint to the
      edge of its canvas — most draw a sphere with transparent margin around
      it — so a canvas sized to the bubble leaves a dead ring between the orb
      and the rim, which is not what a thing suspended in glass looks like.
      Oversizing the canvas by 14% pushes the sphere out to the rim, and
      `rimMask` cuts whatever overflows — a few pixels short of the glass, so
      the orb sits just inside it rather than welded to it. Orbs that already fill
      their canvas lose a few percent off the limb, which is the same crop the
      reference bubble makes.
    */
    inset: GLASS_INSET,
    mask: rimMask(GLASS_INSET),
    shadow: "0 24px 48px -26px rgba(0,0,0,0.55)",
    over: (
      <>
        <Layer
          style={{
            ...DISC,
            background:
              "radial-gradient(ellipse 80% 70% at 28% 20%, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 45%, rgba(255,255,255,0) 72%)"
          }}
        />
        <Layer
          style={{
            ...DISC,
            background:
              "radial-gradient(circle closest-side, rgba(255,255,255,0) 0%, rgba(255,255,255,0.0) 55%, rgba(255,255,255,0.05) 99.5%, rgba(255,255,255,0) 100%)",
              overflow: 'hidden'
          }}
        />
        <Layer
          style={{
            ...DISC,
           boxShadow: '3px 6px 10px #ffffff20 inset'
          }}
        />
        {/*
          The shell's own darkening, just inside the rim. Invisible on a dark
          page — it is black over black — and doing all the work on a light
          one, where the white highlights below have nothing to stand out
          against and the bubble would otherwise read as a bare drop shadow.
        */}
        <Layer
          style={{
            ...DISC,
            background:
              "radial-gradient(circle closest-side, rgba(0,0,0,0) 78%, rgba(0,0,0,0.05) 93%, rgba(0,0,0,0.02) 100%)"
          }}
        />
        <Layer
          style={{
            ...DISC,
            boxShadow:
              "inset 0 6px 12px -7px rgba(255,255,255,0.05), inset 0 -9px 16px -9px rgba(255,255,255,0.1), 0 0 0 1px rgba(0,0,0,0.07)"
          }}
        />
        <Highlight
          style={{
            left: "15%",
            top: "10%",
            width: "38%",
            height: "22%",
            transform: "rotate(-25deg)",
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0.3) 55%, rgba(255,255,255,0) 100%)",
              filter: 'blur(10px)'
          }}
        />
       
      </>
    )
  },

  /* ring — two hairlines and nothing else. The restrained one. */
  ring: {
    inset: 9,
    over: (
      <>
        <Layer style={{ ...DISC, border: "1px solid currentColor", opacity: 0.22 }} />
        <Layer inset="5%" style={{ ...DISC, border: "1px solid currentColor", opacity: 0.1 }} />
      </>
    )
  },

  /*
    dotted — evenly spaced dots around the circumference, turning slowly.

    Drawn as one dashed circle with round caps and a near-zero dash length, so
    each dash collapses to a dot. `pathLength="64"` renormalizes the path to 64
    units first, which is what makes the count exact: the dash period is
    literally 1/64th of the circle, so the pattern closes on itself with no
    seam where the last gap would otherwise be short.
  */
  dotted: {
    inset: 10,
    animated: true,
    over: (
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="orbkit-w-anim"
        style={{ ...svgLayer, animation: "orbkit-w-spin 48s linear infinite" }}
      >
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          pathLength={64}
          strokeDasharray="0.0001 0.9999"
          opacity={0.45}
        />
      </svg>
    )
  },

  /*
    ticks — an instrument bezel: a fine minor scale every 6 degrees with a
    longer major tick every 30. Both are one repeating conic gradient masked
    down to an annulus, so the tick count is set by the gradient's period and
    the tick LENGTH by how far in the mask reaches.
  */
  ticks: {
    inset: 12,
    over: (
      <>
        <Layer
          style={{
            ...DISC,
            opacity: 0.32,
            background:
              "repeating-conic-gradient(from -0.5deg, transparent 0deg 0.2deg, currentColor 0.4deg 0.6deg, transparent 0.8deg 6deg)",
            ...masked(
              "radial-gradient(circle closest-side, transparent 88%, #000 90%, #000 97%, transparent 99%)"
            )
          }}
        />
        <Layer
          style={{
            ...DISC,
            opacity: 0.6,
            background:
              "repeating-conic-gradient(from -0.75deg, transparent 0deg 0.25deg, currentColor 0.5deg 1deg, transparent 1.25deg 30deg)",
            ...masked(
              "radial-gradient(circle closest-side, transparent 80%, #000 82%, #000 97%, transparent 99%)"
            )
          }}
        />
        <Layer style={{ ...DISC, border: "1px solid currentColor", opacity: 0.12 }} />
      </>
    )
  },

  /* reticle — viewfinder furniture: corner brackets, cardinal ticks, a track. */
  reticle: {
    inset: 13,
    over: (
      <svg aria-hidden="true" viewBox="0 0 100 100" style={svgLayer}>
        <g fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5">
          <path d="M1 13 L1 1 L13 1" />
          <path d="M87 1 L99 1 L99 13" />
          <path d="M99 87 L99 99 L87 99" />
          <path d="M13 99 L1 99 L1 87" />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.38">
          <path d="M50 1 L50 9" />
          <path d="M50 91 L50 99" />
          <path d="M1 50 L9 50" />
          <path d="M91 50 L99 50" />
        </g>
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          opacity="0.22"
        />
      </svg>
    )
  },

  /*
    grid — a graticule laid over the orb and masked back to the disc, so the
    mesh appears to be etched on the glass in front of it rather than drawn on
    the page behind. The lines are 1px whatever the size; the SPACING is a
    percentage, so the cell count holds from a gallery thumbnail to a
    full-bleed hero.
  */
  grid: {
    inset: 8,
    /*
      The ruling sits UNDER the canvas: graph paper the orb rests on, not a
      mesh laid over its face. Drawn on top it crosshatched the shader — the
      one thing the wrapper is meant to frame. The ring stays over, since it
      only ever meets the transparent margin at the canvas edge.
    */
    under: (
      <Layer
        style={{
          ...DISC,
          opacity: 0.18,
          backgroundImage:
            "repeating-linear-gradient(to right, currentColor 0 1px, transparent 1px 12.5%), repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 12.5%)",
          ...masked("radial-gradient(circle closest-side, #000 86%, rgba(0,0,0,0) 99%)")
        }}
      />
    ),
    over: <Layer style={{ ...DISC, border: "1px solid currentColor", opacity: 0.2 }} />
  },

  /*
    halftone — a print screen over the outer band of the orb. The mask keeps
    the middle clear, so the dots read as the image breaking up toward its
    edge instead of a texture pasted across the whole face.
  */
  halftone: {
    inset: 6,
    over: (
      <Layer
        style={{
          ...DISC,
          opacity: 0.5,
          backgroundImage: "radial-gradient(currentColor 22%, transparent 24%)",
          backgroundSize: "7px 7px",
          ...masked(
            "radial-gradient(circle closest-side, transparent 40%, #000 80%, #000 94%, rgba(0,0,0,0) 100%)"
          )
        }}
      />
    )
  },

  /*
    scanlines — a phosphor tube. Black lines rather than `currentColor`,
    because scanlines are the UNLIT gaps between rows and stay dark whatever
    the page is; the slow bright band rolling down is the vertical hold
    drifting, which is the part that reads as a CRT rather than as stripes.
  */
  scanlines: {
    inset: 0,
    animated: true,
    over: (
      <>
        <Layer
          style={{
            ...DISC,
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(0,0,0,0.45) 0 1px, rgba(0,0,0,0) 1px 3px)",
            ...masked("radial-gradient(circle closest-side, #000 84%, rgba(0,0,0,0) 100%)")
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            overflow: "hidden",
            pointerEvents: "none"
          }}
        >
          <span
            className="orbkit-w-anim"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: "30%",
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 100%)",
              animation: "orbkit-w-roll 7s linear infinite"
            }}
          />
        </span>
        <Layer style={{ ...DISC, boxShadow: "inset 0 0 40px -8px rgba(0,0,0,0.5)" }} />
      </>
    )
  }
};

export interface ShaderOrbProps {
  /** The orb definition: shader + param schema + state presets. */
  variant: OrbVariant;
  /** Drives the synthesized volume signals. Defaults to `"idle"`. */
  state?: OrbState;
  /** Rendered size in CSS pixels. Ignored when `className` sizes the canvas. */
  size?: number;
  /** Explicit param overrides. Any key present here wins over the state preset. */
  params?: OrbParamValues;
  /** Explicit color overrides, as hex strings. */
  colors?: OrbColorValues;
  /**
   * Per-state parameter targets, overriding the variant's own. Merged KEY BY
   * KEY over what the orb already defines, so `{ thinking: { churn: 1.62 } }`
   * retouches one param of one state and leaves every other param — and the
   * other two states — exactly as the orb ships them.
   *
   * This is the prop form of the variant's `statePresets`, so you can retune
   * an orb's states from the outside without forking its file. Values still
   * glide, so switching states cross-fades into your targets. An explicit
   * `params` value outranks this, the same way it outranks the variant.
   */
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
  /** The colour counterpart of `statePresets`, merged the same key-by-key way. */
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
  /**
   * Per-state volume drive, the third member of the same family. Use it to
   * give each state its own energy; use `volumes` below instead when you have
   * a real signal to feed in, such as live mic level.
   */
  stateVolumes?: Partial<Record<OrbState, { input?: number; output?: number }>>;
  /**
   * Overrides the synthesized volume signals for the active state. The engine
   * normally derives these from `state` — a slow breath at idle, a restless
   * wander while thinking, speech-shaped peaks while speaking — and most
   * shaders read them as their reactivity. Setting either channel here pins
   * it instead, which is how the playground lets you dial each state's drive
   * independently. Omit a channel to keep its synthesized motion.
   */
  volumes?: { input?: number; output?: number };
  /** Freeze the animation on the current frame. */
  paused?: boolean;
  /**
   * Stop rendering while the orb is scrolled out of view. Defaults to `true` —
   * a page full of orbs would otherwise run a WebGL loop per card.
   */
  pauseOffscreen?: boolean;
  /** Device-pixel-ratio ceiling. Defaults to `2`. */
  maxDpr?: number;
  /**
   * Decoration drawn around the orb — a glass bubble, a dotted bezel, a
   * viewfinder. Defaults to `"none"`, which renders the bare canvas exactly as
   * it always has, with no extra element in the tree.
   *
   * A wrapper never changes the orb's footprint: `size` stays the outer
   * diameter and the canvas is inset inside it, so switching one on reflows
   * nothing around it.
   */
  wrapper?: OrbWrapper;
  /**
   * The colour a wrapper draws its lines and dots in. Defaults to
   * `currentColor` — the inherited text colour — which is what makes the
   * bezels legible on a light and a dark page without being told which one
   * they are on. `glass` ignores it: glass has no colour of its own.
   */
  wrapperColor?: string;
  /** Applied to the outermost element — the wrapper when there is one. */
  className?: string;
  /** Merged onto the outermost element's style. */
  style?: CSSProperties;
  /** Accessible label. When omitted the orb is hidden from assistive tech. */
  ariaLabel?: string;
}

export function ShaderOrb({
  variant,
  state = "idle",
  size,
  params,
  colors,
  statePresets,
  stateColors,
  stateVolumes,
  volumes,
  paused = false,
  pauseOffscreen = true,
  maxDpr = 2,
  wrapper = "none",
  wrapperColor,
  className,
  style,
  ariaLabel
}: ShaderOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spec = wrapper === "none" ? undefined : WRAPPER_SPECS[wrapper];
  const wrapped = spec !== undefined;

  // Live refs: the render loop reads these every frame, so changing a param
  // never re-runs the GL setup effect (which would drop the context). Synced in
  // an effect rather than during render — a ref write during render is unsafe
  // under concurrent rendering, and the loop picks the new value up on the very
  // next frame anyway.
  /*
    Whether the canvas has drawn a frame yet, tracked per variant because a
    variant swap mounts a brand new canvas (see the `key` below).

    A mounted-but-never-drawn canvas is at the browser's mercy: rather than
    the transparent rectangle you would expect, a page that mounts a dozen at
    once gets white boxes — and in some browsers a broken-image placeholder —
    for as long as the compositor has nothing to raster. That window is not
    small here: every orb compiles a full fragment shader synchronously in its
    own mount effect, so on the gallery grid the first canvases sit empty
    while the last ones are still compiling. Holding each canvas invisible
    until its own first frame lands is what makes the grid fade in cleanly
    instead of flashing. One state change per orb, once, on mount.
  */
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const painted = paintedKey === variant.key;

  const stateRef = useRef<OrbState>(state);
  const paramsRef = useRef<OrbParamValues | undefined>(params);
  const colorsRef = useRef<OrbColorValues | undefined>(colors);
  const statePresetsRef = useRef(statePresets);
  const stateColorsRef = useRef(stateColors);
  const stateVolumesRef = useRef(stateVolumes);
  const volumesRef = useRef(volumes);
  const pausedRef = useRef(paused);

  useEffect(() => {
    stateRef.current = state;
    paramsRef.current = params;
    colorsRef.current = colors;
    statePresetsRef.current = statePresets;
    stateColorsRef.current = stateColors;
    stateVolumesRef.current = stateVolumes;
    volumesRef.current = volumes;
    pausedRef.current = paused;
  }, [state, params, colors, statePresets, stateColors, stateVolumes, volumes, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      // No MSAA: the geometry is a single full-screen triangle, so there are no
      // primitive edges to antialias — softness comes from the shaders. Leaving
      // it on costs the multisample buffers plus a resolve every frame.
      antialias: false,
      premultipliedAlpha: true
    });
    if (!gl) return;

    const loseExt = gl.getExtension("WEBGL_lose_context");

    /*
      A "generation" is everything tied to a live context: program, buffers,
      observers, render loop. Browsers cap live WebGL contexts per page and
      evict the oldest past the cap, and an evicted orb's canvas stays blank
      forever unless the app rebuilds — so generations tear down and rebuild on
      the lost/restored events instead of assuming the context is immortal.
    */
    let announcedPaint = false;

    const startGeneration = (): (() => void) => {
      if (gl.isContextLost()) return () => {};
      // Every generation announces its own first frame: a context that was
      // lost and restored has an empty drawing buffer and is hidden again
      // (below), so it has to earn its reveal back.
      announcedPaint = false;

      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(
        gl,
        gl.FRAGMENT_SHADER,
        ORB_GLSL_HELPERS + paramUniformDecls(variant) + variant.frag
      );
      const releaseShaders = () => {
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      };
      if (!vs || !fs) return releaseShaders;

      const prog = gl.createProgram();
      if (!prog) return releaseShaders;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("[orbkit] program link error:", gl.getProgramInfoLog(prog));
        gl.deleteProgram(prog);
        return releaseShaders;
      }
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const uRes = gl.getUniformLocation(prog, "uRes");
      const uTime = gl.getUniformLocation(prog, "uTime");
      const uAnim = gl.getUniformLocation(prog, "uAnim");
      const uInput = gl.getUniformLocation(prog, "uInput");
      const uOutput = gl.getUniformLocation(prog, "uOutput");

      const paramLocs = variant.params.map((p) => ({
        def: p,
        loc: gl.getUniformLocation(prog, `uP_${p.key}`)
      }));
      const colorLocs = variant.colors.map((c) => ({
        def: c,
        loc: gl.getUniformLocation(prog, `uC_${c.key}`)
      }));

      /* --- sizing: track the element box, not a one-shot measurement ------- */
      // Backing-store scale, stepped down by the adaptive-resolution logic in
      // the loop when the GPU can't hold frame rate. CSS size never changes —
      // the browser upscales, which these soft shaders absorb gracefully.
      let resScale = 1;
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * resScale;
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        /*
          Uploaded UNCONDITIONALLY, outside the size guard. A rebuilt
          generation (React strict-mode remount, a restored context) links a
          fresh program whose uRes starts at zero — and the canvas usually
          already holds the right backing size, so an upload gated behind
          the resize never ran. With uRes = 0, orbUV() divides by zero and
          every fragment lands transparent: a healthy context, a bound
          program, and a permanently blank orb.
        */
        gl.uniform2f(uRes, w, h);
      };
      resize();

      const resizeObserver =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(canvas);

      /* --- visibility: don't burn a render loop on an offscreen orb -------- */
      let visible = !pauseOffscreen;
      const intersectionObserver =
        pauseOffscreen && typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(
              (entries) => {
                visible = Boolean(entries[0]?.isIntersecting);
                if (visible) {
                  last = performance.now() / 1000;
                }
              },
              { rootMargin: "150px 0px", threshold: 0 }
            )
          : null;
      if (intersectionObserver) {
        intersectionObserver.observe(canvas);
      } else {
        visible = true;
      }

      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      /* --- driver state ---------------------------------------------------- */
      let tSec = 0;
      // random phase so two orbs on the same page never look synchronized
      let anim = Math.random() * 100;
      let speed = 0.1;
      const cur = { in: 0, out: 0.3 };
      const presets = variant.statePresets;
      const paramCur: Record<string, number> = {};
      const paramVel: Record<string, number> = {};
      const paramClocks: Record<string, number> = {};
      const colorCur: Record<string, [number, number, number]> = {};
      const colorVel: Record<string, [number, number, number]> = {};
      let speedVel = 0;
      const [initialIn, initialOut] = targetVolumes(stateRef.current, 0);
      cur.in = initialIn;
      cur.out = initialOut;
      let last = performance.now() / 1000;
      let raf = 0;
      // smoothed frame time for the adaptive-resolution check
      let frameEma = 1 / 60;

      const uploadAndDraw = (dt: number, snap = false) => {
        // Synthesized from the state, unless a channel is pinned via
        // `volumes`. Pinned values still glide on the same easing, so dialing
        // one in the playground cross-fades rather than jumping.
        const [tin, tout] = targetVolumes(stateRef.current, tSec);
        // Same order as params and colours: direct prop, then the per-state
        // map, then the engine's own synthesis.
        const liveVolumes = volumesRef.current;
        const stateVolume = stateVolumesRef.current?.[stateRef.current];
        const targetIn = liveVolumes?.input ?? stateVolume?.input ?? tin;
        const targetOut = liveVolumes?.output ?? stateVolume?.output ?? tout;
        const kVol = 1 - Math.exp(-dt * 12);
        cur.in += (targetIn - cur.in) * kVol;
        cur.out += (targetOut - cur.out) * kVol;

        /*
          Flow speed follows the output volume. It multiplies every integrated
          clock's increment, so it is a RATE: easing it quickly makes the orb
          visibly lurch — a state change would spin the orb up hard before the
          params had finished gliding.

          It is therefore eased on the same constant as the params below, so a
          state change ramps its motion over the same half second that its look
          takes to cross-fade. The steady-state values are unchanged, so a
          speaking orb still flows faster than an idle one; only the transition
          into that rate is gradual.
        */
        const targetSpeed = 0.1 + (1 - Math.pow(cur.out - 1, 2)) * 0.9;
        if (snap) {
          speed = targetSpeed;
          speedVel = 0;
        } else {
          springStep(speed, speedVel, targetSpeed, dt, PARAM_EASE);
          speed = springOut.x;
          speedVel = springOut.v;
        }
        anim += dt * speed;

        gl.uniform1f(uTime, tSec * 0.5);
        gl.uniform1f(uAnim, anim);
        gl.uniform1f(uInput, cur.in);
        gl.uniform1f(uOutput, cur.out);

        // Resolution order per param: explicit `params` → `statePresets`
        // prop → the variant's own preset → schema default. The two middle
        // steps are per-key, so overriding one param of one state leaves the
        // rest of that state alone. Values glide rather than snap.
        const liveParams = paramsRef.current;
        const statePreset = presets?.[stateRef.current];
        const overridePreset = statePresetsRef.current?.[stateRef.current];

        for (const { def, loc } of paramLocs) {
          const explicit = liveParams?.[def.key];
          const target =
            typeof explicit === "number"
              ? explicit
              : (overridePreset?.[def.key] ?? statePreset?.[def.key] ?? def.default);
          const curVal = paramCur[def.key] ?? target;
          let next: number;
          if (snap) {
            next = target;
            paramVel[def.key] = 0;
          } else {
            springStep(curVal, paramVel[def.key] ?? 0, target, dt, PARAM_EASE);
            next = springOut.x;
            paramVel[def.key] = springOut.v;
          }
          paramCur[def.key] = next;

          if (def.integrate) {
            const clock =
              (paramClocks[def.key] ?? (paramClocks[def.key] = Math.random() * 100)) +
              dt * speed * next;
            paramClocks[def.key] = clock;
            gl.uniform1f(loc, clock);
          } else {
            gl.uniform1f(loc, next);
          }
        }

        // Same resolution order and same easing as params, so a state change
        // cross-fades the palette instead of cutting to it.
        const liveColors = colorsRef.current;
        const stateColor = variant.stateColors?.[stateRef.current];
        const overrideColor = stateColorsRef.current?.[stateRef.current];
        for (const { def, loc } of colorLocs) {
          const target = hexToRgb(
            liveColors?.[def.key] ??
              overrideColor?.[def.key] ??
              stateColor?.[def.key] ??
              def.default
          );
          const curCol = (colorCur[def.key] ??= [...target] as [number, number, number]);
          const velCol = (colorVel[def.key] ??= [0, 0, 0]);
          for (let i = 0; i < 3; i++) {
            if (snap) {
              curCol[i] = target[i];
              velCol[i] = 0;
            } else {
              springStep(curCol[i], velCol[i], target[i], dt, PARAM_EASE);
              curCol[i] = springOut.x;
              velCol[i] = springOut.v;
            }
          }
          gl.uniform3f(loc, curCol[0], curCol[1], curCol[2]);
        }

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // Deferred a microtask: the first of these draws runs synchronously
        // inside this effect, and a sync setState there trips the compiler
        // lint. A microtask still resolves before the browser paints, so the
        // reveal is not delayed by a frame.
        if (!announcedPaint) {
          announcedPaint = true;
          queueMicrotask(() => {
            /*
              Re-check: the context can be evicted between this draw and the
              microtask, and mounting one more orb anywhere on the page is
              enough to do it — opening the details drawer over a full gallery
              is exactly that. Revealing on the strength of a frame that has
              already been thrown away puts a dead canvas on screen, which is
              what the browser draws its broken-canvas placeholder over. The
              generation that follows the restore announces again.
            */
            if (gl.isContextLost()) return;
            setPaintedKey(variant.key);
          });
        }
      };

      const releaseGL = () => {
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(buf);
      };

      if (reduceMotion) {
        // One representative frame, then stop — snapped straight onto the
        // state's targets, since a spring would only be part-way there.
        tSec = 1;
        uploadAndDraw(1, true);
        return releaseGL;
      }

      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now() / 1000;
        const dt = Math.min(now - last, 0.05);
        last = now;
        if (!visible || pausedRef.current) return;
        tSec += dt;

        /*
          Adaptive resolution. When the smoothed frame time sits above ~30fps,
          the GPU is drowning in fragment work (these shaders are pure fill
          cost), so step the backing store down 20% and re-measure. Steps only
          go down — never back up — so the resolution can't oscillate. The
          warm-up guard keeps page-load jank (hydration, first compiles) from
          triggering a downgrade the GPU never asked for.
        */
        /*
          Only unstalled frames are evidence about GPU fill cost. `dt` above is
          clamped at 0.05, so a frame that hits the clamp is the main thread
          having been blocked — a slider drag re-rendering React, a GC pause, a
          tab regaining focus — and feeding those in made UI jank look
          identical to a drowning GPU.
        */
        if (dt < 0.05) frameEma += (dt - frameEma) * 0.08;

        if (tSec > 1.5 && frameEma > 1 / 34 && resScale > 0.5) {
          resScale = Math.max(0.5, resScale * 0.8);
          frameEma = 1 / 60; // require fresh evidence before the next step
          resize();
        } else if (tSec > 1.5 && frameEma < 1 / 55 && resScale < 1) {
          /*
            And step back up once frames are comfortably fast again. This used
            to be one-way, on the reasoning that it could not then oscillate —
            but that also meant one transient stall permanently halved the
            orb's resolution, and at half resolution a high-frequency shader
            aliases into shimmer that reads as the shader itself misbehaving.
            The gap between the two thresholds (29ms down, 18ms up) is the
            hysteresis that stops it hunting.
          */
          resScale = Math.min(1, resScale / 0.8);
          frameEma = 1 / 60;
          resize();
        }

        uploadAndDraw(dt);
      };
      /*
        First frame synchronously, before entering the rAF loop. rAF does not
        run at all in hidden documents (background tabs, embedded previews),
        so a freshly mounted orb would otherwise sit fully transparent until
        the page next becomes visible — a grid of mounted, healthy, blank
        canvases. The sync frame guarantees every mount paints: background
        documents get a static frame, visible ones start animating over it.
        dt = 1 lands the param glide on its targets, as in the reduce-motion
        frame above.
      */
      uploadAndDraw(1);
      loop();

      return () => {
        cancelAnimationFrame(raf);
        releaseGL();
      };
    };

    /*
      Wire the canvas's lifecycle controller. The listeners are attached ONCE
      per canvas element and never removed, deliberately: the lost event must
      be canceled even while no orb is mounted on the canvas — an uncanceled
      webglcontextlost marks the context permanently unrestorable, and the
      router can show this exact canvas again later. Whether a loss leads to
      a revival is decided by `desired`, not by listener presence.
    */
    /*
      A canvas whose context has gone is not simply blank: Chrome paints its
      broken-image placeholder over the element's whole box — the white square
      you see on a reloaded grid. Hide the canvas the moment the context is
      lost, and let the generation that follows a restore reveal it again.
    */
    const hideNow = () => {
      /*
        Both, deliberately. The style write lands in this tick — the browser
        paints its placeholder over a dead canvas immediately, and a busy main
        thread can hold a React update for several frames. The state change is
        what keeps React's own view in sync, so the reveal that follows a
        restore clears the inline value again rather than fighting it.
      */
      canvas.style.opacity = "0";
      setPaintedKey(null);
    };

    const onContextLostHide = () => hideNow();
    canvas.addEventListener("webglcontextlost", onContextLostHide);

    /*
      Hand the context back before the next document asks for one.

      A hard reload never runs this effect's cleanup — the document is
      discarded whole — so the outgoing page's contexts are still alive while
      the incoming page allocates its own. On a grid of orbs that puts the
      live count past the browser's ~16 cap, and the ones it evicts are
      exactly the canvases that come back as placeholders until the restore
      path catches them. `persisted` is a bfcache suspend, where the page is
      shown again untouched and must keep everything it holds.
    */
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      try {
        loseExt?.loseContext();
      } catch {
        // Already released — nothing to hand back.
      }
    };
    window.addEventListener("pagehide", onPageHide);

    let ctl = canvasControllers.get(canvas);
    if (!ctl) {
      const created: CanvasContextController = { desired: false, start: null, stopGen: null };
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault(); // always cancel — keeps the context restorable
        created.stopGen?.();
        created.stopGen = null;
        if (created.desired) {
          /*
            Ask for the context back — but in a LATER task. The browser only
            marks a loss as restorable once the lost event's dispatch has
            completed and it has seen the canceled flag, so a restoreContext()
            issued during dispatch (or before it, as the mount path may) is
            silently refused. This is the path a synchronous cleanup+setup
            pair hits — React re-running the effect on the same canvas loses
            the context and wants it right back. For losses we didn't cause
            (eviction, GPU reset) the call may refuse; the canceled event then
            lets the browser restore on its own schedule.
          */
          setTimeout(() => {
            if (!created.desired) return;
            try {
              loseExt?.restoreContext();
            } catch {
              // Natural loss — restoration is the browser's call now.
            }
          }, 0);
        }
      });
      canvas.addEventListener("webglcontextrestored", () => {
        if (created.desired && created.start) {
          created.stopGen = created.start();
        }
      });
      canvasControllers.set(canvas, created);
      ctl = created;
    }
    const controller = ctl;

    controller.desired = true;
    controller.start = startGeneration;
    if (gl.isContextLost()) {
      // A previous run on this canvas released the context (effect re-run, or
      // the router re-showing a kept-alive page). If the lost event already
      // dispatched this request is honored now; if it is still queued, the
      // lost handler above re-requests it on dispatch.
      try {
        loseExt?.restoreContext();
      } catch {
        // No restore path — the orb stays blank rather than throwing.
      }
    } else {
      controller.stopGen = startGeneration();
    }

    return () => {
      /*
        Hide BEFORE tearing the context down.

        This cleanup releases the context deliberately, and the lost event it
        provokes is dispatched asynchronously — by which point the listener
        below is unhooked and the replacement effect has not drawn yet. That
        leaves a revealed canvas with a dead context, which is precisely what
        the browser paints its broken-canvas placeholder over. The window is
        not rare: any prop change in this effect's deps re-runs it, so it hits
        every time the drawer switches preview example (maxDpr differs on the
        layout one) or a wrapper is toggled.
      */
      hideNow();
      canvas.removeEventListener("webglcontextlost", onContextLostHide);
      window.removeEventListener("pagehide", onPageHide);
      controller.desired = false;
      controller.start = null;
      controller.stopGen?.();
      controller.stopGen = null;
      /*
        Release the context NOW instead of when the canvas is garbage
        collected. Browsers cap live WebGL contexts per page (~8–16) and evict
        the oldest when the cap is hit — client-side navigation that unmounts
        and remounts a page of orbs otherwise piles up zombie contexts until
        freshly mounted orbs get evicted and render blank.
      */
      try {
        loseExt?.loseContext();
      } catch {
        // Context already lost — nothing to release.
      }
    };
    /*
      `wrapped` is in here because turning a wrapper on or off moves the canvas
      from being this component's root element to being a child of the wrapper
      div — React drops the old element and mounts a new one, and the GL
      context, its observers and its render loop all belong to the old one. Any
      other prop leaves the element alone, INCLUDING a swap between two
      wrappers: the canvas keeps its slot among the decoration layers, so
      glass -> ring reuses the context instead of rebuilding it.
    */
  }, [variant, pauseOffscreen, maxDpr, wrapped]);

  const sizeStyle: CSSProperties =
    size === undefined ? {} : { width: size, height: size };

  /*
    Spread ahead of the caller's `style`, so an orb that wants to own its own
    opacity still can — it simply opts out of the reveal.

    A hard flip, deliberately: no transition, no fade. A hidden document
    (background tab, embedded preview) does not advance CSS transitions, so a
    faded reveal left orbs pinned at zero in exactly the case the synchronous
    first frame above exists to serve — mounted, healthy, and invisible. The
    cut is not a pop either way, since it happens on the frame the orb first
    has something to show.
  */
  const revealStyle: CSSProperties = painted ? {} : { opacity: 0 };

  const canvas = (
    <canvas
      // A lost WebGL context can't be reused, so each variant gets a fresh canvas.
      key={variant.key}
      ref={canvasRef}
      className={spec ? undefined : className}
      style={
        spec
          ? {
              display: "block",
              position: "absolute",
              left: `${spec.inset}%`,
              top: `${spec.inset}%`,
              width: `${100 - 2 * spec.inset}%`,
              height: `${100 - 2 * spec.inset}%`,
              ...revealStyle,
              ...(spec.mask ? masked(spec.mask) : {})
            }
          : { display: "block", ...sizeStyle, ...revealStyle, ...style }
      }
      role={!spec && ariaLabel ? "img" : undefined}
      aria-label={spec ? undefined : ariaLabel}
      aria-hidden={!spec && ariaLabel ? undefined : true}
    />
  );

  if (!spec) return canvas;

  /*
    Wrapped: the box becomes the orb's footprint and the canvas is absolutely
    positioned inside it. `under`, the canvas and `over` are all positioned
    with an auto z-index, so they paint in DOM order — decoration behind the
    orb, then the orb, then decoration in front of it.

    `aspectRatio` is the fallback for the sizeless case: `size` is optional
    (callers may size the orb with a class instead), and an absolutely
    positioned canvas contributes nothing to its parent's height, so without
    it a class that only sets a width would collapse the box to zero.
  */
  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        ...(spec.shadow ? { borderRadius: "50%", boxShadow: spec.shadow } : {}),
        ...sizeStyle,
        ...(wrapperColor ? { color: wrapperColor } : {}),
        ...style
      }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {spec.animated ? (
        <style
          href={WRAPPER_STYLE_HREF}
          precedence="default"
          dangerouslySetInnerHTML={{ __html: WRAPPER_CSS }}
        />
      ) : null}
      {spec.under}
      {canvas}
      {spec.over}
    </div>
  );
}
