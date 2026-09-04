/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-15 — an iridescent particle-track web, worn as the ball's own skin.

   Ported from a golfed twigl listing:

     for(float i,z,d,s;i++<1e1;o+=(cos(z/.03+t+vec4(0,2,3,0))+1.)/d/s){
       vec3 p=z*normalize(FC.rgb*2.-r.xyy),
            a=normalize(cos(vec3(7,1,0)+t-s));
       p.z+=9.,a=a*dot(a,p)-cross(a,p);
       for(d=1.;d++<9.;)a+=sin(a*d+t).yzx/d;
       z+=d=.03*abs(sin(s=length(a)));}
     o=tanh(o/3e3);

   What it actually is, decoded:

   - TEN steps, each at most 0.03 long: the whole march is a MICRO-SLAB a
     third of a unit thick. This is not a volume, it is ten nested layers
     of one interference pattern.
   - d = .03*abs(sin(length(a))) sticks the march wherever the turbulent
     field magnitude sits on a multiple of pi — concentric shells in field
     space. The 1/d weight genuinely reaches infinity there; tanh eats it,
     and those near-zeros ARE the bright web cores.
   - a*dot(a,p) - cross(a,p) is the minus-90-degree twin of shdr-22'
     exact Rodrigues rotation. The axis cos((7,1,0)+t-s) carries FEEDBACK:
     s is last step's field magnitude, so every layer takes a differently
     jittered axis and the ten layers interfere.
   - cos(z/.03 + t + (0,2,3)) cycles the palette once per layer or so —
     the iridescent banding.
   - p.z += 9 puts the camera OUTSIDE, like shdr-22.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: the micro-slab is anchored to the sphere
     ANALYTICALLY — each ray starts its ten tiny steps at its own
     sphere-entry point, so the slab follows the ball's curve and the web
     becomes the orb's actual skin, wrapping the limb for free. The depth
     hue uses (z - entry), turning layer banding into skin iridescence.
   - The golfed listing relies on i, z, d, s starting at zero —
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - The 1/d spike is clamped and the clamped weight is normalized back to
     family units, exactly as in shdr-22 (the golfed knee here is 3e3)
     — so stepClamp stays a pure dynamic-range knob.
   - Clocks enter only as additive phase; the axis gets its own integrated
     clock so its wander rate tunes without jumping the web.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds.
 * TURB is 8 to match the original's octaves (d = 2..9).
 */
const MUONS_FRAG = `
#define STEPS 10
#define TURB 8
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float muonsTurb;
float muonsExposure;

vec3 muonsRender(vec2 fragCoord) {
  float animTime = uP_speed; // integrated clock: weave + hue phase
  float wander = uP_wander;  // integrated clock: axis drift

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  /*
    Anchor the micro-slab to the ball: intersect the ray with the shell
    analytically and start the ten steps AT the entry point, so the slab
    hugs the sphere's curve. Rays that miss fall back to their closest
    approach — the envelope and silhouette cut them anyway.
  */
  float proj = dot(-ro, rd);
  float b2 = dot(ro, ro) - proj * proj;
  float R = uP_envRadius * 0.96;
  float entry = proj - sqrt(max(R * R - b2, 0.0));

  vec3 acc = vec3(0.0);
  float T = 1.0;
  float z = entry;
  float s = 0.0;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    // shell points scaled into field space — the original worked around
    // magnitude 9, and the ring density rides on that magnitude
    vec3 q = p * uP_fieldScale;

    // the per-layer axis, with the original's s feedback — each of the
    // ten layers takes a differently jittered axis
    vec3 axis = normalize(cos(vec3(7.0, 1.0, 0.0) + wander - s));

    // the minus-90-degree Rodrigues twin of shdr-22
    vec3 a = axis * dot(axis, q) - cross(axis, q);

    for (int j = 0; j < TURB; j++) {
      float dj = float(j) + 2.0;
      a += muonsTurb * sin(a * dj + animTime).yzx / dj;
    }

    // the shells: the march sticks where the field magnitude sits on a
    // multiple of pi, and 1/d blows up — that is the web
    s = length(a);
    float d = uP_stepScale * abs(sin(s));
    d = max(d, 1e-5);
    z += d;

    /*
      Layer-cycled palette, with the depth measured from the ENTRY point
      so the banding follows the ball's skin. Clamp then normalize to
      family units, as in shdr-22 — the raw spikes run to 1/1e-5.
    */
    vec3 w = (cos((z - entry) / max(uP_stepScale, 1e-3) + animTime + vec3(0.0, 2.0, 3.0) * uP_disperse) + 1.0)
      / d / max(s, 0.5);
    w = min(w, vec3(uP_stepClamp));
    w *= 20.0 / max(uP_stepClamp, 1.0);

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    if (T < 0.004) break;
  }

  return acc;
}

void main() {
  muonsTurb = uP_turb * (1.0 + 0.5 * uInput);
  muonsExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += muonsRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = muonsRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the golfed /3e3 knee is a tunable here
  vec3 col = tanh3(acc / max(muonsExposure, 1.0));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a saturated violet
  // thread has low luminance but must not go transparent
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

export const shdr15Orb: OrbVariant = {
  key: "shdr-15",
  label: "SHDR-15",
  note: "an iridescent particle-track web worn as the ball's skin",
  frag: MUONS_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "wander", label: "Axis wander", min: 0, max: 3, step: 0.015, default: 0.15, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.1, default: 2.25 },
    { key: "fieldScale", label: "Web density", min: 1, max: 20, step: 0.1, default: 2.4 },
    { key: "turb", label: "Weave", min: 0, max: 5, step: 0.03, default: 0.8 },
    { key: "stepScale", label: "Skin depth", min: 0.0015, max: 0.4, step: 0.005, default: 0.015 },
    { key: "disperse", label: "Dispersion", min: 0, max: 5, step: 0.03, default: 1 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 1 },
    { key: "fill", label: "Body fill", min: 0, max: 100, step: 0.3, default: 0.3 },
    { key: "stepClamp", label: "Step clamp", min: 3, max: 5000, step: 30, default: 150 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.5, step: 0.003, default: 0.01 },
    { key: "exposure", label: "Exposure", min: 1.5, max: 1500, step: 10, default: 50 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1.35 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.35 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on the two integrated clocks, as across the family: thinking
    sends the AXIS hunting (the web continuously reweaves in place) while
    speaking is speed-led (the layer-cycled iridescence shimmers fast and
    bright). turb and disperse are amplitudes/phases — everything glides.
  */
  statePresets: {
    // calm: slow weave, near-still axis
    idle: {
      speed: 0.4,
      wander: 0.12,
      turb: 0.75,
      disperse: 1,
      exposure: 72,
      scatter: 0.01,
      alphaGain: 2
    },
    // reweaving: the axis hunts at six times idle and the weave deepens —
    // the web knits and unknits in place, spectrum pulled tighter
    thinking: {
      speed: 1,
      wander: 0.7,
      turb: 0.95,
      disperse: 0.8,
      exposure: 66,
      scatter: 0.0095,
      alphaGain: 2.1
    },
    // answering: fast iridescent shimmer, wide spectrum, hot threads
    speaking: {
      speed: 2,
      wander: 0.3,
      turb: 1.1,
      disperse: 1.6,
      exposure: 46,
      scatter: 0.0075,
      alphaGain: 2.5
    }
  }
};

export type Shdr15Props = Omit<ShaderOrbProps, "variant">;

export function Shdr15({ size = 280, ...rest }: Shdr15Props) {
  return <ShaderOrb variant={shdr15Orb} size={size} {...rest} />;
}

export default Shdr15;
