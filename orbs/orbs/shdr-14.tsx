/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-14 — demoscene sine-plasma on a rolling dome, quantized to chunky
   two-tone pixels.

   The one retro renderer in the family, and it animates like one: the
   luminance is the CLASSIC demo plasma — three interfering sine waves —
   evaluated on the sphere's rotating dome point so the wavefronts roll
   around the ball, plus a ripple source that orbits the dome and pushes
   expanding rings through the interference. A lambert term keeps the ball
   solid and a fresnel rim edges it. All of it collapses into one luminance,
   and an 8x8 ORDERED BAYER DITHER snaps that onto a short tone ladder
   between two colours, ink and paper. At 2 tone steps it is the classic
   1-bit look.

   Construction notes:

   - The Bayer matrix is generated PROCEDURALLY. GLSL ES 1.0 has no array
     initializer lists and no bitwise operators, so the usual lookup-table
     and bit-interleave constructions are both unavailable. The fract() form
     below produces the exact 2x2 base matrix, and the recursion
     M(2n) = M(n)/4 + M(2) builds 8x8 from it.
   - The content is sampled at each CELL's centre, not per fragment, so the
     dots are crisp squares — including the silhouette, which goes blocky at
     the rim on purpose. Averaging per fragment would anti-alias the grid
     away and leave gray mush.
   - The dither threshold is per screen cell and static: ordered dither does
     not crawl. All motion lives in the content underneath it.
   - Clocks enter only as additive phase (plasma drift) or through cos/sin
     (light orbit) — integrated clocks, phase-safe as everywhere here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-28.
---------------------------------------------------------------------------- */

const DITHER_FRAG = `
// 2x2 Bayer base: floor/fract only. (0,0)=0, (1,0)=.5, (0,1)=.75, (1,1)=.25
// — the 0,2,3,1 ordering over 4.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

// 8x8 by recursion: M8 = M2(a/4)/16 + M2(a/2)/4 + M2(a). No arrays, no
// bitwise — neither exists in GLSL ES 1.0.
float bayer8(vec2 a) {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}

void main() {
  // Volume coupling: user input deepens the waves, agent output brightens
  // the whole tone ladder — the dot field visibly blooms while it speaks.
  float plasmaAmt = uP_plasma * (1.0 + 0.4 * uInput);
  float gainNow = uP_gain * (0.85 + 0.5 * uOutput);

  /*
    Chunky pixel grid, RESOLUTION-RELATIVE: uP_cells is how many cells span
    the canvas, so a 190px gallery card and a 420px playground orb show the
    same composition — the same wave resolved by the same number of dots.
    Sized in device pixels instead, small canvases collapse to a few dozen
    blotches. All content below samples at the cell centre so every dot is
    one flat square.
  */
  float cellPx = max(min(uRes.x, uRes.y) / max(uP_cells, 8.0), 1.0);
  vec2 pix = floor(gl_FragCoord.xy / cellPx);
  vec2 cellCentre = (pix + 0.5) * cellPx;

  vec2 suv = (2.0 * cellCentre - uRes) / min(uRes.x, uRes.y);
  vec2 uv = suv / uP_radius;
  float r2 = dot(uv, uv);

  // blocky silhouette — cut on the cell grid, deliberately not smoothed
  float mask = 1.0 - step(1.0, r2);

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = vec3(uv, z);

  /*
    The plasma is evaluated in a ROTATING frame: the dome point spins about
    Y on its own integrated clock, so the wavefronts roll around the ball
    instead of sliding across a flat disc. The light stays screen-fixed —
    the form shading holds still while the pattern travels over it.
  */
  float rot = uP_spin; // integrated clock
  float cr = cos(rot);
  float sr = sin(rot);
  vec3 sp = vec3(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  float t = uP_speed; // integrated clock

  // the classic demoscene plasma: three interfering sine waves, each on its
  // own direction and rate
  float f = uP_scale;
  float v = sin(sp.x * f * 3.1 + t)
    + sin((sp.y * 0.85 + sp.z * 0.4) * f * 3.6 - t * 1.3)
    + sin((sp.x + sp.y + sp.z) * f * 2.2 + t * 0.7);

  // a ripple source orbiting the dome — expanding rings pushed through the
  // interference; the clock enters only as additive phase
  vec2 src = 0.55 * vec2(cos(t * 0.5), sin(t * 0.5));
  v += sin(length(uv - src) * f * 5.0 - t * 2.2);
  v *= 0.25; // four unit waves back to -1..1

  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  float fres = pow(1.0 - z, 2.0);

  // waves modulated by the dome shading, so the ball stays a ball under
  // the rolling pattern; everything collapses into one luminance
  float lum = (0.5 + 0.5 * v * plasmaAmt) * (0.3 + uP_light * lambert)
    + uP_rim * fres;
  lum = pow(clamp(lum * gainNow, 0.0, 1.0), uP_contrast);

  // ordered dither onto the tone ladder — levels 2 is the classic 1-bit
  // look, higher values keep the grain but add mid-tones
  float steps = max(uP_levels - 1.0, 1.0);
  float q = clamp(floor(lum * steps + bayer8(pix)) / steps, 0.0, 1.0);

  vec3 col = mix(uC_ink, uC_paper, q);

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(col * a, a);
}
`;

export const shdr14Orb: OrbVariant = {
  key: "shdr-14",
  label: "SHDR-14",
  note: "a lit plasma dome quantized to chunky two-tone pixels",
  frag: DITHER_FRAG,
  params: [
    { key: "speed", label: "Wave speed", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.15, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "cells", label: "Grid cells", min: 32, max: 320, step: 2, default: 140 },
    { key: "levels", label: "Tone steps", min: 2, max: 8, step: 1, default: 3 },
    { key: "scale", label: "Wave scale", min: 0.3, max: 12, step: 0.1, default: 1.5 },
    { key: "plasma", label: "Wave amount", min: 0, max: 3, step: 0.015, default: 0.9 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.9 },
    { key: "rim", label: "Rim light", min: 0, max: 3, step: 0.015, default: 0.35 },
    { key: "gain", label: "Brightness", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.1 }
  ],
  colors: [
    { key: "ink", label: "Ink", default: "#101426" },
    { key: "paper", label: "Paper", default: "#cfe6ff" }
  ],
  /*
    Staged in the family language: thinking churns the plasma in place while
    the light freezes, speaking sweeps the light fast and brightens the
    ladder. `pixel` and `levels` never move between states — both quantize,
    and a gliding quantizer pops instead of fading.
  */
  statePresets: {
    // calm: waves rolling slowly, dome barely turning
    idle: {
      speed: 0.5,
      spin: 0.15,
      plasma: 0.9,
      gain: 1,
      contrast: 1.1
    },
    // computing: the interference races IN PLACE — wave clock at three
    // times idle, deeper waves — while the dome stops turning
    thinking: {
      speed: 1.6,
      spin: 0.05,
      plasma: 1.15,
      gain: 0.95,
      contrast: 1.15
    },
    // answering: the whole dome rolls fast and the tones bloom bright
    speaking: {
      speed: 1.3,
      spin: 0.8,
      plasma: 1,
      gain: 1.3,
      contrast: 1.05
    }
  },
  // ink/paper carry the at-a-glance read: cool print at rest, violet-blue
  // while computing, warm amber while answering
  stateColors: {
    idle: { ink: "#101426", paper: "#cfe6ff" },
    thinking: { ink: "#140f38", paper: "#a9b9ff" },
    speaking: { ink: "#2a1410", paper: "#ffd9a4" }
  }
};

export type Shdr14Props = Omit<ShaderOrbProps, "variant">;

export function Shdr14({ size = 280, ...rest }: Shdr14Props) {
  return <ShaderOrb variant={shdr14Orb} size={size} {...rest} />;
}

export default Shdr14;
