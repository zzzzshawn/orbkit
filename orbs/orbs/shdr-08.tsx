/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-08 — mother-of-pearl: contour bands wrapped around the ball, every band
   carrying its own hue.

   Ported from a five-line twigl listing:

     vec2 p=FC.xy*6./r.y;
     for(float i;i++<1e1;i)
     p+=sin(p.yx*i+i*i+t*i+r)/i;
     o=tanh(.2/tan(p.y+vec4(0,.1,.3,0)));
     o*=o;

   What it actually is, decoded:

   - The loop is a TEN-OCTAVE FEEDBACK WARP. Each octave reads the previous
     octave's result with its components SWAPPED (p.yx), which is what curls
     the field instead of merely rippling it. i*i is a per-octave phase so
     the octaves never line up, and t*i runs octave ten at ten times the
     clock — fine detail boils while the large structure barely moves.
   - The last line is the whole image. tan() has a zero every PI, so
     .2/tan() blows up there and tanh saturates into a flat crest; tan is
     unbounded at PI/2, so .2/tan passes through zero and the valley floor
     is exact black. The band period is PI, not 2PI.
   - vec4(0,.1,.3,0) is a PER-CHANNEL PHASE. The spacing is not linear —
     0, 1, 3 in units of the split — so red and green sit close together
     and blue lags far behind: every band edge breaks into a warm shoulder
     on one side and a deep blue one on the other.
   - o *= o folds the sign (cot is negative on half of every period) and
     squares the contrast in one move.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: this is a flat 2D field, so it is sampled
     through a stereographic projection of the dome — the bands compress
     toward the limb the way layers on a real shell do — and finished with
     a fresnel sheen. It is NOT a disc masked out of the plane.
   - The projection is taken on the UNROTATED dome, and all motion is
     projection-safe 2D (a swirl of the plane plus a drift across the
     bands). Rolling the dome in 3D first mixes sp.x into sp.z and the
     divisor collapses — the trap written up at length in shdr-02.
   - Nacre is thin-film interference, so hue follows the layer AND the
     viewing angle: the cosine palette is keyed to the band coordinate
     itself, and 1 - z rotates that hue toward the limb, so the ball's own
     curvature colours the pattern.
   - The listing's +r adds the RESOLUTION as phase. Free entropy in a demo;
     here it would re-seed the whole pattern on every canvas resize, so a
     fixed vec2 does the same job and holds still.
   - .2/tan(x) is .2*cot(x), computed as cos/sin so there is ONE guarded
     division. Dividing by tan() guards nothing — tan is itself unbounded
     where cos is zero.
   - The golfed listing relies on i starting at zero; uninitialised locals
     are UNDEFINED in GLSL ES 1.0, explicit here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. OCTAVES
 * is the listing's i++ < 1e1. AA supersamples the band function, which is the
 * only defence against limb aliasing available here — WebGL 1 has no fwidth
 * without an extension, and deriving the footprint through ten octaves of
 * feedback warp analytically is not worth the algebra for a shader this cheap.
 */
const NACRE_FRAG = `
#define OCTAVES 10
#define AA 2

const float TAU = 6.28318530718;

// The listing's +r, minus the resolution dependence (see the header).
const vec2 SEED = vec2(4.7, 2.3);

// Volume-reactive values, resolved once per fragment in main().
float nacreWarp;
float nacreThick;
float nacreGain;

/*
  The listing's entire tone map: o = tanh(.2 / tan(x)); o *= o.

  The square folds the sign, so abs() on the denominator is not an
  approximation here — it is exact, and it removes the branch.
*/
vec3 cotBands(vec3 x, float k) {
  vec3 b = tanh3(k * cos(x) / max(abs(sin(x)), vec3(1e-4)));
  return b * b;
}

vec3 nacreRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));
  vec3 n = vec3(pl, z);

  float t = uP_speed; // integrated clock: the boil

  /*
    Stereographic projection, on the UNROTATED dome. Equal steps in screen
    space map to ever-larger steps in pattern space toward the rim, which
    is the foreshortening that sells a flat field as wrapped geometry.
    uP_bulge softens the divisor — higher flattens the shell back toward a
    disc, lower crowds the layers into the limb.
  */
  vec2 p = n.xy / (n.z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion, in place of a dome spin: the plane turns,
  // and the bands travel across themselves
  float sw = uP_swirl; // integrated clock
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p.y -= uP_flow;      // integrated clock

  /*
    The ten-octave feedback warp. q is fed back into itself with the
    components swapped, so each octave curls what the last one drew.
  */
  vec2 q = p;
  for (int j = 0; j < OCTAVES; j++) {
    float i = float(j) + 1.0;
    q += nacreWarp * sin(q.yx * i + i * i + t * i + SEED) / i;
  }

  // the bands, with the listing's uneven per-channel phase kept as a ratio
  // so one slider widens the whole split
  vec3 band = cotBands(vec3(q.y) + vec3(0.0, 1.0, 3.0) * uP_split, nacreThick);
  float lev = dot(band, vec3(1.0 / 3.0));

  /*
    A dark body colour under the bands, so the valleys read as the shell
    itself rather than as holes punched through the ball. The band term
    stays PER-CHANNEL through the palette multiply — that is what carries
    the colour fringing; collapsing it to lev first would throw away the
    only thing the vec4 phase was for.
  */
  vec3 col = uC_deep * uP_floor;
  col += band * mix(uC_low, uC_crest, smoothstep(0.1, 0.9, lev)) * nacreGain;

  /*
    Thin-film interference. The cosine palette is keyed to the band
    coordinate, so every layer carries its own hue — the inside of a shell
    — and uP_view rotates that hue with the viewing angle through 1 - z,
    which means the sphere's curvature is doing the colouring. Multiplied
    in rather than mixed to, so it bends hues without erasing the palette.
  */
  vec3 irid = 0.5 + 0.5 * cos(TAU * (q.y * uP_irisScale + (1.0 - z) * uP_view + t * 0.03 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * (0.25 + 1.9 * irid), uP_iris);

  col = pow(max(col, vec3(0.0)), vec3(uP_contrast));

  // dome shading keeps the ball a ball under the pattern
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;

  // fresnel sheen: the wet gloss of a shell, and the thing that keeps the
  // limb reading as a surface where the bands have compressed to a blur
  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  /*
    The BEAT: warp driven between 0.6 and 1.8 on a slow, unbroken cycle —
    one full swing every second and a third — with nothing held at either
    end. Warp is the amplitude of the octave loop that folds the bands, so
    sweeping it three to one makes the whole field draw in and open again
    rather than change colour or brightness — a swell, not a flash.

    Absolute bounds, so the range is exactly the range; that is why the mix
    sits outside the volume term below. At beat zero nothing here applies
    and the dialled warp stands, so a state that does not ask for it is
    untouched.

    Well under 3Hz, which matters: above that a full-field oscillation is
    in the band photosensitivity guidance warns about, and this one covers
    the whole ball. The rate is the constant below — raising it much past
    18 walks back into that range.
  */
  float beat = 0.5 - 0.5 * cos(uAnim * 5.0);

  // Volume coupling: the user's voice churns the warp harder, the agent's
  // widens the crests and brightens them.
  nacreWarp = mix(uP_warp * (1.0 + 0.45 * uInput), mix(0.6, 1.8, beat), uP_beat);
  nacreThick = uP_thick * (1.0 + 0.6 * uOutput);
  nacreGain = uP_gain * (0.85 + 0.4 * uOutput);

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
      col += nacreRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = nacreRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr08Orb: OrbVariant = {
  key: "shdr-08",
  label: "SHDR-08",
  note: "mother-of-pearl contour bands, each layer its own hue",
  frag: NACRE_FRAG,
  params: [
    { key: "speed", label: "Boil", min: 0.015, max: 10, step: 0.05, default: 0.35, integrate: true },
    { key: "flow", label: "Band drift", min: 0, max: 5, step: 0.03, default: 0.25, integrate: true },
    { key: "swirl", label: "Swirl", min: 0, max: 3, step: 0.015, default: 0.06, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Pattern scale", min: 0.3, max: 20, step: 0.1, default: 5.5 },
    { key: "bulge", label: "Dome bulge", min: 0, max: 4, step: 0.02, default: 0.3 },
    { key: "warp", label: "Warp", min: 0, max: 3, step: 0.02, default: 1 },
    { key: "beat", label: "Warp beat", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "thick", label: "Band width", min: 0.02, max: 2, step: 0.01, default: 0.2 },
    { key: "split", label: "Chromatic split", min: 0, max: 1, step: 0.005, default: 0.1 },
    { key: "iris", label: "Iridescence", min: 0, max: 2, step: 0.01, default: 0.7 },
    { key: "irisScale", label: "Iridescence scale", min: 0, max: 2, step: 0.005, default: 0.315 },
    { key: "view", label: "Angle shift", min: 0, max: 3, step: 0.01, default: 1.34 },
    { key: "floor", label: "Body fill", min: 0, max: 3, step: 0.01, default: 0.8 },
    { key: "gain", label: "Brightness", min: 0.05, max: 5, step: 0.05, default: 1.1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.15 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.75 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.5 }
  ],
  /*
   * Four stops: the shell body the bands sit on, the two ends of the band
   * ramp, and the fresnel sheen. The iridescence multiplies a rainbow over
   * all of them, so the palette sets the mood and the shimmer supplies the
   * rest of the hues.
   */
  colors: [
    { key: "deep", label: "Shell body", default: "#0d1430" },
    { key: "low", label: "Dim layer", default: "#2fb8c6" },
    { key: "crest", label: "Bright layer", default: "#fff1de" },
    { key: "sheen", label: "Sheen", default: "#bfe4ff" }
  ],
  /*
    Staged on the two levers that are phase-safe integrated clocks — the
    boil and the band drift — plus band width, which is the orb's loudest
    single control: narrow crests read as taut lines, wide ones flood the
    shell with light.

    IRIDESCENCE SCALE AND ANGLE SHIFT ARE ALL BUT FIXED, and the reason
    matters. Both multiply their way into the cosine that makes the
    thin-film rainbow, so they are spatial FREQUENCIES, not amounts: easing
    one across a wide span sweeps the field through every frequency in
    between, which races the fringes across the shell instead of
    cross-fading them. Pattern scale is held fixed here for the same reason,
    as are cell count in shdr-05 and lattice spacing in shdr-06.

    So they live on the params above, where resting and answering take them
    untouched. Searching nudges them and only just — scale to 0.83 of the
    fixed value, angle shift to 0.90 — which moves the fringes by well under
    one of their own periods, and reads as the shimmer settling rather than
    as a scramble. That margin is the whole budget: a state that wanted
    twice or a third of these would have to snap them, not glide.

    Iridescence itself — the amount — is safe to stage at any span: it is a
    plain mix toward the same rainbow, so it fades rather than moves.
  */
  statePresets: {
    /*
      at rest: slow and BRIGHT. The clocks stay gentle — a slow boil, the
      layers barely drifting — which is what still reads as at rest, but
      everything about the surface is turned up under them. Crests run wide,
      three quarters of the answering state's width, on more than twice the
      default brightness and the highest gain of the three.

      The shimmer carries the rest: iridescence near half again its default,
      laid over the fixed scale and angle shift the staging note above keeps
      out of the presets — the rainbow swings hard as the dome curves away,
      and it does so identically in all three states. The dome is bulged
      well past default and the body fill pulled back beneath it, so the
      light sits in the bands rather than in the shell behind them.
    */
    idle: {
      speed: 0.37,
      flow: 0.24,
      swirl: 0.06,
      bulge: 0.8,
      warp: 0.96,
      thick: 0.54,
      split: 0.1,
      iris: 1.02,
      floor: 0.57,
      gain: 2.45,
      contrast: 1.65,
      rim: 0.495
    },
    /*
      searching: the field CHURNS in place — boil at over four times resting,
      warp half again — while the layers all but stop drifting, a quarter of
      resting's flow on a third of its swirl. Crests hold exactly resting's
      width, so nothing about the BANDS says searching; what says it is that
      they are boiling hard and going nowhere.

      The shimmer is the other half of it: iridescence at nearly twice
      resting's, the strongest of the three by a wide margin, over a split
      that answering now matches. And still deliberately the dimmest —
      tension reads as held light, not spent light.
    */
    thinking: {
      speed: 1.61,
      flow: 0.06,
      swirl: 0.015,
      warp: 1.56,
      thick: 0.54,
      split: 0.3,
      iris: 1.89,
      irisScale: 0.26,
      view: 1.21,
      floor: 0.77,
      gain: 0.85,
      contrast: 1.65,
      rim: 0.495
    },
    /*
      answering: the field SWELLS and TRAVELS. Warp is on the beat at full
      depth, swinging 0.6 to 1.8 across a second and a third with nothing
      held at either end, so the bands draw in and open again slowly enough
      to watch — that swell IS the state, and the dialled warp below is only
      what you would see with the beat off.

      Under it everything is moving: the fastest boil of the three, and the
      hardest drift anywhere in this orb at ten times resting's, on crests
      pulled to half the width the other two both hold. Iridescence drops to
      the lowest of the three while the split opens out to match searching's
      — so this state spends its light on MOVEMENT rather than on shimmer,
      which is what keeps the two apart now that both run their bands hard.
    */
    speaking: {
      speed: 2,
      flow: 2.49,
      swirl: 0.18,
      warp: 1.84,
      beat: 1,
      thick: 0.27,
      split: 0.3,
      iris: 0.45,
      gain: 1.75,
      contrast: 0.78
    }
  },
  // abalone at rest, cold pearl while searching, warm fire-opal while
  // answering — the at-a-glance read, as in the sibling orbs
  stateColors: {
    idle: {
      deep: "#0d1430",
      low: "#2fb8c6",
      crest: "#fff1de",
      sheen: "#bfe4ff"
    },
    thinking: {
      deep: "#0a0f2c",
      low: "#6f7cff",
      crest: "#dfe8ff",
      sheen: "#9fd0ff"
    },
    speaking: {
      deep: "#2a0f22",
      low: "#ff7a4d",
      crest: "#fff0c9",
      sheen: "#ffc9a8"
    }
  }
};

export type Shdr08Props = Omit<ShaderOrbProps, "variant">;

export function Shdr08({ size = 280, ...rest }: Shdr08Props) {
  return <ShaderOrb variant={shdr08Orb} size={size} {...rest} />;
}

export default Shdr08;
