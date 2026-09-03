/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-20 — a water film rushing down the ball, fountain-style.

   Ported from a golfed twigl listing:

     vec3 x,c,p;x.x+=9.;
     for(float i,z,f;i++<5e1;
       p=mix(c,p,.3),
       z+=f=.2*(abs(p.z+p.x+16.+tanh(p.y)/.1)+sin(p.x-p.z+t+t)+1.),
       o+=(cos(p.x*.2+f+vec4(6,1,2,0))+2.)/f/z)
     for(c=p=z*normalize(FC.rgb*2.-r.xyy),p.y*=f=.3;f++<5.;
       p+=cos(p.yzx*f+i+z+x*t)/f);
     o=tanh(o/3e1);

   What it actually is, decoded:

   - p.y *= .3 SQUASHES the vertical axis before five cos octaves, so every
     structure stretches into tall streaks — the falling-water grain.
   - x is built by x.x += 9. on a zero-init local, so x*t = (9t,0,0): the
     octave phases scroll at NINE times the clock. That rush is the fall.
   - mix(c,p,.3) blends the turbulent point back toward the clean ray
     point — only 30% of the displacement survives, a film of foam over a
     coherent surface.
   - abs(p.z+p.x+16.+tanh(p.y)/.1) is a SIGMOID CLIFF: two diagonal planes
     (x+z = -6 low, -26 high) blended by 10*tanh(y), with a traveling
     ripple sin(p.x-p.z+2t) running across the face.
   - The palette (cos(p.x*.2+f+(6,1,2))+2)/f/z hangs vertical hue sheets
     on the face, bright where the march grazes the surface.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: the cliff face becomes the sphere's own shell,
     so the film flows down the BALL — a fountain, not a wall in a jar.
     The squash, the 9t rush and the ripple all carry over unchanged; only
     the geometry they decorate is swapped for the orb itself.
   - The golfed listing relies on x, c, p, i, z, f starting at zero —
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - f can reach exactly ZERO (abs at the surface, ripple at -1, +1) and
     the weight divides by it — guarded, as is the march step so it cannot
     stall.
   - Clocks enter only as additive phase. The rush gets its own integrated
     clock so flow speed tunes without jumping the film.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds.
 * TURB is 5 to match the original's octaves (divisors 1.3 .. 5.3).
 */
const FALLS_FRAG = `
#define STEPS 50
#define TURB 5
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float fallsFoam;
float fallsExposure;

mat2 fallsRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 fallsRender(vec2 fragCoord) {
  float animTime = uP_speed; // integrated clock: ripple phase
  float flow = uP_flow;      // integrated clock: the 9t rush, tunable

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float rShell = uP_envRadius * 0.92;

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — near foam veils far foam
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  for (int it = 0; it < STEPS; it++) {
    vec3 c = ro + rd * z;

    // a slight static tilt of the flow axis
    c.yz = fallsRot(uP_tilt) * c.yz;

    /*
      The fall grain: squash the vertical axis, then the five octaves with
      the rush phase on the first component — cos(p.yzx*f + ...) writes
      that component to x, so height and time drive the sideways waves,
      exactly the original's x*t construction.
    */
    vec3 p = c;
    p.y *= uP_stretch;
    for (int j = 0; j < TURB; j++) {
      float fj = float(j) + 1.3;
      p += cos(p.yzx * fj + float(it) + z + vec3(flow, 0.0, 0.0)) / fj;
    }

    // the foam blend — most of the displacement is thrown away, leaving a
    // film of detail over a coherent surface
    vec3 pm = mix(c, p, fallsFoam);

    /*
      The surface, swapped from the sigmoid cliff to the ball's own shell:
      distance to the sphere (sharpened by uP_wall) plus the original's
      traveling ripple. f can still reach zero exactly — the guard feeds
      both the division and the march step.
    */
    float f = uP_stepScale * (abs(length(pm) - rShell) * uP_wall
      + sin(pm.x - pm.z + animTime * 2.0) + 1.0);
    f = max(f, 1e-3);
    z += f;

    /*
      Vertical hue sheets from the listing, bright where the march grazes
      the film. The CLAMP is load-bearing, as in every accumulator here —
      one f-null step would own the whole 50-step sum.
    */
    vec3 w = (cos(pm.x * uP_hueScale + f + vec3(6.0, 1.0, 2.0)) + 2.0) / f / max(z, 1.0);
    w = min(w, vec3(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(ro + rd * z));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    if (T < 0.004 || z > zEnd) break;
  }

  return acc;
}

void main() {
  fallsFoam = uP_foam * (1.0 + 0.5 * uInput);
  fallsExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += fallsRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = fallsRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the golfed /3e1 knee is a tunable here
  vec3 col = tanh3(acc / max(fallsExposure, 1.0));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue sheet
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

export const shdr20Orb: OrbVariant = {
  key: "shdr-20",
  label: "SHDR-20",
  note: "a water film rushing down the ball, fountain-style",
  frag: FALLS_FRAG,
  params: [
    { key: "speed", label: "Ripple speed", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "flow", label: "Fall rush", min: 0, max: 20, step: 0.1, default: 3, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.1, default: 2.25 },
    { key: "tilt", label: "Flow tilt", min: 0, max: 4, step: 0.02, default: 0.15 },
    { key: "stretch", label: "Fall stretch", min: 0.03, max: 3, step: 0.015, default: 0.3 },
    { key: "foam", label: "Foam", min: 0, max: 3, step: 0.015, default: 0.3 },
    { key: "wall", label: "Film sharpness", min: 0.15, max: 20, step: 0.1, default: 3 },
    { key: "stepScale", label: "Step scale", min: 0.015, max: 1.5, step: 0.01, default: 0.2 },
    { key: "hueScale", label: "Hue banding", min: 0, max: 3, step: 0.015, default: 0.85 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 1 },
    { key: "fill", label: "Body fill", min: 0, max: 100, step: 0.3, default: 0.4 },
    { key: "stepClamp", label: "Step clamp", min: 0.3, max: 300, step: 1.5, default: 20 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.5, step: 0.003, default: 0.01 },
    { key: "exposure", label: "Exposure", min: 1.5, max: 1500, step: 10, default: 22 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1.15 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.55 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  statePresets: {
    idle: {
      speed: 0.5,
      flow: 3,
      foam: 0.3,
      exposure: 22,
      scatter: 0.01,
      alphaGain: 2
    },
    thinking: {
      speed: 0.6,
      flow: 3.3,
      foam: 0.33,
      exposure: 21,
      scatter: 0.0095,
      alphaGain: 2.1
    },
    // loudest: full rush, thick foam, hot film
    speaking: {
      speed: 1,
      flow: 5.5,
      foam: 0.45,
      exposure: 16,
      scatter: 0.0075,
      alphaGain: 2.5
    }
  }
};

export type Shdr20Props = Omit<ShaderOrbProps, "variant">;

export function Shdr20({ size = 280, ...rest }: Shdr20Props) {
  return <ShaderOrb variant={shdr20Orb} size={size} {...rest} />;
}

export default Shdr20;
