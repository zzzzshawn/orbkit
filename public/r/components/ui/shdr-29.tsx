/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-29 — an LED tile wall lighting up in flowing blobs, wrapped on the
   ball, with confetti tiles scattered through the bright regions.

   Every screen cell is one physical TILE: a bright bevelled face inside a
   visible frame, and even an unlit tile keeps a faint dark presence — the
   wall itself never disappears, which is what makes the lit blobs read as
   light ON hardware rather than paint. A drifting fbm field, sampled
   through the stereographic wrap of a rotating dome, decides which tiles
   light and how hard; most lit tiles burn warm white, but a per-tile hash
   promotes a scattering of them to fully saturated confetti hues that
   reshuffle on their own clock.

   Construction notes:

   - The tile grid is RESOLUTION-RELATIVE (uP_cells across the canvas) —
     the lesson shdr-14 learned — so a gallery card and the playground
     show the same wall.
   - The FIELD samples once per tile (cell centre): one tile, one light
     level. The tile geometry renders per fragment so bevels stay crisp.
   - Confetti hues come from cos palettes over per-tile hashes; the
     promotion cycles with an integrated shuffle clock, so which tiles are
     coloured slowly reshuffles — and races while the orb thinks.
   - Each state ANIMATES differently on its own integrated clock (drift /
     shuffle / pulse), phase-safe as everywhere in this repo.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-28.
---------------------------------------------------------------------------- */

const MOSAIC_FRAG = `
void main() {
  // Volume coupling: user input widens the lit coverage, agent output turns
  // the panel brightness up.
  float coverNow = uP_coverage + 0.07 * uInput;
  float gainNow = uP_gain * (0.85 + 0.5 * uOutput);

  // resolution-relative tile grid — same wall at every size
  float cellPx = max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 4.0);
  vec2 cellIdx = floor(gl_FragCoord.xy / cellPx);
  vec2 cellCentre = (cellIdx + 0.5) * cellPx;
  vec2 g = fract(gl_FragCoord.xy / cellPx); // 0..1 inside the tile

  vec2 suv = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  vec2 uv = suv / uP_radius;
  float r2 = dot(uv, uv);

  // blocky silhouette, cut on the tile grid like the wall itself
  float mask = 1.0 - step(1.0, r2);

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = vec3(uv, z);

  // rotating dome, stereographic projection — the blobs roll around the
  // ball as the dome turns
  float rot = uP_spin; // integrated clock
  float cr = cos(rot);
  float sr = sin(rot);
  vec3 sp = vec3(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
  vec2 p2 = sp.xy / (abs(sp.z) + 1.2) * uP_scale * 3.0;

  /*
    Per-state motion, each on its own integrated clock:
      DRIFT    the blob field streams across the wall     (idle flows)
      CHURN    the fluid warp evolves in place            (thinking boils)
      SHUFFLE  the confetti promotion cycles              (thinking races it)
      PULSE    rings radiate from the centre              (speaking)
    Rates glide; a rate at zero freezes that motion with its phase intact.
    The pulse depth is an amplitude, so idle carries no static rings.
  */
  float driftT = uP_drift;     // integrated clock: blob stream
  float churnT = uP_churn;     // integrated clock: warp evolution
  float shuffleT = uP_shuffle; // integrated clock: confetti reshuffle
  vec2 f1 = vec2(driftT * 0.5, -driftT * 0.35);
  vec2 f2 = vec2(-churnT * 0.4, churnT * 0.6);

  /*
    FLUID domain warp: two decorrelated fbm channels displace the sample
    point before the blob field reads it, and the displacement itself
    evolves on the churn clock. The blobs curl, stretch and merge like
    liquid instead of sliding across the wall as one rigid sheet.
  */
  vec2 warp = vec2(
    fbm(p2 * 0.9 + f2),
    fbm(p2 * 0.9 + f2.yx + 13.7)
  ) - 0.5;
  float field = fbm(p2 + f1 + warp * uP_swirl * 2.4);

  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  float lum = smoothstep(1.0 - coverNow, 1.14 - coverNow, field
    + 0.25 * uP_light * lambert
    + uP_pulse * 0.3 * sin(length(uv) * 5.0 - driftT * 3.2));
  lum *= gainNow;

  /*
    The tile: a bevelled square face inside a frame. The face is the lit
    part; the frame stays dark; an unlit tile keeps a faint presence so the
    wall reads as hardware even where nothing is lit.
  */
  vec2 d2 = abs(g - 0.5);
  float d = max(d2.x, d2.y);
  float face = 1.0 - smoothstep(0.26, 0.36, d);
  float tile = 1.0 - smoothstep(0.42, 0.48, d);
  // a soft centre hot-spot on the face, like an LED under a diffuser
  float hot = 1.0 - smoothstep(0.0, 0.34, length(d2));

  /*
    Confetti: a per-tile hash cycles against the shuffle clock, and the top
    uP_confetti slice of the cycle is promoted from warm white to a fully
    saturated hue drawn from a second hash. Which tiles are coloured
    therefore reshuffles continuously — slowly at rest, fast in thought.
  */
  float h1 = hash(cellIdx * 1.618 + 7.3);
  float h2 = hash(cellIdx * 2.113 + 41.7);
  float cyc = fract(h1 + shuffleT * 0.06);
  float promoted = step(1.0 - uP_confetti, cyc);
  vec3 confetti = 0.5 + 0.5 * cos(6.2831 * (h2 + vec3(0.0, 0.33, 0.67)));
  confetti = normalize(confetti + 0.05) * 1.2;
  vec3 litCol = mix(uC_lit, confetti, promoted);

  // lit face over the dark wall; frames and off-tiles stay faintly present
  vec3 offCol = uC_wall * tile;
  vec3 onCol = litCol * (face * 1.05 + hot * 0.5) * lum;
  vec3 col = offCol + onCol;

  col = pow(max(col, 0.0), vec3(uP_contrast));

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(col * a, a);
}
`;

export const shdr29Orb: OrbVariant = {
  key: "shdr-29",
  label: "SHDR-29",
  note: "an LED tile wall lighting up in flowing blobs, wrapped on the ball",
  frag: MOSAIC_FRAG,
  params: [
    { key: "drift", label: "Drift", min: 0, max: 10, step: 0.05, default: 0.45, integrate: true },
    { key: "churn", label: "Churn", min: 0, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "swirl", label: "Fluidity", min: 0, max: 3, step: 0.015, default: 1.2 },
    { key: "shuffle", label: "Shuffle", min: 0, max: 20, step: 0.1, default: 0.6, integrate: true },
    { key: "pulse", label: "Pulse depth", min: 0, max: 2, step: 0.01, default: 0 },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.1, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "cells", label: "Tile grid", min: 16, max: 160, step: 2, default: 48 },
    { key: "scale", label: "Blob scale", min: 0.3, max: 10, step: 0.1, default: 1.3 },
    { key: "coverage", label: "Coverage", min: 0, max: 1.2, step: 0.01, default: 0.52 },
    { key: "confetti", label: "Confetti", min: 0, max: 1, step: 0.01, default: 0.22 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.6 },
    { key: "gain", label: "Panel gain", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1 }
  ],
  colors: [
    { key: "lit", label: "Lit tile", default: "#fff2dd" },
    { key: "wall", label: "Wall", default: "#161616" }
  ],
  /*
    Each state animates DIFFERENTLY — its own motion, same palette and
    composition throughout (no stateColors on purpose).
  */
  /*
    Coverage is staged DOWN in the active states on purpose: the synthesized
    volumes push it up, and without the counterweight thinking and speaking
    flood the wall with light — the composition lives on its big dark
    voids, so every state keeps them.
  */
  statePresets: {
    // idle FLOWS: blobs streaming and curling slowly, lava-lamp pace
    idle: {
      drift: 0.45,
      churn: 0.5,
      shuffle: 0.6,
      pulse: 0,
      spin: 0.1,
      coverage: 0.52,
      gain: 1
    },
    // thinking BOILS: the stream stops but the fluid warp churns hard in
    // place while the confetti races — blobs kneading among the voids
    thinking: {
      drift: 0.1,
      churn: 1.9,
      shuffle: 5,
      pulse: 0,
      spin: 0.03,
      coverage: 0.42,
      gain: 0.95
    },
    // speaking PULSES: rings radiate through the flowing wall as the dome
    // rolls — the rings carve dark bands as much as they light bright ones
    speaking: {
      drift: 0.5,
      churn: 0.9,
      shuffle: 1.2,
      pulse: 0.55,
      spin: 0.45,
      coverage: 0.44,
      gain: 1.15
    }
  }
};

export type Shdr29Props = Omit<ShaderOrbProps, "variant">;

export function Shdr29({ size = 280, ...rest }: Shdr29Props) {
  return <ShaderOrb variant={shdr29Orb} size={size} {...rest} />;
}

export default Shdr29;
