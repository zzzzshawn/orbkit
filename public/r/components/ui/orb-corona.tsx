/*
 * Deliberately not a `"use client"` module — see the note in `orb-hydrogen.tsx`.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   Corona — a raymarched SDF shell with volumetric godrays.

   The distance field is the space between a sine-warped sphere and a plain one
   (`-smin(warped, inverted, k)`), so the camera looks into a glowing hollow
   rather than at a solid surface. Light is accumulated along every ray as an
   inverse-square falloff gated by the shell, which is what produces the
   god-ray bleed — there is no light source, only the integral.

   Ported to WebGL 1 / GLSL ES 1.0, which needed four fixes:
     1. `transpose()` is ES 3.0 only — hand-written as `transpose3` below.
     2. `fragColor` was assigned in main() but never declared; ES 1.0 writes to
        the built-in `gl_FragColor`.
     3. ES 1.0 restricts a for-loop condition to comparing the index against a
        constant, so the march exits via `break` instead.
     4. `u_time` / `u_resolution` are the runtime's `uP_speed` clock and `uRes`.

   The original returned an opaque frame. Orbs composite onto the page, so the
   accumulated luminance drives alpha instead and the orb glows over whatever
   is behind it.
---------------------------------------------------------------------------- */

/*
 * Supersampling factor and march ceiling are `#define`s, not params: ES 1.0
 * needs constant loop bounds. AA=2 means 4 full marches per pixel — at DPR 2
 * that is 16 marches per CSS pixel, which is why this ships at 1.
 */
const CORONA_FRAG = `
#define AA 1
#define MAX_STEPS 256

mat3 transpose3(mat3 m) {
  return mat3(
    m[0][0], m[1][0], m[2][0],
    m[0][1], m[1][1], m[2][1],
    m[0][2], m[1][2], m[2][2]
  );
}

// An artistic tumble, not an orthonormal rotation — the axes shear against each
// other so the shell never repeats a clean spin.
mat3 coronaRot(float a) {
  return mat3(
    cos(a), sin(a / 2.0) * sin(a), sin(a) * cos(a / 2.0),
    0.0, cos(a / 2.0), -sin(a / 2.0),
    -sin(a), sin(a / 2.0) * cos(a), cos(a / 2.0) * cos(a)
  );
}

mat3 globalRot;
mat3 globalInvRot;

// Volume-reactive values, resolved once per fragment in main().
float shellRadius;
float warpAmount;
float rayGain;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float coronaSDF(vec3 p) {
  vec3 p1 = p;
  p1.zyx += sin(p.xzy * uP_warpFreq) / max(warpAmount, 0.001);
  return -smin(length(p1) - shellRadius, shellRadius - length(p), uP_smoothK);
}

vec3 shellColor(vec3 p) {
  float eps = 0.001;
  vec3 normal = globalInvRot * normalize(vec3(
    coronaSDF(p + vec3(eps, 0.0, 0.0)) - coronaSDF(p - vec3(eps, 0.0, 0.0)),
    coronaSDF(p + vec3(0.0, eps, 0.0)) - coronaSDF(p - vec3(0.0, eps, 0.0)),
    coronaSDF(p + vec3(0.0, 0.0, eps)) - coronaSDF(p - vec3(0.0, 0.0, eps))
  ));

  vec3 next = 1.0 - (normal * 0.5 + 0.5);
  next = vec3(dot(next, vec3(1.0)) / 3.0);
  return 1.025 - next * next;
}

vec4 coronaRender(vec2 fragCoord) {
  vec2 uv = (fragCoord * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = vec3(0.0, 0.0, -uP_camDist);
  vec3 rd = normalize(vec3(uv, uP_fov));

  ro = globalRot * ro;
  rd = globalRot * rd;

  vec3 p = ro;
  float d = 1.0;
  float t = 0.0;
  float godrays = 0.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (d <= 0.005 || t >= uP_maxDist) break;
    p = ro + rd * t;
    d = coronaSDF(p) / max(uP_stepScale, 0.5);

    // Gate the accumulation on the shell so light bleeds out of the hollow
    // instead of glowing uniformly through empty space.
    float fog = length(p) > shellRadius
      ? smoothstep(0.0, 0.5, coronaSDF(normalize(p) * shellRadius))
      : 1.0;
    godrays += (rayGain / (1.0 + dot(p, p) * uP_rayFalloff)) * fog;

    t += d;
  }

  vec3 col = vec3(uP_ambient);
  if (t < uP_maxDist) col = shellColor(p) * uP_surfaceLit;
  col += godrays;

  return vec4(col, 1.0);
}

void main() {
  float animTime = uP_speed; // integrated clock
  globalRot = coronaRot(animTime);
  globalInvRot = transpose3(coronaRot(animTime));

  // Louder agent output pushes the godrays; user input roughens the shell and
  // swells it slightly, so the silhouette breathes with speech.
  shellRadius = uP_radius + uP_swell * uInput;
  warpAmount = uP_warp * (1.0 - 0.25 * uInput - 0.15 * uOutput);
  rayGain = uP_rayGain * (0.7 + 0.8 * uOutput + 0.3 * uInput);

  vec4 acc = vec4(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += coronaRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = coronaRender(gl_FragCoord.xy);
#endif

  // Luminance becomes alpha so the orb composites onto the page instead of
  // painting an opaque square.
  //
  // The colour is emitted light, so it is already premultiplied: rgb is what
  // the orb adds, alpha is only how much background it hides. Multiplying rgb
  // by alpha again (the usual move for a lit surface) would darken the glow
  // quadratically and wash the godrays out.
  vec3 col = clamp(acc.rgb, 0.0, 1.0);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float a = clamp(lum * uP_alphaGain, 0.0, 1.0);

  // The godrays are volumetric, so they reach the frame boundary and would
  // otherwise show the canvas as a hard-edged glowing square. Taper radially to
  // let the halo fall off into the page instead — colour as well as alpha,
  // since premultiplied output would otherwise keep emitting at full brightness
  // right up to the cutoff and leave a visible rim.
  float fade = 1.0 - smoothstep(uP_edgeFade, 1.0, length(orbUV()));
  col *= fade;
  a *= fade;

  gl_FragColor = vec4(col, a);
}
`;

export const coronaOrb: OrbVariant = {
  key: "corona",
  label: "Corona",
  note: "raymarched shell, volumetric godrays",
  frag: CORONA_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.05, max: 3, step: 0.05, default: 0.5, integrate: true },
    { key: "radius", label: "Shell radius", min: 1.2, max: 4, step: 0.05, default: 2.6 },
    { key: "swell", label: "Input swell", min: 0, max: 1, step: 0.01, default: 0.18 },
    { key: "warp", label: "Warp divisor", min: 0.3, max: 3, step: 0.05, default: 0.9 },
    { key: "warpFreq", label: "Warp frequency", min: 0.5, max: 10, step: 0.1, default: 4 },
    { key: "smoothK", label: "Blend softness", min: 0.05, max: 1.5, step: 0.01, default: 0.4 },
    { key: "rayGain", label: "Godray gain", min: 0, max: 1.5, step: 0.01, default: 0.4 },
    { key: "rayFalloff", label: "Godray falloff", min: 1, max: 40, step: 0.5, default: 10 },
    { key: "surfaceLit", label: "Surface light", min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: "ambient", label: "Ambient", min: 0, max: 0.3, step: 0.005, default: 0 },
    { key: "alphaGain", label: "Alpha gain", min: 0.2, max: 6, step: 0.05, default: 1.6 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 1, step: 0.01, default: 0.45 },
    { key: "camDist", label: "Camera distance", min: 5, max: 24, step: 0.5, default: 12 },
    { key: "fov", label: "Lens", min: 1, max: 8, step: 0.1, default: 3 },
    { key: "stepScale", label: "Step safety", min: 1, max: 10, step: 0.5, default: 5 },
    { key: "maxDist", label: "Max distance", min: 8, max: 40, step: 1, default: 20 }
  ],
  colors: [],
  statePresets: {
    // calm: slow tumble, tight godrays
    idle: {
      speed: 0.5,
      radius: 2.6,
      warp: 0.9,
      warpFreq: 4,
      smoothK: 0.4,
      rayGain: 0.4,
      rayFalloff: 10,
      surfaceLit: 0.1,
      alphaGain: 1.6
    },
    // restless: faster tumble, finer warp, brighter bleed
    listening: {
      speed: 0.9,
      radius: 2.6,
      warp: 0.75,
      warpFreq: 5.2,
      smoothK: 0.32,
      rayGain: 0.52,
      rayFalloff: 8,
      surfaceLit: 0.14,
      alphaGain: 1.8
    },
    thinking: {
      speed: 0.75,
      radius: 2.6,
      warp: 0.8,
      warpFreq: 4.6,
      smoothK: 0.5,
      rayGain: 0.46,
      rayFalloff: 9,
      surfaceLit: 0.12,
      alphaGain: 1.7
    },
    // loudest: fast tumble, deep warp, wide-open godrays
    speaking: {
      speed: 1.9,
      radius: 2.75,
      warp: 0.6,
      warpFreq: 6.4,
      smoothK: 0.26,
      rayGain: 0.68,
      rayFalloff: 6,
      surfaceLit: 0.18,
      alphaGain: 2.1
    }
  }
};

export type OrbCoronaProps = Omit<ShaderOrbProps, "variant">;

export function OrbCorona({ size = 280, ...rest }: OrbCoronaProps) {
  return <ShaderOrb variant={coronaOrb} size={size} {...rest} />;
}

export default OrbCorona;
