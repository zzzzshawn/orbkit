/*
 * Deliberately not a `"use client"` module — see the note in `orb-hydrogen.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   Quasar — an emissive swept core with a jet, given a glassy surface.

   The structure comes from the golfed listing this was ported from. Its one
   load-bearing line is easy to miss:

     a = mix(dot(a -= .57, p) * a, p, cos(s)) - sin(s) * cross(a, p)

   Expanding mix(x, y, f) = x(1-f) + y*f gives

     p*cos(s) + a(a.p)(1 - cos s) - sin(s)(a x p)

   which is the RODRIGUES formula: p rotated about the axis a by angle -s, with
   the turbulence applied in that rotating frame.

   uP_axisBias is that axis, and it has three regimes:

     0.5774   an exact unit axis, so the sweep is a true rotation.
     0.57     the original. length(vec3(0.57)) is 0.987, so it is a rotation
              with a small constant scale baked in.
     0        the formula COLLAPSES to p * cos(s) — no rotation at all, only a
              rhythmic radial pulse. A different effect rather than a weaker
              one, and the default here.

   The axis originally came from subtracting 0.57 from a local that is never
   assigned, which works only because the value happens to start at zero.
   Uninitialised locals are UNDEFINED in GLSL ES 1.0, so it is explicit below.

   This is EMISSIVE, not a solid. The glassiness is added as surface character
   over the emission — a fresnel rim sheen and per-channel offset of the palette
   ramp for chromatic fringing — rather than by putting the effect inside a
   refracting ball, which buries the jet and flattens the whole thing.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds.
 */
const QUASAR_FRAG = `
#define STEPS 70
#define TURB 8
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float quasarSwirl;
float quasarExposure;

vec2 quasarRender(vec2 fragCoord) {
  float animTime = uP_speed; // integrated clock

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float emission = 0.0;
  float structW = 0.0;
  float z = 0.0;
  float d = 0.0;

  // transmittance carried front-to-back — see the diffusion note in the loop
  float T = 1.0;

  /*
    The sweep angle.

    The original decrements this by iTime on EVERY march step. That works on
    Shadertoy only because iTime is small — a few seconds — so the per-step
    angle change stays modest. Our clock is integrated and unbounded (it starts
    at a random phase and grows for as long as the page is open), so decrementing
    by it per step makes the angle change grow without limit: cos(s) then jumps
    almost randomly between neighbouring steps, the structure degenerates into
    aliased noise, and total brightness swings wildly as the clock drifts. That
    is what made this orb look different every time it was sampled.

    Fixed per-step decrement, with the clock as the starting PHASE instead.
  */
  float s = animTime;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    // explicit — the original relies on an unassigned local being zero
    vec3 a = vec3(-uP_axisBias);

    s -= quasarSwirl;

    /*
      The angle is the running term PLUS the clock as a flat offset. animTime is
      constant across every step of a frame, so adding it here animates the
      sweep without compounding per step — which is exactly the distinction the
      original loses by decrementing s by the clock itself.

      Note s is dual-purpose, as in the golfed original: it is overwritten below
      by the structure term and fed back in on the next iteration. That feedback
      is deliberate and is where the chaotic character comes from; it only had to
      stop being scaled by an unbounded clock.
    */
    float ang = s + animTime;

    // Rodrigues: p rotated about a by -ang. At axisBias 0 this degenerates to
    // p * cos(ang), a pure radial pulse — see the note in the header.
    a = mix(dot(a, p) * a, p, cos(ang)) - sin(ang) * cross(a, p);

    // structure term — distance from the sweep axis, and the radial falloff.
    // Also the value fed back into the angle on the next step.
    s = sqrt(length(a.xz - a.y));

    // turbulence in the rotating frame, frequency climbing per octave
    for (int j = 0; j < TURB; j++) {
      float dj = float(j) + 2.0;
      a += sin(a * dj - animTime).yzx / dj;
    }

    // dot(a, a/a) in the original is just the component sum; written out
    // because a/a is NaN wherever a component is exactly zero
    d = length(sin(a) + dot(a, vec3(1.0)) * uP_densityBias) * s / uP_stepScale;
    z += d;

    /*
      Guard both divisors: s and d reach zero on the axis, and one Inf poisons
      the whole accumulation for that pixel.

      The CLAMP matters as much as the guards. Where s and d both go small on
      the same step, 1/(s*d) spikes by orders of magnitude and that single
      sample dominates the entire 70-step sum — so at some sweep phases the orb
      blew out to flat white while neighbouring phases looked correct. Bounding
      each step's contribution keeps total brightness stable across the whole
      cycle instead of leaving it hostage to whether a ray happened to graze
      the axis.
    */
    float w = min(1.0 / (max(s, 1e-3) * max(d, 1e-4)), uP_stepClamp);

    /*
      Spherical envelope plus a constant floor.

      Unbounded, the sweep throws lobes well off-centre and this reads as a
      lopsided comet streak rather than an orb. Bounding alone is still not
      enough — the structure is lopsided INSIDE the ball too, so the bright
      regions form a blob. uP_fill gives every interior sample a floor, which
      guarantees the sphere and lets the structure ride on top as detail.
      Set fill to 0 for the bare unbounded effect.
    */
    w = (w + uP_fill) * smoothstep(uP_envRadius, uP_envRadius * uP_envCore, length(p));

    /*
      Light diffusion.

      Without transmittance every step adds equally no matter how deep it sits,
      so the orb is a flat additive smear with no interior — the far wall reads
      exactly as bright as the near one. Carrying T front-to-back and attenuating
      it by what has already been passed through makes the medium veil itself:
      near structure occludes far structure, the silhouette gains depth, and the
      emission softens the way light actually does through a scattering volume.

      Beer-Lambert, same as orb-nimbus, but driven by the emission itself rather
      than a separate density field — this orb IS its own medium.
    */
    emission += T * w;
    structW += T * w * s;

    T *= exp(-w * uP_scatter);
    if (T < 0.004) break;
  }

  return vec2(emission, structW);
}

void main() {
  quasarSwirl = uP_swirl * (1.0 + 0.7 * uInput);
  quasarExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  vec2 acc = vec2(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += quasarRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = quasarRender(gl_FragCoord.xy);
#endif

  float emission = acc.x;

  float e = tanh3(vec3(emission / max(quasarExposure, 1.0))).x;
  e = pow(clamp(e, 0.0, 1.0), uP_contrast);

  /*
    Ramp coordinate: the emission-weighted mean of the structure term, which is
    distance from the sweep axis. Low along the jet and nucleus, high out in the
    lobes, so it varies strongly ACROSS the image.

    Depth was tried here first and does not work — the emission-weighted mean
    depth is nearly identical for every pixel, so the ramp collapses and the orb
    comes out one washed colour whatever the endpoints are.
  */
  float axisN = acc.y / max(emission, 1e-4);

  /*
    Chromatic fringing: each channel reads the palette ramp at a slightly
    different point along that axis coordinate. Cheaper than refracting three
    rays and it keeps the emission intact — the jet stays a jet — while the
    lobe edges separate into colour the way glass does.
  */
  float sp = uP_chroma * uP_structRef;
  vec3 t = vec3(
    smoothstep(0.0, uP_structRef, axisN - sp),
    smoothstep(0.0, uP_structRef, axisN),
    smoothstep(0.0, uP_structRef, axisN + sp)
  );

  vec3 col = vec3(
    mix(uC_core, uC_halo, t.r).r,
    mix(uC_core, uC_halo, t.g).g,
    mix(uC_core, uC_halo, t.b).b
  ) * e;

  // whiten the hottest cores so the jet and nucleus read as incandescent
  col = mix(col, vec3(1.0), smoothstep(uP_whiteAt, 1.0, e) * uP_coreWhite);

  /*
    Glassy sheen. The emission has no surface, so a fresnel-style rim brightening
    keyed off screen radius gives it one: bright right at the silhouette, gone by
    the middle. It is what makes the ball look like it has a skin rather than
    being a cloud.
  */
  float r2d = length(orbUV());
  float rim = pow(clamp(r2d / max(uP_rimAt, 0.001), 0.0, 1.0), uP_rimPow);
  col += uC_rim * rim * uP_rim * smoothstep(0.02, 0.25, e);

  /*
    Bloom.

    The same emission tone-mapped through a much lower knee. tanh saturates far
    earlier, so faint outer emission that the main curve leaves near-black comes
    up to full — the light appears to spill past the core into the halo. A real
    separable blur would need a second pass and a framebuffer; this gets the
    read for one extra tanh, because the emission buffer already falls off
    smoothly outward.
  */
  float bloom = tanh3(vec3(emission / max(quasarExposure * uP_bloomKnee, 1.0))).x;
  bloom = pow(clamp(bloom, 0.0, 1.0), uP_bloomPow) * uP_bloom;
  col += mix(uC_core, uC_halo, t.g) * bloom;

  // the bloom has to carry its own coverage, or it multiplies against an alpha
  // that is already zero out where the halo lives and never shows
  float a = clamp(max(e * uP_alphaGain, bloom), 0.0, 1.0);

  // Fade colour as well as alpha — with premultiplied output, fading only alpha
  // leaves the pixel emitting at full brightness up to the cutoff, which reads
  // as a hard rim.
  float fade = 1.0 - smoothstep(uP_edgeFade, 1.0, r2d);
  col *= fade;
  a *= fade;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in orb-corona).
  gl_FragColor = vec4(col, a);
}
`;

export const quasarOrb: OrbVariant = {
  key: "quasar",
  label: "Quasar",
  note: "swept emissive core with a jet",
  frag: QUASAR_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.05, max: 3, step: 0.05, default: 0.4, integrate: true },
    { key: "camDist", label: "Camera distance", min: 3, max: 20, step: 0.1, default: 6.5 },
    { key: "focal", label: "Lens", min: 0.5, max: 6, step: 0.1, default: 1.4 },
    { key: "swirl", label: "Sweep rate", min: 0, max: 3, step: 0.01, default: 1 },
    { key: "axisBias", label: "Sweep axis", min: 0, max: 1, step: 0.005, default: 0 },
    { key: "densityBias", label: "Density bias", min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: "stepScale", label: "Step scale", min: 4, max: 60, step: 0.5, default: 20 },
    { key: "envRadius", label: "Envelope radius", min: 0.5, max: 8, step: 0.05, default: 3 },
    { key: "envCore", label: "Envelope core", min: 0.05, max: 0.95, step: 0.01, default: 0.8 },
    { key: "fill", label: "Body fill", min: 0, max: 400, step: 1, default: 20 },
    { key: "stepClamp", label: "Step clamp", min: 0.5, max: 100, step: 0.5, default: 4 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.2, step: 0.001, default: 0.03 },
    { key: "contrast", label: "Contrast", min: 0.5, max: 6, step: 0.05, default: 1 },
    { key: "structRef", label: "Ramp spread", min: 0.2, max: 4, step: 0.05, default: 1.2 },
    { key: "chroma", label: "Chromatic fringe", min: 0, max: 0.6, step: 0.005, default: 0.16 },
    { key: "whiteAt", label: "White point", min: 0.2, max: 1, step: 0.01, default: 0.75 },
    { key: "coreWhite", label: "Core incandescence", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "rim", label: "Glass sheen", min: 0, max: 2, step: 0.01, default: 0.5 },
    { key: "rimAt", label: "Sheen radius", min: 0.2, max: 1.2, step: 0.01, default: 0.62 },
    { key: "rimPow", label: "Sheen tightness", min: 1, max: 12, step: 0.1, default: 4 },
    { key: "bloom", label: "Bloom", min: 0, max: 2, step: 0.01, default: 0.7 },
    { key: "bloomKnee", label: "Bloom spread", min: 0.02, max: 1, step: 0.01, default: 0.12 },
    { key: "bloomPow", label: "Bloom falloff", min: 0.5, max: 6, step: 0.1, default: 2.2 },
    { key: "exposure", label: "Exposure", min: 20, max: 2000, step: 10, default: 120 },
    { key: "alphaGain", label: "Alpha gain", min: 0.2, max: 6, step: 0.05, default: 1.9 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 1, step: 0.01, default: 0.5 }
  ],
  colors: [
    { key: "core", label: "Core", default: "#ffd9a0" },
    { key: "halo", label: "Halo", default: "#4b2ea8" },
    { key: "rim", label: "Sheen", default: "#bcd8ff" }
  ],
  statePresets: {
    idle: {
      speed: 0.4,
      swirl: 1,
      densityBias: 0.2,
      stepScale: 20,
      contrast: 1,
      chroma: 0.16,
      rim: 0.5,
      bloom: 0.7,
      exposure: 120,
      scatter: 0.03,
      alphaGain: 1.9
    },
    listening: {
      speed: 0.65,
      swirl: 1.35,
      densityBias: 0.26,
      stepScale: 18,
      contrast: 0.95,
      chroma: 0.22,
      rim: 0.6,
      bloom: 0.85,
      exposure: 105,
      scatter: 0.026,
      alphaGain: 2.1
    },
    thinking: {
      speed: 0.52,
      swirl: 1.15,
      densityBias: 0.23,
      stepScale: 19,
      contrast: 0.98,
      chroma: 0.19,
      rim: 0.55,
      bloom: 0.77,
      exposure: 112,
      scatter: 0.028,
      alphaGain: 2
    },
    // loudest: fast sweep, tight steps, hot core
    speaking: {
      speed: 1.3,
      swirl: 2,
      densityBias: 0.34,
      stepScale: 15,
      contrast: 0.85,
      chroma: 0.3,
      rim: 0.75,
      bloom: 1.1,
      exposure: 88,
      scatter: 0.02,
      alphaGain: 2.4
    }
  }
};

export type OrbQuasarProps = Omit<ShaderOrbProps, "variant">;

export function OrbQuasar({ size = 280, ...rest }: OrbQuasarProps) {
  return <ShaderOrb variant={quasarOrb} size={size} {...rest} />;
}

export default OrbQuasar;
