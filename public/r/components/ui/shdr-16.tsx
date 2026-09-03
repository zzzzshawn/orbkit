/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-16 — sunlight through water: a caustic net crawling over the ball,
   split into colour at its edges, surging with the agent's voice.

   Not a port. Built from the README's own rule for surface detail — an
   isoline through a warped field — pushed until it reads as the thing it
   is imitating: the bright branching network a pool throws on its floor.

   What it is:

   - TWO FAMILIES OF LINES, CROSSED. 1 - abs(sin(q)) is one on a crest and
     zero between, on each axis; raised to a power it is a thin line or a
     broad wash, and the product of the two families is added back so the
     crossings burn hotter than the lines. That product is what makes it
     caustic rather than grid: real caustics are brightest where wavefronts
     focus together, and the crossings are exactly those foci. The sum is
     normalised to one at a crossing, on purpose: past the tone knee an
     unbounded sum clips every channel and the sun colour goes white, so
     gain would only ever buy you washout. Bounded, gold stays gold at the
     hottest focus.
   - THE WATER IS A FOLD. Before the lines are read, the plane is folded on
     its own sines three times at rising frequency, each octave on its own
     clock rate. That is refraction through a rippling surface, stated as a
     domain warp: the grid does not scroll, it is bent, and the lines branch
     and pinch where the bends pile up.
   - CHROMATIC SPLIT ON TIME, NOT SPACE. The net is read three times, one
     per channel, each at a slightly different moment of the fold. Where a
     line is moving its three readings disagree; where it holds still they
     agree. The light itself is the net's LUMINANCE under the sun colour,
     and the disagreement is split off as a zero-mean residual added back
     on its own amplitude — so the rainbow is a fringe on moving edges,
     never a tint on the whole net, and the sun colour survives it. That is
     how dispersion through water actually looks: white light, coloured
     edges.
   - THE SURGE is a round trip on an integrated clock through cos — it
     eases through both ends and never wraps, the shdr-31 construction —
     and it drives gain and ripple depth together, so the water brightens
     as it deepens. Depth is one amplitude, so a state can have all of it,
     none, or a flicker of it.

   Design decisions, each one a rule in the README:

   - THE ORB IS THE OBJECT. The net lives on the sphere's own surface
     direction, not on a disc cut out of a plane. But the README's move for
     flat fields — a stereographic projection of the dome — has a POLE, and
     a ball that turns indefinitely carries whatever texture is behind it
     through that pole, where the map stretches it toward infinity. The
     aurora hid an atan seam by crossfading two wrappings; this uses
     TRIPLANAR mapping instead, which has no seam and no pole: the plane
     field is read on the three axis planes of the surface direction and
     blended by how squarely each faces it. Three reads per channel, nine in
     all — the field is a handful of sines, so it is cheap.
   - EVERY INTERNAL FREQUENCY IS A LITERAL. The fold frequencies and the
     per-octave clock rates are written into the shader, so the net's
     spacing is ONE control — uP_scale — and it is the only spatial
     frequency in the orb. It is never staged. Everything a state does
     touch is an amplitude or an integrated clock, which is what lets all
     three states cross-fade with nothing racing across the surface.
   - pow() only ever sees a base in [0, 1] here — 1 - abs(sin) — so the
     edge exponent is safe to sweep. The tone knee is applied after a max()
     for the same reason.
   - Surface-lit and mask-bounded, so alpha IS coverage: premultiplied
     output, the opposite convention from the emissive orbs (see shdr-31).
---------------------------------------------------------------------------- */

const CAUSTIC_FRAG = `
// Volume- and surge-reactive values, resolved once per fragment in main().
float causticWarp;

/*
  The water. The plane is folded on its own sines three times, each octave
  at a literal frequency and on its own share of the clock, so the ripples
  refract the net rather than scroll it. Amplitude is the one control.
*/
vec2 fold(vec2 p, float t) {
  p += causticWarp        * sin(p.yx * 1.31 + vec2( t * 0.90, -t * 0.70));
  p += causticWarp * 0.60 * sin(p.yx * 2.17 + vec2(-t * 1.30,  t * 1.10));
  p += causticWarp * 0.35 * sin(p.yx * 3.73 + vec2( t * 1.90,  t * 1.60));
  return p;
}

/*
  The light. Two crossed families of crest lines, sharpened by the edge
  exponent — the base is 1 - abs(sin), always in [0, 1], so pow is defined —
  with their product added back so the crossings, where wavefronts focus,
  burn hotter than the lines between them.
*/
float net(vec2 p, float t) {
  vec2 q = fold(p, t);
  vec2 s = 1.0 - abs(sin(q));
  vec2 l = pow(s, vec2(uP_edge));
  // Normalised to [0, 1]: the sum peaks at four on a crossing, and left
  // unbounded it drove the tone knee into clipping all three channels,
  // which turns any sun colour white. Bounded, the sun colour survives
  // the knee at the foci and gain is a real brightness rather than a
  // race to white.
  return (l.x + l.y + 2.0 * l.x * l.y) * 0.25;
}

/*
  Triplanar: the plane field read on the three axis planes of the surface
  direction and blended by the fourth power of each component, so each
  plane only shows where it faces squarely. No pole and no seam — the ball
  can turn forever.
*/
float netOn(vec3 sp, float t) {
  vec3 w = sp * sp;
  w *= w;
  w /= (w.x + w.y + w.z);
  float k = uP_scale;
  return w.x * net(sp.yz * k, t) + w.y * net(sp.zx * k, t) + w.z * net(sp.xy * k, t);
}

void main() {
  vec2 uv = orbUV();
  float rd = length(uv);
  float R = uP_radius;
  float mask = smoothstep(0.012, -0.012, rd - R);
  if (mask <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));
  vec3 n = vec3(pl, z);

  // the ball turns about Y on its own integrated clock
  float cr = cos(uP_spin);
  float sr = sin(uP_spin);
  vec3 sp = vec3(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  float t = uP_flow; // integrated clock: the water

  /*
    The surge: a round trip on an integrated clock through cos, so it eases
    through both ends and never wraps. It lifts the gain and deepens the
    ripple together — brighter as the water heaves — and uP_swell is how
    much of that a state takes.

    Volume coupling in the family language: the agent's voice brightens the
    light, the user's deepens the water.
  */
  float surge = 0.5 - 0.5 * cos(uP_swellRate);
  float gainNow = uP_gain * mix(1.0, 0.55 + 0.9 * surge, uP_swell) * (0.8 + 0.5 * uOutput);
  causticWarp = uP_warp * mix(1.0, 0.8 + 0.4 * surge, uP_swell) * (1.0 + 0.35 * uInput);

  /*
    Three moments of the fold, one per channel. The LIGHT is the net's
    luminance under the sun colour, so gold is gold at the foci; the
    per-channel disagreement is split off as a zero-mean residual and added
    back scaled by uP_split, so the rainbow is a fringe that rides on the
    edges where they move and vanishes where they hold — never a tint on
    the whole net. Read once with the offset baked in and once without
    would cost the same three evaluations, so the offset is constant and
    the split is a plain amplitude on the residual: safe to stage.
  */
  float ds = 0.09;
  vec3 c = vec3(netOn(sp, t + ds), netOn(sp, t), netOn(sp, t - ds));
  float cLum = dot(c, vec3(1.0 / 3.0));
  vec3 fringe = (c - cLum) * uP_split;

  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  float fres = pow(1.0 - z, 2.5);

  // the floor of the pool, then the light thrown on it — dimmer round the
  // limb, where the floor tilts away from the sun
  vec3 col = uC_deep * (0.35 + 0.65 * uP_light * lambert);
  col += (uC_sun * cLum + fringe) * gainNow * (0.55 + 0.45 * lambert);
  col += uC_sheen * uP_rim * fres;

  col = pow(max(col, vec3(0.0)), vec3(uP_contrast));
  col = tanh3(col);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr16Orb: OrbVariant = {
  key: "shdr-16",
  label: "SHDR-16",
  note: "sunlight through water — a caustic net crawling over the ball, fringing into colour where it moves",
  frag: CAUSTIC_FRAG,
  params: [
    { key: "flow", label: "Water flow", min: 0.015, max: 10, step: 0.05, default: 0.9, integrate: true },
    { key: "spin", label: "Turn", min: 0, max: 5, step: 0.03, default: 0.08, integrate: true },
    { key: "swellRate", label: "Surge rate", min: 0, max: 8, step: 0.05, default: 0.6, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Net scale", min: 3, max: 30, step: 0.1, default: 9 },
    { key: "warp", label: "Ripple depth", min: 0, max: 3, step: 0.02, default: 0.8 },
    { key: "edge", label: "Line sharpness", min: 0.5, max: 10, step: 0.05, default: 2.2 },
    { key: "split", label: "Colour fringe", min: 0, max: 3, step: 0.02, default: 0.6 },
    { key: "swell", label: "Surge depth", min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: "gain", label: "Sun power", min: 0.05, max: 6, step: 0.05, default: 1.6 },
    { key: "contrast", label: "Tone knee", min: 0.15, max: 6, step: 0.05, default: 1.1 },
    { key: "light", label: "Floor light", min: 0, max: 3, step: 0.015, default: 0.9 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.6 }
  ],
  // the pool floor, the light thrown on it, and the wet gloss at the limb
  colors: [
    { key: "deep", label: "Water", default: "#0b2f6e" },
    { key: "sun", label: "Caustic light", default: "#7ff6ff" },
    { key: "sheen", label: "Sheen", default: "#bfe8ff" }
  ],
  /*
    Staged on the three integrated clocks and on amplitudes only — nothing
    a state touches is a spatial frequency, so every transition cross-fades
    with nothing racing across the surface. NET SCALE is the one frequency
    in the orb and it is never staged: it multiplies the surface direction
    before the fold, so gliding it would sweep the whole net through every
    spacing in between. Line sharpness is a power exponent on a base in
    [0, 1], an amplitude, and safe at any span.

    The read is in the water:

      idle     a slow pool, lit HARD. Gentle ripple, moderate lines, the
               faintest surge, the ball barely turning — but the sun at
               full power on a firmer knee, so the caustics burn white
               over dark red water.
      thinking NERVOUS water. The flow runs at three and a half times
               resting on a ripple nearly double rest's, and the lines
               go broad under it — a coarse, fast, restless net. The
               surge is shallow but quick, a flicker rather than a heave,
               and the ball all but freezes so the motion is in the
               light. The sun is dropped to half rest's power with the
               key light and rim pulled down: white on a darker red,
               dimmer than rest.
      speaking the water HEAVES, fast. Full surge depth on a rate five
               times rest's, so the light pumps in quick breaths, on the
               deepest ripple and the broadest lines — sheets of light
               rather than threads — with the colour split wide so every
               edge fringes, and the ball plainly turning beneath it. The
               rim is all but cut so the light is the sun alone. Warm:
               gold on brick red.
  */
  statePresets: {
    idle: {
      flow: 0.92,
      spin: 0.09,
      swellRate: 0.6,
      warp: 0.8,
      edge: 3,
      split: 0.6,
      swell: 0.15,
      gain: 6,
      contrast: 1.3,
      light: 0.9,
      rim: 0.6
    },
    thinking: {
      flow: 3.22,
      spin: 0.03,
      swellRate: 2.4,
      warp: 1.52,
      edge: 2.8,
      split: 0.36,
      swell: 0.26,
      gain: 3.35,
      contrast: 1.15,
      light: 0.525,
      rim: 0.21
    },
    speaking: {
      flow: 1.8,
      spin: 0.7,
      swellRate: 5.4,
      warp: 1.7,
      edge: 1.7,
      split: 1.1,
      swell: 1,
      gain: 3.6,
      contrast: 0.85,
      light: 0.96,
      rim: 0.18
    }
  },
  // aqua light on dark red water at rest, pure white on a darker red while
  // searching, gold on brick-red water while answering
  stateColors: {
    idle: {
      deep: "#6f0b0b",
      sun: "#7ff6ff",
      sheen: "#bfe8ff"
    },
    thinking: {
      deep: "#3a0808",
      sun: "#ffffff",
      sheen: "#ffffff"
    },
    speaking: {
      deep: "#8d2525",
      sun: "#ffb914",
      sheen: "#ffb3c6"
    }
  }
};

export type Shdr16Props = Omit<ShaderOrbProps, "variant">;

export function Shdr16({ size = 280, ...rest }: Shdr16Props) {
  return <ShaderOrb variant={shdr16Orb} size={size} {...rest} />;
}

export default Shdr16;
