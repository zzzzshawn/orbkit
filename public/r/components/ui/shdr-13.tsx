/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-13 — a plasma globe: crawling lightning filaments inside a glass ball.

   The reference is the physical object: a tesla ball with a hot nucleus,
   pink-to-violet streamers writhing out to the glass, and bright flares
   where a filament touches the shell.

   How the filaments are built, and why they behave like the real thing:

   - A curve in 3D is the intersection of two level surfaces. Two independent
     trig fields are evaluated on the DIRECTION of each march point
     (q = dir * fils, |dir| = 1), so their joint zero set is a set of
     directions — extruded radially, those are filaments running from the
     nucleus to the glass, never a floating blob. Filament count rides the
     angular frequency uP_fils, so a state preset can literally grow more
     streamers, and because the field morphs smoothly the new ones split off
     from existing ones instead of popping in.
   - Each field carries its own additive time phases, so the zero curves
     drift, merge, and reconnect — the crawl of a real streamer hunting
     across the glass. The whole array also precesses on an integrated spin
     clock.
   - A radial writhe term bends the direction before sampling, gated by
     smoothstep from the centre so every filament stays ROOTED at the
     nucleus while its far end wanders on the shell.
   - Proximity to the curve is measured in field space (f1^2 + f2^2), and
     brightness is its inverse — the same 1/d accumulation as the other
     volumetric orbs, so thickness varies naturally along a filament with
     the field gradient.
   - The march is bounded to the exact ray/sphere chord (entry to exit), and
     each step is weighted by its true length, so limb rays integrate short
     chords and dim correctly; the tip flare (a smoothstep in r near the
     shell) is what lights the glass from inside where streamers land.
   - Colour is a radial mix: the inner colour near the nucleus, the arc
     colour toward the glass, cores whitened by their own intensity — the
     pink-core / violet-tip gradient of a real discharge.

   House rules followed from the other orbs: per-step clamp before the
   spikes own the frame, front-to-back transmittance, tanh tone map with an
   exposure knee, alpha from the brightest channel, and the analytic
   silhouette cut from each ray's closest approach — colour AND alpha.
---------------------------------------------------------------------------- */

/*
 * Step count is a `#define`: ES 1.0 requires constant loop bounds.
 */
const ION_FRAG = `
#define STEPS 64

// Volume-reactive values, resolved once per fragment in main().
float ionSharp;
float ionWrithe;
float ionCore;
float ionExposure;
float ionRadius;

mat2 ionRot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 ionRender(vec2 fragCoord) {
  float t = uP_speed;      // integrated clock: filament crawl
  float spinAng = uP_spin; // integrated clock: array precession

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  // exact ray/sphere chord — the march never leaves the globe, so no
  // envelope fade is needed and every step length is meaningful
  float proj = dot(-ro, rd);
  float b2 = dot(ro, ro) - proj * proj;
  float half_ = sqrt(max(ionRadius * ionRadius - b2, 0.0));
  float zNear = proj - half_;
  float stepLen = 2.0 * half_ / float(STEPS);
  // per-pixel jitter of the march start: a filament grazed at a shallow
  // angle is crossed periodically by the fixed step grid and renders as a
  // dotted chain — the jitter decorrelates neighbouring rays and melts the
  // dots into plasma grain
  zNear += (hash(fragCoord) - 0.5) * stepLen;

  vec3 acc = vec3(0.0);
  float T = 1.0;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (zNear + (float(i) + 0.5) * stepLen);

    // precess the whole filament array; a static tilt keeps the spin axis
    // off-vertical so the motion reads in 3D
    vec3 pr = p;
    pr.xz = ionRot2(spinAng) * pr.xz;
    pr.yz = ionRot2(uP_tilt) * pr.yz;

    float r = length(pr);
    vec3 dir = pr / max(r, 1e-4);
    float rr = r / max(ionRadius, 1e-3);

    // writhe: bend the sampling direction with radius and time, rooted at
    // the nucleus by the smoothstep so filaments stay attached
    float wr = ionWrithe * smoothstep(0.0, ionRadius * 0.35, r);
    vec3 q = dir * uP_fils;
    q += wr * vec3(
      sin(r * uP_writheFreq        - t * 1.2 + q.y * 1.8),
      sin(r * uP_writheFreq * 0.83 + t * 1.0 + q.z * 1.8),
      sin(r * uP_writheFreq * 1.19 - t * 0.7 + q.x * 1.8));

    // two independent fields over the direction sphere; their joint zero
    // set is the filament curves. Time enters as additive phase only.
    float f1 = sin(q.x + t * 0.70)
             + sin(q.y * 1.31 - t * 0.50)
             + sin(q.z * 1.13 + t * 0.90);
    float f2 = sin(q.y * 1.21 + t * 0.60 + 1.7)
             + sin(q.z * 1.43 - t * 0.80 + 3.1)
             + sin(q.x * 0.87 + t * 0.40 + 5.0);
    float d2 = f1 * f1 + f2 * f2;
    float g = 1.0 / (d2 * ionSharp + uP_soft);

    // flare where a streamer lands on the glass, and the hot nucleus
    g *= 1.0 + uP_tipGain * smoothstep(0.55, 0.95, rr);
    float core = ionCore / (r * r * 8.0 + 0.05);

    // pink near the nucleus, violet-blue at the glass, cores whitened by
    // their own intensity
    vec3 fCol = mix(uC_inner, uC_arc, smoothstep(0.1, 0.75, rr));
    vec3 w = (fCol + vec3(uP_whiten) * g) * g + uC_inner * core + vec3(uP_fill);
    w = min(w, vec3(uP_stepClamp));
    w *= stepLen; // length-fair: limb chords are short and dim correctly

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);
    if (T < 0.004) break;
  }

  return acc;
}

void main() {
  // Louder agent output softens and thickens the arcs and quickens the
  // writhe; user input flares the nucleus — the globe answers being spoken
  // to the way the real toy answers a fingertip.
  ionSharp = uP_sharp * (1.0 - 0.25 * uOutput);
  ionWrithe = uP_writhe * (1.0 + 0.6 * uOutput);
  ionCore = uP_coreGain * (1.0 + 1.6 * uInput + 0.4 * uOutput);
  ionExposure = uP_exposure * (1.0 - 0.35 * uOutput);
  ionRadius = uP_envRadius + uP_swell * uInput;

  vec3 acc = ionRender(gl_FragCoord.xy);

  // tanh tone map with a tunable knee, then the usual finishing chain
  vec3 col = tanh3(acc / max(ionExposure, 0.01));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel — a saturated violet streamer has low
  // luminance but must not go transparent
  float peak = max(col.r, max(col.g, col.b));
  float a = clamp(peak * uP_alphaGain, 0.0, 1.0);

  // analytic silhouette, identical construction to shdr-01: exact
  // ray-to-centre distance against the radius, colour AND alpha
  vec3 mrd = normalize(vec3(orbUV(), -uP_focal));
  float closest = length(cross(vec3(0.0, 0.0, uP_camDist), mrd));
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(ionRadius * (1.0 - band), ionRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // Emitted light, so rgb is already premultiplied — do NOT scale by alpha
  // again (see the same note in shdr-31).
  gl_FragColor = vec4(col, a);
}
`;

export const shdr13Orb: OrbVariant = {
  key: "shdr-13",
  label: "SHDR-13",
  note: "plasma globe: crawling lightning filaments",
  frag: ION_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 1, integrate: true },
    { key: "spin", label: "Spin rate", min: 0, max: 5, step: 0.03, default: 0.2, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.1, default: 2.25 },
    { key: "envRadius", label: "Globe radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "swell", label: "Input swell", min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: "tilt", label: "Axis tilt", min: 0, max: 4, step: 0.02, default: 0.4 },
    { key: "fils", label: "Filament density", min: 0.5, max: 12, step: 0.1, default: 6 },
    { key: "writhe", label: "Writhe", min: 0, max: 3, step: 0.02, default: 0.9 },
    { key: "writheFreq", label: "Writhe frequency", min: 0.2, max: 8, step: 0.05, default: 1.6 },
    { key: "sharp", label: "Arc sharpness", min: 0.5, max: 60, step: 0.5, default: 4 },
    { key: "soft", label: "Arc core softness", min: 0.002, max: 0.5, step: 0.002, default: 0.06 },
    { key: "whiten", label: "Core whitening", min: 0, max: 0.2, step: 0.002, default: 0.008 },
    { key: "coreGain", label: "Nucleus glow", min: 0, max: 5, step: 0.05, default: 1.6 },
    { key: "tipGain", label: "Glass flare", min: 0, max: 6, step: 0.05, default: 1.8 },
    { key: "fill", label: "Body haze", min: 0, max: 2, step: 0.01, default: 0.02 },
    { key: "stepClamp", label: "Step clamp", min: 0.3, max: 300, step: 1.5, default: 40 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.5, step: 0.003, default: 0.012 },
    { key: "exposure", label: "Exposure", min: 0.1, max: 200, step: 0.5, default: 11 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.2 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2.5 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 }
  ],
  colors: [
    { key: "inner", label: "Nucleus", default: "#ff70d8" },
    { key: "arc", label: "Arc", default: "#5a5cff" },
    { key: "tint", label: "Tint", default: "#ffffff" }
  ],
  statePresets: {
    // a full globe of swooping arcs around a hot nucleus
    idle: {
      speed: 1,
      spin: 0.2,
      fils: 6,
      writhe: 0.9,
      sharp: 4,
      soft: 0.06,
      whiten: 0.008,
      tipGain: 1.8,
      coreGain: 1.6,
      exposure: 11
    },
    // hunting: even more filaments, softer and more nebular, restless writhe
    thinking: {
      speed: 1.8,
      spin: 0.45,
      fils: 7,
      writhe: 1.2,
      sharp: 3,
      soft: 0.08,
      whiten: 0.012,
      tipGain: 1.5,
      coreGain: 1.2,
      exposure: 10
    },
    // discharge: the densest, brightest state — spiky arcs flaring hard on
    // the glass around a blazing core
    speaking: {
      speed: 2.6,
      spin: 0.3,
      fils: 8,
      writhe: 1.3,
      sharp: 3.5,
      soft: 0.05,
      whiten: 0.012,
      tipGain: 2.4,
      coreGain: 2,
      exposure: 8.5
    }
  }
};

export type Shdr13Props = Omit<ShaderOrbProps, "variant">;

export function Shdr13({ size = 280, ...rest }: Shdr13Props) {
  return <ShaderOrb variant={shdr13Orb} size={size} {...rest} />;
}

export default Shdr13;
