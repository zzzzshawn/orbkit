/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-23 — an ASCII glyph matrix in CRT green, wrapped on the ball.

   The terminal renderer of the family. The screen is a fixed grid of glyph
   cells, and each cell draws a woven character — stacked horizontal dashes
   split by thin vertical gaps — whose LIT ROW COUNT quantizes the field
   behind it. That is exactly how ASCII art shades: space, dot, dash, block.
   The field itself is drifting fbm sampled through a stereographic
   projection of the rotating dome, so the character weave streams and
   compresses around the sphere. On top of it, a DROPOUT mask sampled on a
   coarser super-grid eats blocky rectangular voids out of the matrix —
   the field's dark zones become the chunky black holes of the reference
   aesthetic rather than dim glyphs.

   Construction notes:

   - The cell grid is RESOLUTION-RELATIVE (uP_cells across the canvas), the
     lesson shdr-14 learned: sized in device pixels, a gallery card
     collapses to a few dozen blotches while the playground looks right.
   - The FIELD is sampled once per cell (at the cell's centre) so a glyph
     is one character, not a gradient; the glyph geometry itself renders
     per fragment so its dashes stay crisp at any size. The dropout mask
     snaps to 2x2 super-cells, which is what makes the voids blocky.
   - Clocks enter only as additive phase (field drift) or through the dome
     rotation (integrated spin clock) — phase-safe as everywhere here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-28.
---------------------------------------------------------------------------- */

const PHOSPHOR_FRAG = `
void main() {
  // Volume coupling: user input densifies the glyphs, agent output turns
  // the phosphor up — the matrix visibly burns brighter while it speaks.
  float densBias = uP_density + 0.2 * uInput;
  float gainNow = uP_gain * (0.85 + 0.5 * uOutput);

  // resolution-relative glyph grid — same character count at every size
  float cellPx = max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 4.0);
  vec2 cellIdx = floor(gl_FragCoord.xy / cellPx);
  vec2 cellCentre = (cellIdx + 0.5) * cellPx;
  vec2 g = fract(gl_FragCoord.xy / cellPx); // 0..1 inside the cell

  vec2 suv = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  vec2 uv = suv / uP_radius;
  float r2 = dot(uv, uv);

  // blocky silhouette, cut on the cell grid like the rest of the matrix
  float mask = 1.0 - step(1.0, r2);

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = vec3(uv, z);

  // rotating dome, stereographic projection — the weave compresses toward
  // the rim and rolls around the ball as the dome turns
  float rot = uP_spin; // integrated clock
  float cr = cos(rot);
  float sr = sin(rot);
  vec3 sp = vec3(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);
  vec2 p2 = sp.xy / (abs(sp.z) + 1.2) * uP_scale * 3.0;

  /*
    Three motions, one per state, each on its OWN integrated clock so a
    state change morphs the movement instead of jumping it:

      DRIFT   diagonal lava-flow streaming        (idle)
      SCROLL  vertical paging, terminal-style     (thinking)
      PULSE   radial waves radiating from centre  (speaking)

    The clocks are rates in the presets — a rate gliding to zero freezes
    that motion in place, phase intact. The pulse's amplitude is a separate
    non-integrated param, so idle carries no static rings.
  */
  float driftT = uP_drift;   // integrated clock: diagonal stream
  float scrollT = uP_scroll; // integrated clock: vertical paging
  float t = uP_speed;        // integrated clock: pulse phase
  vec2 flow = vec2(driftT * 0.6, -driftT * 0.45 - scrollT);

  float field = fbm(p2 + flow);
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  float dens = clamp((field - 0.5) * 1.8 + densBias + 0.4 * uP_light * lambert
    + uP_pulse * 0.35 * sin(length(uv) * 5.5 - t * 2.4), 0.0, 1.0);

  /*
    The glyph: four dash rows split by three stripe gaps. Rows light from
    the bottom as density rises — the step() against the row index IS the
    ASCII quantizer, so a cell is always a whole character.
  */
  float rowI = floor(g.y * 4.0);
  float bar = step(0.22, fract(g.y * 4.0)) * step(fract(g.y * 4.0), 0.9);
  float stripe = step(0.18, fract(g.x * 3.0));
  float lit = step(rowI + 0.5, dens * 4.0 * gainNow);
  float glyph = bar * stripe * lit;

  /*
    Blocky dropouts: the same field, resampled on a 2x2 super-grid and
    thresholded. Because whole super-cells fail together, the dark zones
    become hard rectangular holes instead of dim characters.
  */
  vec2 superCentre = (floor(cellIdx / 2.0) * 2.0 + 1.0) * cellPx;
  vec2 sSuv = (2.0 * superCentre - uRes) / min(uRes.x, uRes.y);
  vec2 sUv2 = sSuv / uP_radius;
  float sz = sqrt(max(1.0 - dot(sUv2, sUv2), 0.0));
  vec3 ssp = vec3(sUv2.x * cr - sz * sr, sUv2.y, sUv2.x * sr + sz * cr);
  float superField = fbm(ssp.xy / (abs(ssp.z) + 1.2) * uP_scale * 3.0 + flow);
  float keep = step(uP_dropout, superField + 0.15 * uOutput);
  glyph *= keep;

  // phosphor ramp: deep green floor to hot glow, whitening at the top end
  vec3 glyphCol = mix(uC_deep, uC_glow, dens);
  glyphCol += vec3(0.7, 1.0, 0.9) * pow(dens, 3.0) * 0.35;

  // a dark body under the matrix plus a glow-coloured fresnel rim, so the
  // orb reads as a solid ball and not loose characters
  float fres = pow(1.0 - z, 2.2);
  vec3 col = uC_deep * 0.22 + glyphCol * glyph + uC_glow * fres * uP_rim;

  col = pow(max(col, 0.0), vec3(uP_contrast));

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(col * a, a);
}
`;

export const shdr23Orb: OrbVariant = {
  key: "shdr-23",
  label: "SHDR-23",
  note: "an ASCII glyph matrix in CRT green, wrapped on the ball",
  frag: PHOSPHOR_FRAG,
  params: [
    { key: "drift", label: "Drift", min: 0, max: 10, step: 0.05, default: 0.55, integrate: true },
    { key: "scroll", label: "Scroll", min: 0, max: 10, step: 0.05, default: 0.05, integrate: true },
    { key: "speed", label: "Pulse rate", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "pulse", label: "Pulse depth", min: 0, max: 2, step: 0.01, default: 0 },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.12, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "cells", label: "Glyph grid", min: 16, max: 120, step: 2, default: 40 },
    { key: "scale", label: "Field scale", min: 0.3, max: 10, step: 0.1, default: 1.6 },
    { key: "density", label: "Glyph density", min: 0, max: 2, step: 0.01, default: 0.48 },
    { key: "dropout", label: "Dropout", min: 0, max: 1, step: 0.01, default: 0.48 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.6 },
    { key: "rim", label: "Rim glow", min: 0, max: 3, step: 0.015, default: 0.45 },
    { key: "gain", label: "Phosphor gain", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1 }
  ],
  colors: [
    { key: "glow", label: "Glow", default: "#57ffc9" },
    { key: "deep", label: "Deep", default: "#0b3b2d" }
  ],
  /*
    Each state ANIMATES differently — its own kind of motion, not just its
    own speed — and each has its own phosphor colour. Every motion has its own integrated clock, so a rate gliding to zero
    freezes that motion in place with its phase intact; the pulse depth is
    an amplitude.
  */
  statePresets: {
    /*
      idle DRIFTS: slow diagonal lava-flow, lazy roll — on a far finer,
      sparser screen than the working states. The glyph grid is nearly
      doubled and the field scale tripled, with the density down by a third
      and half the dropout, so the matrix reads as a fine violet mesh under
      a strong key light and a bright rim, slightly dimmed.
    */
    idle: {
      drift: 0.55,
      scroll: 0.05,
      pulse: 0,
      speed: 0.52,
      spin: 0.12,
      cells: 68,
      scale: 5.1,
      density: 0.31,
      dropout: 0.24,
      light: 1.11,
      rim: 0.66,
      gain: 0.9
    },
    /*
      thinking STREAMS: the drift runs at six times idle with a steady
      vertical scroll under it and a pulse near speaking depth, on a dome
      almost stopped — the matrix pours across the ball rather than paging.
      The finest grid of the three and the least dropout, so the field is
      nearly solid, on idle's field scale with a touch more contrast.
    */
    thinking: {
      drift: 3.05,
      scroll: 0.65,
      pulse: 0.58,
      speed: 0.45,
      spin: 0.04,
      cells: 86,
      density: 0.33,
      dropout: 0.13,
      light: 0.855,
      rim: 0.51,
      contrast: 1.3,
      gain: 0.95
    },
    /*
      speaking PULSES, hard: radial waves at more than double the thinking
      depth, driven at five times its rate, radiate through the glyphs while
      the dome rolls at nearly a full spin. The grid goes to its finest and
      the field scale past idle's, with the densest glyphs and the heaviest
      dropout of the three — a coarse, flickering red screen — under a dim
      key light with the phosphor gain tripled.
    */
    speaking: {
      drift: 0.4,
      scroll: 0.1,
      pulse: 1.27,
      speed: 2.85,
      spin: 1.05,
      cells: 120,
      scale: 7.2,
      density: 0.56,
      dropout: 0.59,
      light: 0.39,
      rim: 0.51,
      gain: 2.95
    }
  },
  // violet at rest, aqua while searching, red while answering
  stateColors: {
    idle: { glow: "#6a57ff" },
    thinking: { glow: "#57ffe3" },
    speaking: { glow: "#ff5757" }
  }
};

export type Shdr23Props = Omit<ShaderOrbProps, "variant">;

export function Shdr23({ size = 280, ...rest }: Shdr23Props) {
  return <ShaderOrb variant={shdr23Orb} size={size} {...rest} />;
}

export default Shdr23;
