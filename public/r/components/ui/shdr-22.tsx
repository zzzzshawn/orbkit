/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-22 — field lines swirling around the ball about a wandering axis.

   Ported from a golfed twigl listing:

     for(float i,z,d;i++<7e1;o+=vec4(9,i,z,1)/d){
       vec3 p=z*normalize(FC.rgb*2.-r.xyy),
            a=normalize(sin(t/4.+vec3(0,2,4))),v;
       p.z+=7.;
       v=a=dot(a,p)*a+cross(a,p);
       for(d=2.;d++<9.;a+=sin(ceil(a*d)-t).yzx/d);
       z+=d=.1*length(sin(a*a))*sqrt(length(v*sin(v.yzx)));}
     o=tanh(o/6e4);

   What it actually is, decoded:

   - dot(a,p)*a + cross(a,p) with unit a is Rodrigues at EXACTLY 90 degrees
     — a real orthonormal rotation, for once not a golf approximation. The
     axis a = normalize(sin(t/4 + (0,2,4))) wanders slowly with time.
   - v = a = ... forks the rotated point: v stays CLEAN, a takes seven
     octaves of turbulence. The density then multiplies a turbulent factor,
     length(sin(a*a)), by a clean one, sqrt(length(v*sin(v.yzx))) — big
     smooth streak surfaces detailed by turbulence.
   - The turbulence is sin(ceil(a*d) - t): CELL-QUANTIZED. Every lattice
     cell flickers on its own phase — the voxel shimmer that gives the
     effect its name.
   - vec4(9,i,z,1)/d colour-codes the march itself: red is constant, green
     is the STEP INDEX, blue is DEPTH — cores run red-orange, deep tails go
     green-blue. The listing's alpha (1/d) is never displayed; this port
     derives its own.
   - p.z += 7 puts the camera OUTSIDE already — this listing wanted to be
     an orb.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: unbounded, the tangle is a storm in a jar. The
     field coordinates are pulled onto the sphere's own shell BEFORE
     evaluation — mix(q, normalize(q)*R, hug) — so the streaks read as
     field lines wrapped around the ball, swirling about the wandering
     axis. The envelope and analytic silhouette bound the residue.
   - The golfed listing relies on i, z, d, v starting at zero —
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - The clock enters only as additive phase (the axis wander gets its own
     integrated clock, so its rate tunes without jumping the cells).
   - 1/d spikes where both density factors null together — clamped per
     step, as in every accumulator here.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds.
 * TURB is 7 to match the original's octaves (d = 3..9).
 */
const VECTORS_FRAG = `
#define STEPS 70
#define TURB 7
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float vectorsTurb;
float vectorsExposure;
float vectorsGlow;

vec3 vectorsRender(vec2 fragCoord) {
  float animTime = uP_speed; // integrated clock: cell flicker phase
  float wander = uP_wander;  // integrated clock: axis drift

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  // the wandering rotation axis — unit by construction, which is what
  // makes the 90-degree Rodrigues below exact
  vec3 axis = normalize(sin(wander + vec3(0.0, 2.0, 4.0)));

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — near streaks veil far ones
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    /*
      THE ORB IS THE OBJECT — pull the sample toward the sphere's shell
      before the field ever sees it. At hug 0 this is the raw 3D tangle;
      at 1 the field is purely angular, painted on the ball's skin. The
      guard keeps normalize() defined through the centre.
    */
    float rl = max(length(p), 1e-3);
    vec3 q = mix(p, p / rl * uP_envRadius, uP_hug);

    // the exact 90-degree rotation about the wandering axis; v stays
    // clean, a takes the turbulence — the fork is the original's v=a=...
    vec3 v = dot(axis, q) * axis + cross(axis, q);
    vec3 a = v;

    // cell-quantized turbulence: every ceil() lattice cell flickers on
    // its own phase
    for (int j = 0; j < TURB; j++) {
      float dj = float(j) + 3.0;
      a += vectorsTurb * sin(ceil(a * dj) - animTime).yzx / dj;
    }

    // the density product — turbulent detail times clean streak surfaces
    float d = uP_stepScale * length(sin(a * a)) * sqrt(length(v * sin(v.yzx)));
    d = max(d, 1e-4);

    /*
      The march's own colour code, from the listing: red constant, green
      by step index, blue by depth into the ball — with the two ramps
      exposed. The CLAMP is load-bearing as everywhere: one grazing step
      would own the whole 70-step sum at some phases. Green gets twice the
      clamp headroom: its ramp runs to STEPS (70) where red is fixed at 9,
      and an equal clamp would crush the step gradient first.
    */
    vec3 w = vec3(9.0, float(it) * uP_hueStep, (z - uP_camDist + uP_envRadius) * uP_hueDepth) / d;
    w = min(w, vec3(uP_stepClamp) * vec3(1.0, 2.0, 1.0));

    /*
      Normalize the clamped weight back to family units (a ceiling of ~20,
      like the sibling orbs). This orb's raw weights run in the hundreds —
      the golfed knee was 6e4 — and without this one line the clamp value
      leaks into total energy, so Exposure, Body fill and Diffusion would
      all change meaning whenever the clamp moves. Normalized, stepClamp
      is a pure dynamic-range knob: low flattens the streaks, high lets
      the 1/d spikes whiten.
    */
    w *= 20.0 / max(uP_stepClamp, 1.0);

    /*
      A few vectors GLOW. Cells of the clean rotated frame are hashed, and
      each cell's hash cycles against the clock so only a small fraction
      (uP_glowFew of the cycle) are hot at any moment. Where a hot cell
      meets a streak null, the same 1/d spike is re-read on a far higher
      ceiling than the step clamp — deliberately bypassing it — and pushed
      as warm-white light. The two smoothsteps make a triangle window, so
      each glow blooms and fades instead of popping at the cycle wrap.
    */
    float few = max(uP_glowFew, 1e-3);
    vec3 vc = ceil(v * 2.0);
    float hcell = hash(vc.xy + vc.z * vec2(7.31, 3.17));
    float cyc = fract(hcell + animTime * 0.05);
    float sel = smoothstep(1.0 - few, 1.0 - 0.5 * few, cyc) * smoothstep(1.0, 1.0 - 0.5 * few, cyc);
    // QUADRATIC in 1/d, unlike the linear base weight — the glow hugs the
    // filament core and falls off fast, a hot wire rather than a lit sector
    w += vec3(1.0, 0.96, 0.88) * min(0.08 / (d * d), 500.0) * sel * vectorsGlow;

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) break;
  }

  return acc;
}

void main() {
  vectorsTurb = uP_turb * (1.0 + 0.5 * uInput);
  vectorsExposure = uP_exposure * (1.0 - 0.35 * uOutput);
  // the glows flare when the agent speaks
  vectorsGlow = uP_glow * (1.0 + 0.8 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += vectorsRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = vectorsRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /6e4 knee is a tunable here
  vec3 col = tanh3(acc / max(vectorsExposure, 1.0));
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

export const shdr22Orb: OrbVariant = {
  key: "shdr-22",
  label: "SHDR-22",
  note: "field lines swirling around the ball about a wandering axis",
  frag: VECTORS_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "wander", label: "Axis wander", min: 0, max: 3, step: 0.015, default: 0.12, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.1, default: 2.25 },
    { key: "hug", label: "Surface hug", min: 0, max: 3, step: 0.015, default: 0.8 },
    { key: "turb", label: "Cell shimmer", min: 0, max: 5, step: 0.03, default: 0.6 },
    { key: "stepScale", label: "Step scale", min: 0.005, max: 1.5, step: 0.01, default: 0.07 },
    { key: "hueStep", label: "Step hue", min: 0, max: 10, step: 0.03, default: 0.12 },
    { key: "hueDepth", label: "Depth hue", min: 0, max: 10, step: 0.03, default: 1.4 },
    { key: "glow", label: "Vector glow", min: 0, max: 10, step: 0.05, default: 1.4 },
    { key: "glowFew", label: "Glow density", min: 0, max: 1.5, step: 0.01, default: 0.12 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 0.88 },
    { key: "fill", label: "Body fill", min: 0, max: 100, step: 0.3, default: 0.15 },
    { key: "stepClamp", label: "Step clamp", min: 3, max: 5000, step: 30, default: 800 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.5, step: 0.003, default: 0.01 },
    { key: "exposure", label: "Exposure", min: 1.5, max: 5000, step: 15, default: 260 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1.3 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.15 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    The states are staged on this orb's two best levers, both phase-safe
    integrated clocks: the AXIS WANDER (the whole field re-orients as the
    axis moves) and the cell-flicker speed. glowFew is the third lever —
    how many of the hot-wire vectors are lit at once.
  */
  statePresets: {
    // calm: slow shimmer, near-still axis, a few soft glows
    idle: {
      speed: 0.4,
      wander: 0.1,
      turb: 0.55,
      glow: 1.3,
      glowFew: 0.12,
      exposure: 260,
      scatter: 0.01,
      alphaGain: 2
    },
    /*
      searching: the axis HUNTS — wander runs six times idle, so the field
      lines continuously re-orient as if trying directions — while the
      glows go SPARSER but sharper: rare single sparks, ideas catching.
    */
    thinking: {
      speed: 1.2,
      wander: 0.6,
      turb: 0.7,
      glow: 1.7,
      glowFew: 0.07,
      exposure: 230,
      scatter: 0.0095,
      alphaGain: 2.1
    },
    /*
      answering: the axis settles (it found the direction) and the energy
      moves to the field itself — fast flicker, many hot wires at once
      (glowFew 0.22, further flared by the output volume), bright.
    */
    speaking: {
      speed: 2.2,
      wander: 0.3,
      turb: 0.85,
      glow: 2.4,
      glowFew: 0.22,
      exposure: 170,
      scatter: 0.0075,
      alphaGain: 2.5
    }
  },
  // the tint carries the at-a-glance read, as in chords: neutral at rest,
  // cooled while searching, warmed while answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#c3d2ff" },
    speaking: { tint: "#ffd9c4" }
  }
};

export type Shdr22Props = Omit<ShaderOrbProps, "variant">;

export function Shdr22({ size = 280, ...rest }: Shdr22Props) {
  return <ShaderOrb variant={shdr22Orb} size={size} {...rest} />;
}

export default Shdr22;
