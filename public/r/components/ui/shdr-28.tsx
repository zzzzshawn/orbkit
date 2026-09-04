/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-28 — a tumbling bit-sphere: nested binary grids shuttering on a ball.

   Ported from a golfed twigl listing:

     vec2 p=(round(FC.xy)-.5*r)/r.y,v;
     for(float i;i++<20.;o+=vec4(fwidth(v=ceil(p)).xyy,
       fract(length(v)/i-t*.2))*(1.-o.a))p+=p;

   What it actually is, decoded:

   - p += p is the whole engine: a BINARY ZOOM. Twenty doublings give
     twenty nested power-of-two grids over the same pixel.
   - fwidth(v = ceil(p)) is zero inside a cell and spikes exactly where the
     cell index jumps — it draws the grid lines of every level. The .xyy
     swizzle splits them: x-boundaries in red, y-boundaries in green+blue.
   - The alpha channel accumulates fract(length(v)/i - t*.2) — an animated
     value per CELL — and the *(1.-o.a) factor is front-to-back UNDER
     compositing: each level's cells shutter the levels beneath. That
     occlusion cascade is the whole bit-plane flicker.
   - Deep levels alias (a cell per pixel) into solid planes; the shutter is
     what keeps them from whiting out.

   Port decisions:

   - THE ORB IS THE OBJECT — the standing design rule (see README). A flat
     binary lattice masked to a disc reads as a coin. Instead the lattice is
     wrapped ON the ball: dome point, a real 3D tilt + spin rotation (the
     spin on its own integrated clock), then a stereographic projection so
     the grids curve and compress around the sphere. A shaded body and a
     fresnel rim make it a solid, tumbling bit-sphere.
   - fwidth() needs the OES_standard_derivatives EXTENSION in WebGL 1, and
     the #extension directive cannot legally follow the prelude's
     declarations. It is not needed: the zoom chain is exact, so the pixel
     footprint at level i is analytic — px0 * 2^i — and the same edge test
     falls out of fract() against it, with line width as a free parameter.
   - round() is ES 3.0 (the original only pixel-snaps with it) and o, v, i
     rely on twigl's zero-init — uninitialised locals are UNDEFINED in
     GLSL ES 1.0, so everything is explicit here.
   - The clock enters only as an additive phase inside fract(), so the
     unbounded integrated clock stays safe, as everywhere in this repo.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, the opposite convention from the emissive orbs (see README).
---------------------------------------------------------------------------- */

/*
 * The level cap is a `#define`: ES 1.0 requires constant loop bounds.
 * uP_levels breaks out early below it.
 */
const BITDUMB_FRAG = `
#define LEVELS 20

// Volume-reactive values, resolved once per fragment in main().
float bitdumbGain;
float bitdumbBody;

mat2 bdRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  bitdumbGain = uP_gain * (1.0 + 0.6 * uInput);
  bitdumbBody = uP_body * (1.0 + 0.8 * uOutput);

  vec2 uv = orbUV() / uP_radius;
  float r2 = dot(uv, uv);

  // analytic disc silhouette — this orb is parameterised on the dome, so
  // the exact edge is just the unit circle, with the same tunable band as
  // the raymarched orbs
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(1.0 - band, 1.005, length(uv));

  // front dome point and its normal (view space)
  float zc = sqrt(max(1.0 - r2, 0.0));
  vec3 n = vec3(uv, zc);

  // tumble the sphere point with real rotations, then project. abs() on z
  // mirror-wraps the hemisphere the tumble turns away, avoiding the
  // stereographic pole blow-up.
  vec3 sp = n;
  sp.yz = bdRot(uP_tilt) * sp.yz;
  sp.xz = bdRot(uP_spin) * sp.xz; // integrated clock
  vec2 p = sp.xy / (abs(sp.z) + 1.0) * uP_gridScale;

  /*
    Analytic pixel footprint in grid space, in place of fwidth(): one
    screen pixel in uv units, through the radius scale, the dome stretch
    (grids compress toward the rim, so a pixel covers more of them there),
    and the grid scale. Doubled alongside p every level.
  */
  float px = (2.0 / min(uRes.x, uRes.y)) / uP_radius / max(zc, 0.2) * uP_gridScale;

  vec4 acc = vec4(0.0);
  float phase = uP_speed * 0.2; // integrated clock, additive phase

  for (int i = 0; i < LEVELS; i++) {
    float fi = float(i) + 1.0;
    if (fi > uP_levels) break;

    // the listing's engine, kept verbatim: binary zoom
    p += p;
    px += px;

    vec2 v = ceil(p);
    vec2 f = fract(p);

    // distance to the nearest cell line, against this level's footprint —
    // the extension-free fwidth. Deep levels saturate to solid planes,
    // exactly like the original's aliasing.
    vec2 e2 = 1.0 - smoothstep(vec2(0.0), vec2(px * uP_lineW), min(f, 1.0 - f));

    // x-lines and y-lines separately tintable — the original's .xyy
    vec3 edgeCol = uC_lineA * e2.x + uC_lineB * e2.y;

    // the per-cell shutter value, and the under-compositing that makes
    // level i occlude level i+1 — both straight from the listing
    float aBit = fract(length(v) / fi - phase) * uP_shutter;
    acc += vec4(edgeCol, aBit) * (1.0 - acc.a);

    if (acc.a > 0.996) break;
  }

  vec3 col = acc.rgb * bitdumbGain;

  // the ball body: a lambert-shaded base under the lattice, so the orb
  // reads as a solid object rather than lines floating on nothing
  vec3 L = normalize(vec3(-0.4, 0.5, 0.75));
  float shade = 0.25 + 0.75 * clamp(dot(n, L), 0.0, 1.0);
  col += uC_base * shade * bitdumbBody;

  // fresnel rim to sell the sphere
  col += uC_rim * pow(1.0 - zc, uP_rimPow) * uP_rim;

  col = pow(max(col, 0.0), vec3(uP_contrast));

  // coverage alpha; safety taper fades colour AND alpha, as always
  float fade = 1.0 - smoothstep(uP_edgeFade, 1.0, length(orbUV()));
  float a = mask * fade;

  // Surface-lit orb bounded by a mask: alpha IS coverage, so premultiply —
  // the opposite of the emissive orbs (see the note in shdr-31).
  gl_FragColor = vec4(col * a, a);
}
`;

export const shdr28Orb: OrbVariant = {
  key: "shdr-28",
  label: "SHDR-28",
  note: "nested binary grids shuttering on a tumbling bit-sphere",
  frag: BITDUMB_FRAG,
  params: [
    { key: "speed", label: "Shutter drift", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "spin", label: "Tumble rate", min: 0, max: 5, step: 0.03, default: 0.15, integrate: true },
    { key: "tilt", label: "Tumble tilt", min: 0, max: 4, step: 0.02, default: 0.5 },
    { key: "radius", label: "Radius", min: 0.1, max: 3, step: 0.015, default: 0.9 },
    { key: "gridScale", label: "Grid scale", min: 0.5, max: 20, step: 0.1, default: 2 },
    // 12 levels / wider lines: past ~12 the deep grids alias into solid white
    // planes that swallow the line palette — the state staging below depends
    // on the coarse lines and body actually carrying their colours
    { key: "levels", label: "Bit depth", min: 4, max: 20, step: 1, default: 12 },
    { key: "lineW", label: "Line width", min: 0.5, max: 15, step: 0.1, default: 2 },
    { key: "shutter", label: "Shutter", min: 0, max: 4, step: 0.02, default: 1 },
    { key: "gain", label: "Line gain", min: 0.05, max: 10, step: 0.05, default: 1 },
    { key: "body", label: "Body glow", min: 0, max: 5, step: 0.03, default: 1 },
    { key: "rim", label: "Rim light", min: 0, max: 5, step: 0.03, default: 0.6 },
    { key: "rimPow", label: "Rim tightness", min: 0.3, max: 20, step: 0.1, default: 3 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [
    { key: "lineA", label: "X lines", default: "#ff5a4d" },
    { key: "lineB", label: "Y lines", default: "#59d8ff" },
    { key: "base", label: "Body", default: "#101528" },
    { key: "rim", label: "Rim", default: "#bcd8ff" }
  ],
  /*
    The states are staged on the two integrated clocks: thinking runs the
    shutter cascade hot AND sets the sphere tumbling — the bits computing
    furiously while the orb turns them over — and speaking tumbles harder
    still while the flicker stays moderate: the orb turning to answer. Both
    clocks integrate, so every rate change glides without a phase jump.
  */
  statePresets: {
    /*
      calm: a steady flicker at double the old rate, lazy tumble. Two bits
      shallower and the lines a quarter wider, so the grid reads bolder
      and coarser; the body glow eased down and the rim pulled tight —
      red and white lines on black, no halo.
    */
    idle: {
      speed: 1,
      spin: 0.1,
      levels: 10,
      lineW: 2.5,
      shutter: 1.02,
      gain: 1,
      body: 0.9,
      rim: 0.6,
      rimPow: 5.2,
      contrast: 1.2
    },
    // computing: the shutter cascade races (2.4x idle) and the tumble goes
    // with it, eight times idle, on wider lines and a lifted gain; the body
    // dims so the flickering cells carry the light
    thinking: {
      speed: 2.4,
      spin: 0.81,
      lineW: 2.9,
      shutter: 0.94,
      gain: 1.2,
      body: 0.85,
      rim: 0.7
    },
    /*
      answering: hard fast tumble on a grid five times finer and seven bits
      deeper, so the sphere goes dense with cells; the body is all but cut
      and the rim brought up hard and pulled tight, so the light sits on
      the limb and the circuitry, not the ball.

      gain stays LOW on purpose: the shader multiplies it by (1 + 0.6 *
      input volume), and speaking synthesizes input around 0.65 — a 1.35
      preset lands near x1.9 effective, which clamps the lines to white
      and reads as a pale wash. 0.95 keeps the effective gain near 1.3,
      where the red survives.
    */
    speaking: {
      speed: 3,
      spin: 1.1,
      gridScale: 10.3,
      levels: 17,
      shutter: 1.2,
      gain: 0.95,
      body: 0.27,
      rim: 1.53,
      rimPow: 10,
      contrast: 1.45
    }
  },
  /*
    Four stageable colours, and one palette across all three states: red
    and white circuitry on pure black. The states are told apart by the
    tumble, the grid and the line weight, not the colour.
  */
  stateColors: {
    idle: { lineA: "#ff1100", lineB: "#ffffff", base: "#000000", rim: "#000000" },
    thinking: { lineA: "#ff0000", lineB: "#ffffff", base: "#000000", rim: "#000000" },
    speaking: { lineA: "#ff0000", lineB: "#ffffff", base: "#000000", rim: "#000000" }
  }
};

export type Shdr28Props = Omit<ShaderOrbProps, "variant">;

export function Shdr28({ size = 280, ...rest }: Shdr28Props) {
  return <ShaderOrb variant={shdr28Orb} size={size} {...rest} />;
}

export default Shdr28;
