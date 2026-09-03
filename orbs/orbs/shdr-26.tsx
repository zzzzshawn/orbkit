/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-26 — a crazed web of thin coloured threads, knotted to a cell grid.

   Ported from a three-line listing in one of the golf dialects:

     f2 c = C.xy / R.y*4+R, s = flr(c), i;
     @(9) c+=cos(++i * c.yx + .1/(s-c) + T) / i
     O = exp(-3*abs(sin(c.y+f4(,.4,.2,))))

   (f2/f4 are vec2/vec4, flr is floor, @(9) is a nine-iteration loop, and the
   empty slots in f4(,.4,.2,) are zeros.)

   What it actually is, decoded:

   - The warp is the same nine-octave FEEDBACK curl as shdr-08's — each
     octave reads the last one's result with its components swapped — but
     with two differences that change everything: the clock enters as a
     SHARED phase rather than one multiplied per octave, so this field
     boils coherently instead of shimmering, and each octave carries a
     LATTICE POLE term.
   - .1/(s-c) is the pole, and it is the whole idea. s is the sample's cell
     corner, taken ONCE before the loop, so s - c starts as -fract(c) and
     then drifts as the warp moves c away from its own cell. The phase
     blows up as a sample approaches a lattice point, so the field knots
     violently around a grid of singularities: cell interiors flow, cell
     corners tear.
   - The listing adds the RESOLUTION to c, which looks like it seeds the
     lattice — but s - c subtracts it straight back out, so it cancels
     exactly and only shifts the lattice phase. Dropped here (the same
     resolution-as-phase trap written up in shdr-08, where it did NOT
     cancel).
   - exp(-3*abs(sin(x))) is a completely different band function from
     Nacre's saturating cot: a THIN bright ridge every PI with an
     exponential falloff and a dim floor at exp(-3), not a wide crest. That
     floor is what keeps the shell lit between threads.
   - vec4(0,.4,.2,0) offsets green furthest and blue between. Against a
     ridge this thin the offset is a large fraction of the line width, so
     every thread splits into three coloured filaments running in parallel
     rather than merely fringing at its edges.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: a flat 2D field, so it is sampled through a
     stereographic projection of the dome and finished with a fresnel
     sheen, never masked out of the plane as a disc.
   - Like shdr-08, and for a reason worth reading before changing it,
     it projects the unrotated dome and moves in 2D. The abs(sp.z) form
     that lets shdr-28 and shdr-29 roll their domes was tried first
     and had to go: it turns the ball into an exact mirror image of itself
     once a quarter turn, which a cellular grid hides and a web of long
     threads does not. The full derivation is at the projection.
   - The pole is SOFTENED, not guarded: x/(x*x+g) is 1/x everywhere the
     listing cared about and finite where it did not. A hard guard leaves a
     sign discontinuity on every lattice line, and the raw divide reaches
     infinite phase frequency at every lattice point, which no amount of
     supersampling can resolve.
   - The golfed listing relies on i starting at zero; uninitialised locals
     are UNDEFINED in GLSL ES 1.0, explicit here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. OCTAVES is
 * the listing's @(9). AA supersamples the threads, which are a pixel or two
 * wide at the centre of the ball and thinner than that toward the limb —
 * WebGL 1 has no fwidth without an extension, so brute force is the defence.
 */
const LATTICE_FRAG = `
#define OCTAVES 9
#define AA 3

const float TAU = 6.28318530718;

// Volume-reactive values, resolved once per fragment in main().
float latticePole;
float latticeSharp;
float latticeGain;

vec3 latticeRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));
  vec3 n = vec3(pl, z);

  float t = uP_speed; // integrated clock

  /*
    Stereographic projection of the UNROTATED dome.

    This orb was built on the abs(sp.z) form first — the one shdr-28
    and shdr-29 use, which survives a 3D roll because the divisor can
    only fall TO zero at the terminator, never through it. It renders, but
    every quarter turn it makes the visible hemisphere an EXACT mirror
    image about the view axis: at a roll of 90 degrees sp becomes
    (-n.z, n.y, n.x), so the projected coordinate depends on n.z and on
    abs(n.x), and both of those are even in screen x. A cellular grid
    hides that. A web of long threads does not — the ball turns into a
    Rorschach blot for a quarter of every revolution.

    So the dome stays put, as in shdr-08, and all the motion below is
    projection-safe 2D.
  */
  vec2 p = n.xy / (n.z + 1.0 + uP_bulge) * uP_scale;

  // the plane turns while the lattice drifts across it, so the crazing
  // migrates over the glaze instead of sitting welded to it
  float sw = uP_swirl; // integrated clock
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p.x += uP_drift;     // integrated clock

  /*
    A fractional offset off the pattern origin. The listing carries the
    resolution here; it cancels out of the pole term exactly (see the
    header) but it does keep the lattice off centre, and without something
    in its place a cell corner sits pinned at the dead middle of the ball.
  */
  p += vec2(0.37, 0.21);

  // the cell the sample starts in, fixed before the warp — everything the
  // pole term does is relative to THIS corner, not to wherever c wanders
  vec2 cell = floor(p);

  /*
    Each cell knots on its own hashed phase, so the grid breathes instead
    of pulsing as one sheet. The rate is a constant, not a slider: this
    multiplies the integrated clock, and a slider there would jump the
    phase of every cell on a state change.
  */
  float breathe = 1.0 + uP_pulse * sin(TAU * hash(cell) + t * 0.35);

  vec2 c = p;
  for (int j = 0; j < OCTAVES; j++) {
    float i = float(j) + 1.0;

    /*
      The lattice pole, softened. d/(d*d+g) tracks 1/d away from the cell
      corner and rolls over to a finite peak at it, so the phase stays
      band-limited and the knot has a SIZE — uP_poleSoft is that size, and
      it is the difference between crisp cell knots and a corner full of
      aliased noise.
    */
    vec2 d = cell - c;
    vec2 pole = latticePole * breathe * d / (d * d + vec2(uP_poleSoft));

    c += uP_warp * cos(i * c.yx + pole + t) / i;
  }

  /*
    The listing's tone map: a thin ridge every PI with an exponential
    falloff. The per-channel offsets are kept as their original ratio
    (0, 2, 1) so one slider widens the whole split, and against a ridge
    this thin they separate the thread into three coloured filaments.
  */
  vec3 x = vec3(c.y) + vec3(0.0, 2.0, 1.0) * uP_split;
  vec3 thread = exp(-latticeSharp * abs(sin(x)));

  float lev = dot(thread, vec3(1.0 / 3.0));

  /*
    The exp() floor never reaches zero, so the shell is lit between the
    threads by construction — the body colour is added under it rather
    than filling a hole. The thread term stays PER-CHANNEL through the
    palette multiply; collapsing it to lev first would throw away the
    filament split, which is the only thing the vec4 phase was for.
  */
  vec3 col = uC_deep * uP_floor;
  /*
    The ramp between the two thread colours runs nearly the whole range of
    lev deliberately. Started at 0.35 it reached uC_hot — which is near-white in
    every state — across most of the visible web, and the state palettes,
    which ride on uC_line, never got to the eye at all.

    The other half of that fix is in the presets: the chromatic split makes
    the three channels independent, so at a wide split THREAD sets the hue
    and no palette can. It is staged with the rest — widest while
    searching, nearly closed while answering, which is when the warm
    palette has to carry.
  */
  col += thread * mix(uC_line, uC_hot, smoothstep(0.12, 1.0, lev)) * latticeGain;

  /*
    A tight second read of the same ridge, added on top: raising a value
    that is already exp(-k*|sin|) to a high power is the same ridge at a
    fraction of the width, which lands as a hot core inside each thread.
    Taken from lev — the MEAN of the three channels — deliberately, so the
    core is achromatic and lands only where all three filaments coincide.
    Read per-channel it would just be a fourth colour-separated ridge, and
    the web would stay a scatter of green and magenta flecks instead of
    resolving into white threads with coloured shoulders. Squared twice
    rather than pow() — pow is undefined for a negative base and this is
    cheaper anyway (see the README).
  */
  float core = lev * lev;
  core = core * core;
  col += uC_hot * core * uP_core;

  col = pow(max(col, vec3(0.0)), vec3(uP_contrast));

  // dome shading keeps the ball a ball under the web
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;

  // fresnel sheen: the glaze the threads are crazed into, and the thing
  // that keeps the limb reading as a surface where the cells have
  // compressed past resolving
  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  // Volume coupling: the user's voice tightens the knots, the agent's
  // thickens the threads and brightens them.
  latticePole = uP_pole * (1.0 + 0.8 * uInput);
  latticeSharp = uP_sharp * (1.0 - 0.25 * uOutput);
  latticeGain = uP_gain * (0.85 + 0.4 * uOutput);

  vec2 uv = orbUV();
  float mask = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Nothing outside the silhouette is ever visible, so skip AA * AA warps
  // for it rather than shading transparent sky.
  if (mask <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 col = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 off = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      col += latticeRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = latticeRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

/*
  The look at rest, which thinking builds on: slow boil, threads fine —
  on a dome bulged nearly all the way and the warp pushed to more than
  double, so the field wraps hard around the ball. The knots are halved in
  strength and pinched to the smallest size, the hot core is run up five
  times and the body fill cut to a third: a dark ball with a fierce centre.
*/
const KNOT_REST = {
  speed: 0.42,
  swirl: 0.075,
  drift: 0.18,
  bulge: 3.28,
  warp: 2,
  pole: 0.13,
  poleSoft: 0.001,
  pulse: 0.35,
  split: 0.045,
  sharp: 4.5,
  core: 2.235,
  floor: 0.26,
  gain: 1,
  contrast: 1.35,
  light: 0.705
};

const KNOT_PALETTE = {
  deep: "#111a2e",
  line: "#3fd2ff",
  hot: "#fff4d6",
  sheen: "#a9d8ff"
};

export const shdr26Orb: OrbVariant = {
  key: "shdr-26",
  label: "SHDR-26",
  note: "a crazed web of coloured threads knotted to a cell grid",
  frag: LATTICE_FRAG,
  params: [
    { key: "speed", label: "Boil", min: 0.015, max: 10, step: 0.05, default: 0.4, integrate: true },
    { key: "swirl", label: "Swirl", min: 0, max: 3, step: 0.015, default: 0.07, integrate: true },
    { key: "drift", label: "Crazing drift", min: 0, max: 5, step: 0.03, default: 0.18, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Cell scale", min: 0.3, max: 20, step: 0.1, default: 9 },
    { key: "bulge", label: "Dome bulge", min: 0, max: 4, step: 0.02, default: 0.25 },
    { key: "warp", label: "Warp", min: 0, max: 3, step: 0.02, default: 0.85 },
    { key: "pole", label: "Knot strength", min: 0, max: 2, step: 0.005, default: 0.25 },
    { key: "poleSoft", label: "Knot size", min: 0.001, max: 1, step: 0.001, default: 0.012 },
    { key: "pulse", label: "Cell breathing", min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: "sharp", label: "Thread width", min: 0.3, max: 20, step: 0.05, default: 4.5 },
    { key: "split", label: "Chromatic split", min: 0, max: 1, step: 0.005, default: 0.045 },
    { key: "core", label: "Hot core", min: 0, max: 3, step: 0.015, default: 0.45 },
    { key: "floor", label: "Body fill", min: 0, max: 3, step: 0.01, default: 0.9 },
    { key: "gain", label: "Brightness", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.35 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.7 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.45 }
  ],
  /*
   * Four stops: the glaze the web is crazed into, the two ends of the thread
   * ramp, and the fresnel sheen. The chromatic split runs the threads apart
   * into three filaments on its own, so the palette only has to set the mood.
   */
  colors: [
    { key: "deep", label: "Glaze", default: "#111a2e" },
    { key: "line", label: "Thread", default: "#3fd2ff" },
    { key: "hot", label: "Hot thread", default: "#fff4d6" },
    { key: "sheen", label: "Sheen", default: "#a9d8ff" }
  ],
  /*
    Staged on the pole, which is this orb's loudest control: knot strength
    decides whether the field flows past the lattice or tears itself around
    it. Thread width is the second lever, and the two integrated clocks —
    boil and roll — carry the tempo.
  */
  statePresets: {
    /*
      at rest: slow boil, threads fine — on a dome bulged nearly all the
      way and the warp pushed to more than double, so the field wraps hard
      around the ball. The knots are halved in strength and pinched to the
      smallest size, the hot core is run up five times and the body fill
      cut to a third: a dark ball with a fierce centre.
    */
    idle: KNOT_REST,
    /*
      searching: the rest look, set MOVING. The boil runs at nearly two and
      a half times idle, the swirl four times and the drift three, so the
      web migrates over the glaze instead of sitting on it. The knots come
      up a third but breathe less, the threads soften a touch on a tighter
      split, and the contrast is pushed — busier, but no brighter.
    */
    thinking: {
      ...KNOT_REST,
      speed: 1,
      swirl: 0.3,
      drift: 0.51,
      pole: 0.18,
      pulse: 0.22,
      sharp: 3.6,
      split: 0.03,
      floor: 0.28,
      contrast: 1.6
    },
    /*
      answering: the web goes FAST and FLOODS. The boil runs at six times
      thinking and the drift more than three, the knots breathe at their
      deepest, and the threads spread to their softest, so the ridges bloom
      into broad light. The dome is flattened back toward the default and
      the warp relaxed to a third of rest, with the cell scale nudged up;
      the core is halved from rest, but the fill, gain and contrast all
      come up — the brightest, busiest state.
    */
    speaking: {
      speed: 6.45,
      swirl: 0.555,
      drift: 1.74,
      scale: 11,
      bulge: 0.78,
      warp: 0.76,
      pole: 0.195,
      poleSoft: 0.001,
      pulse: 1.39,
      sharp: 2.1,
      split: 0.045,
      core: 1.08,
      floor: 0.48,
      gain: 1.3,
      contrast: 1.95
    }
  },
  // one palette, cold cyan porcelain, across all three states — unlike the
  // sibling orbs, this one tells its states apart by the knots and the
  // tempo alone, not by colour
  stateColors: {
    idle: KNOT_PALETTE,
    thinking: KNOT_PALETTE,
    speaking: KNOT_PALETTE
  }
};

export type Shdr26Props = Omit<ShaderOrbProps, "variant">;

export function Shdr26({ size = 280, ...rest }: Shdr26Props) {
  return <ShaderOrb variant={shdr26Orb} size={size} {...rest} />;
}

export default Shdr26;
