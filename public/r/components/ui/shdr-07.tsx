/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-07 — a twist wave travelling out through the ball, wound around a
   lit polar column.

   Ported from a golfed twigl listing:

     for(float i,z,d,h;i++<5e1;o+=vec4(3,z,i,1)/d)
     {vec3 p=z*normalize(FC.rgb*2.-r.xyy),a;a.y++;p.z+=7.;
      a=mix(dot(a,p)*a,p,sin(h=length(p)-t))+cos(h)*cross(a,p);
      for(d=0.;d++<9.;a+=sin(round(a*d)-t).zxy/d);z+=d=.1*length(a.xz);}
     o=tanh(o/1e4);

   A near relative of shdr-22 — same march skeleton, same colour-coded
   accumulator, same cell-quantized turbulence. Three things make it a
   different animal.

   - THE ROTATION IS EXACT, AND ITS ANGLE VARIES. Written out,
     mix(dot(a,p)*a, p, sin h) + cos(h)*cross(a,p) is
     a(a.p)(1 - sin h) + p sin h + (a x p) cos h, which is Rodrigues with
     cos(theta) = sin(h) and sin(theta) = cos(h) — a true orthonormal
     rotation about the unit axis by theta = 90 degrees - h. Worth saying
     plainly, because the README's standing warning is that golfed
     rotations are NOT orthonormal and breathe the silhouette. This one is
     the exception, twice over: shdr-22 hid an exact 90-degree case,
     and this listing hides the general one.
   - h = length(p) - t IS THE WHOLE EFFECT. The rotation angle is the
     sample's RADIUS minus the clock, so every spherical shell is wound by
     a different amount and the winding travels outward with time. Torsion
     in the literal sense: twist per unit radius. It also means the field
     is organised into shells concentric with the ball before anything
     else touches it — this listing is an orb already.
   - THE DENSITY IS AXIAL. length(a.xz) is the distance from the twist
     axis, not from the origin, so the step collapses along the pole and
     the axis lights as a column running through the ball. shdr-22
     multiplies two radial lengths and gets streaks; this gets a spine.

   The axis is a fixed vertical (a.y++ on a zeroed vec3), where vectors
   wanders its axis with time. Fixed is right here: the column has to stay
   somewhere for the twist to be read against.

   Port decisions, each one a documented trap or rule in the README:

   - round() is ES 3.0 and does not exist in GLSL ES 1.0 — hand-written as
     floor(x + 0.5).
   - The golfed listing builds its axis out of an uninitialised vec3
     (a.y++). Uninitialised locals are UNDEFINED in ES 1.0, explicit here.
   - The listing drives the travelling wave and the cell flicker off ONE
     clock. They are separate motions — one is a wave crossing the ball,
     the other is lattice shimmer — so they get separate integrated clocks
     and can be tuned against each other.
   - The axis leans by rotating the SAMPLE into the axis frame rather than
     the axis into the world, so the density term can go on reading the
     perpendicular plane as a.xz and the mechanism stays the listing's.
   - p.z += 7 puts the camera outside already — re-derived as the family's
     ro/rd pair so distance and lens are separate knobs.
   - 1/d spikes where the turbulent point lands on the axis — clamped per
     step, as in every accumulator here.
   - Emitted light, so rgb is already premultiplied and alpha comes from
     the peak channel (see shdr-31).
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. STEPS and
 * TURB are the listing's i++ < 5e1 and d++ < 9.
 */
const TORSION_FRAG = `
#define STEPS 50
#define TURB 9
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float torsionTurb;
float torsionTwist;
float torsionExposure;

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here. Halves round up rather than to even, which is
// what a lattice quantizer wants anyway.
vec3 roundv(vec3 x) { return floor(x + 0.5); }

vec3 torsionRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float shimmer = uP_speed; // integrated clock: cell flicker
  float wave = uP_wave;     // integrated clock: the travelling twist
  float spin = uP_spin;     // integrated clock: roll about the axis

  // the axis lean and the roll, applied to the SAMPLE rather than to the
  // axis — see the header
  float ct = cos(uP_tilt);
  float st = sin(uP_tilt);
  float cs = cos(spin);
  float ss = sin(spin);

  // the twist axis, unit by construction, which is what makes the
  // Rodrigues rotation below exact
  vec3 axis = vec3(0.0, 1.0, 0.0);

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — near shells veil far ones
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  for (int it = 0; it < STEPS; it++) {
    vec3 world = ro + rd * z;

    // into the axis frame: lean about X, then roll about Y
    vec3 p = vec3(world.x, world.y * ct + world.z * st, -world.y * st + world.z * ct);
    p = vec3(p.x * cs - p.z * ss, p.y, p.x * ss + p.z * cs);

    /*
      The travelling twist. h is the sample's radius (scaled by the twist
      knob) minus the wave clock, and the line below is an exact rotation
      about the axis by 90 degrees - h. Because h depends only on radius,
      the winding is constant on spheres: the ball's own shells are the
      structure, and raising uP_twist puts more turns between the core and
      the surface.
    */
    float h = length(p) * torsionTwist - wave;
    vec3 a = mix(dot(axis, p) * axis, p, sin(h)) + cos(h) * cross(axis, p);

    // cell-quantized turbulence: every lattice cell flickers on its own
    // phase, the same construction shdr-22 uses
    for (int j = 0; j < TURB; j++) {
      float dj = float(j) + 1.0;
      a += torsionTurb * sin(roundv(a * dj) - shimmer).zxy / dj;
    }

    /*
      The axial density. At uP_column 0 this is the listing's
      length(a.xz) — distance from the twist axis, so the step collapses
      along the pole and the axis burns as a column. At 1 it is the plain
      radial length and the column dissolves into shells.
    */
    float d = uP_stepScale * mix(length(a.xz), length(a), uP_column);
    d = max(d, uP_envRadius * 0.003);

    /*
      The march's own colour code, from the listing: red constant, green
      by DEPTH into the ball, blue by STEP INDEX — the opposite assignment
      from shdr-22, and the reason this orb runs cyan-blue where that
      one runs red-green. Blue gets twice the clamp headroom: its ramp
      runs to STEPS (50) where red is fixed at 3, and an equal clamp would
      crush the step gradient first.
    */
    vec3 w = vec3(3.0, (z - uP_camDist + uP_envRadius) * uP_hueDepth, float(it) * uP_hueStep) / d;
    w = min(w, vec3(uP_stepClamp) * vec3(1.0, 1.0, 2.0));

    /*
      Normalize the clamped weight back to family units, exactly as in
      shdr-22: without this line the clamp value leaks into total
      energy and Exposure, Body fill and Diffusion all change meaning
      whenever the clamp moves.
    */
    w *= 20.0 / max(uP_stepClamp, 1.0);

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(world));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) break;
  }

  return acc;
}

void main() {
  torsionTurb = uP_turb * (1.0 + 0.5 * uInput);
  torsionExposure = uP_exposure * (1.0 - 0.35 * uOutput);
  // the ball winds tighter while the agent speaks
  torsionTwist = uP_twist * (1.0 + 0.4 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      acc += torsionRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = torsionRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e4 knee is a tunable here
  vec3 col = tanh3(acc / max(torsionExposure, 1.0));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue tail
  // has low luminance but must not go transparent
  float peak = max(col.r, max(col.g, col.b));
  float a = clamp(peak * uP_alphaGain, 0.0, 1.0);

  // Analytic silhouette — identical construction to shdr-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  vec3 mrd = normalize(vec3(orbUV(), -uP_focal));
  float closest = length(cross(vec3(0.0, 0.0, uP_camDist), mrd));
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // safety taper at the frame boundary — colour as well as alpha
  float r2d = length(orbUV());
  float fade = 1.0 - smoothstep(uP_edgeFade, 1.0, r2d);
  col *= fade;
  a *= fade;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in shdr-31).
  gl_FragColor = vec4(col, a);
}
`;

export const shdr07Orb: OrbVariant = {
  key: "shdr-07",
  label: "SHDR-07",
  note: "a twist wave travelling out through the ball around a lit column",
  frag: TORSION_FRAG,
  params: [
    { key: "speed", label: "Cell shimmer", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "wave", label: "Wave speed", min: 0, max: 8, step: 0.03, default: 0.7, integrate: true },
    { key: "twist", label: "Twist", min: 0, max: 8, step: 0.02, default: 1 },
    { key: "spin", label: "Roll", min: 0, max: 3, step: 0.015, default: 0.1, integrate: true },
    { key: "tilt", label: "Axis lean", min: -1.5, max: 1.5, step: 0.015, default: 0.3 },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.1, default: 2.25 },
    { key: "turb", label: "Cell turbulence", min: 0, max: 5, step: 0.03, default: 1 },
    { key: "column", label: "Column release", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "stepScale", label: "Step scale", min: 0.005, max: 1.5, step: 0.005, default: 0.1 },
    { key: "hueDepth", label: "Depth hue", min: 0, max: 10, step: 0.03, default: 0.75 },
    { key: "hueStep", label: "Step hue", min: 0, max: 10, step: 0.03, default: 0.45 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 0.88 },
    { key: "fill", label: "Body fill", min: 0, max: 100, step: 0.3, default: 0.15 },
    { key: "stepClamp", label: "Step clamp", min: 3, max: 5000, step: 10, default: 400 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.5, step: 0.003, default: 0.01 },
    { key: "exposure", label: "Exposure", min: 1.5, max: 5000, step: 5, default: 60 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1.3 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.15 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on the twist, which is the orb's whole subject: how many turns
    of winding sit between the core and the surface. The wave clock is the
    second lever — how fast that winding travels out through the shells —
    and both are phase-safe (twist is a scale on radius, not on a clock).
  */
  statePresets: {
    // at rest: a slow half-turn of winding drifting outward
    idle: {
      speed: 0.5,
      wave: 0.7,
      twist: 1,
      turb: 1,
      column: 0,
      exposure: 60,
      scatter: 0.01,
      alphaGain: 2
    },
    /*
      searching: the ball WINDS UP — three and a half times the twist, so
      the shells shear hard against each other — while the wave almost
      stops. Exposure goes UP, not down: a wound spring is stored energy,
      and this state is the darkest of the three on purpose.
    */
    thinking: {
      speed: 1.5,
      wave: 0.15,
      twist: 3.6,
      turb: 1.35,
      column: 0,
      exposure: 88,
      scatter: 0.011,
      alphaGain: 2
    },
    /*
      answering: the winding UNWINDS to a third of idle and the wave races
      out through the shells at more than four times idle — the tension
      released outward — with the column let go and the knee less than a
      third of the thinking state's. The release is the bright one.
    */
    speaking: {
      speed: 0.9,
      wave: 3.2,
      twist: 0.35,
      turb: 0.85,
      column: 0.45,
      exposure: 26,
      scatter: 0.006,
      alphaGain: 2.7
    }
  },
  // the march colour-codes itself, so the tint only shifts temperature:
  // neutral at rest, cooled while searching, warmed while answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#9db8ff" },
    speaking: { tint: "#ffc492" }
  }
};

export type Shdr07Props = Omit<ShaderOrbProps, "variant">;

export function Shdr07({ size = 280, ...rest }: Shdr07Props) {
  return <ShaderOrb variant={shdr07Orb} size={size} {...rest} />;
}

export default Shdr07;
