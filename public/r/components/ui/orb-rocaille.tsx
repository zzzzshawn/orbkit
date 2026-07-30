/*
 * Deliberately not a `"use client"` module — see the note in `orb-hydrogen.tsx`.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   Rocaille — ornate scrollwork wrapped onto a sphere.

   Ten layers, each running the same nine-step iterative warp on a 2D point:

     v = p;  for f in 1..9:  v += sin(v.yx * f + i + t) / f

   The `v.yx` swizzle is what makes it ornate rather than noisy — each step
   feeds a coordinate back into the other axis, so the field folds into scrolls
   and shells instead of blurring. Brightness is `1 / length(v)`: wherever the
   warp happens to land a point near the origin, that layer flares. The layer
   index `i` both offsets the warp phase and picks the colour, so the ten sheets
   are differently coloured and never coincide.

   The original is a full-screen 2D field. Rather than mask a disc out of it —
   which just reads as a flat coin — the pattern is sampled through a
   STEREOGRAPHIC projection of the orb's dome, so it compresses toward the rim
   the way a texture on a real sphere does, and rolls as the dome rotates.
---------------------------------------------------------------------------- */

/*
 * Layer and warp counts are `#define`s: ES 1.0 requires constant loop bounds.
 * 10x9 is ~90 sin() per pixel — light next to the raymarched orbs.
 */
const ROCAILLE_FRAG = `
#define LAYERS 10
#define WARP 9

void main() {
  vec2 uv = orbUV();
  float R = uP_radius + uP_swell * uInput;
  float r2d = length(uv);
  float mask = smoothstep(0.012, -0.012, r2d - R);
  float nr = clamp(r2d / max(R, 0.001), 0.0, 1.0);
  float z = sqrt(max(1.0 - nr * nr, 0.0));

  float animTime = uP_speed; // integrated clock

  vec3 sp = vec3(uv / max(R, 0.001), z);

  /*
    Stereographic projection: sphere → plane. Equal steps in screen space map to
    ever-larger steps in pattern space as the rim is approached, which is exactly
    the foreshortening that sells a flat field as wrapped geometry. uP_bulge
    softens the divisor — higher flattens it back toward a disc.

    DO NOT rotate sp in 3D before this. Spinning the dome about Y mixes sp.x
    into sp.z, so near the rim the divisor collapses toward zero, p explodes,
    length(v) goes huge, and 1/length(v) leaves most of the sphere black. That
    is what hollowed the orb out. The projection needs sp.z to stay the
    view-facing component.

    Motion comes from animTime inside the warp below instead, which changes the
    scrollwork without ever touching the projection. If you want the pattern to
    travel, rotate or translate p here in 2D — that is projection-safe.
  */
  vec2 p = sp.xy / (sp.z + 1.0 + uP_bulge) * uP_zoom;

  // projection-safe 2D drift, in place of a dome spin
  float sw = animTime * uP_swirl;
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;

  // input volume tightens the warp; output volume brightens the layers
  float warpFreq = uP_warpFreq * (1.0 + 0.35 * uInput);
  float gain = uP_gain * (0.75 + 0.7 * uOutput);

  vec4 acc = vec4(0.0);
  for (int i = 1; i <= LAYERS; i++) {
    float fi = float(i);
    vec2 v = p;
    for (int j = 1; j <= WARP; j++) {
      float f = float(j);
      v += sin(v.yx * f * warpFreq + fi + animTime) / f;
    }
    // uP_coreClamp guards the divide and doubles as the flare size — the
    // original has no guard and relies on length(v) never hitting zero.
    //
    // uP_falloff is the FILL control. The original's plain 1/length(v) decays
    // fast, so only the knots where the warp lands near the origin light up and
    // the rest of the sphere stays near black. An exponent below 1 flattens the
    // tail — at length(v)=10 a 0.6 power is ~4x brighter than 1/x — which lifts
    // the filigree between the knots without blowing the knots themselves out.
    float rad = pow(max(length(v), uP_coreClamp), uP_falloff);
    acc += (cos(fi + vec4(0.0, 1.0, 2.0, 3.0) + uP_hueShift) + 1.0) / 6.0 / rad;
  }

  // the original squares before tone-mapping, which is what crushes the dim
  // filigree and leaves the bright scrollwork
  vec3 col = tanh3(acc.rgb * acc.rgb * gain);

  // rim light, so the silhouette reads as a ball rather than a cut-out
  float fresnel = pow(1.0 - z, uP_rimPow);
  col += vec3(fresnel) * uP_rim;

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float visibility = clamp(lum * uP_alphaGain + uP_baseVis + fresnel * 0.25, 0.0, 1.0);

  // Surface-lit and mask-bounded, so alpha is coverage: premultiply normally.
  // (Unlike Corona and Nimbus, which are emissive and must not be.)
  float a = mask * visibility;
  gl_FragColor = vec4(col * a, a);
}
`;

export const rocailleOrb: OrbVariant = {
  key: "rocaille",
  label: "Rocaille",
  note: "ornate scrollwork on a rolling dome",
  frag: ROCAILLE_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.05, max: 3, step: 0.05, default: 0.5, integrate: true },
    { key: "swirl", label: "Swirl", min: 0, max: 1, step: 0.01, default: 0.06 },
    { key: "radius", label: "Radius", min: 0.5, max: 1, step: 0.01, default: 0.9 },
    { key: "swell", label: "Input swell", min: 0, max: 0.3, step: 0.01, default: 0.06 },
    { key: "zoom", label: "Pattern zoom", min: 0.5, max: 12, step: 0.1, default: 4.4 },
    { key: "bulge", label: "Sphere bulge", min: 0, max: 3, step: 0.05, default: 0.35 },
    { key: "warpFreq", label: "Warp frequency", min: 0.2, max: 3, step: 0.05, default: 1.5 },
    { key: "hueShift", label: "Hue shift", min: 0, max: 6.283, step: 0.05, default: 0 },
    { key: "coreClamp", label: "Flare size", min: 0.01, max: 1, step: 0.01, default: 0.12 },
    { key: "falloff", label: "Fill", min: 0.2, max: 1.5, step: 0.05, default: 1 },
    { key: "gain", label: "Exposure", min: 0.05, max: 4, step: 0.05, default: 0.55 },
    { key: "rim", label: "Rim light", min: 0, max: 1, step: 0.01, default: 0.12 },
    { key: "rimPow", label: "Rim tightness", min: 0.5, max: 5, step: 0.1, default: 2.2 },
    { key: "alphaGain", label: "Alpha gain", min: 0.2, max: 6, step: 0.05, default: 2.4 },
    { key: "baseVis", label: "Base visibility", min: 0, max: 0.5, step: 0.01, default: 0.08 }
  ],
  colors: [],
  /*
   * No dome rotation in any state — see the projection note in the shader. The
   * states differ by how fast the scrollwork evolves and how dense it is.
   */
  statePresets: {
    // calm: slow evolution, open scrollwork
    idle: {
      speed: 0.5,
      swirl: 0.06,
      zoom: 4.4,
      warpFreq: 1.5,
      coreClamp: 0.12,
      falloff: 1,
      gain: 0.55,
      rim: 0.12,
      alphaGain: 2.4
    },
    // restless: tighter filigree, brighter flares
    listening: {
      speed: 0.8,
      swirl: 0.1,
      zoom: 4.8,
      warpFreq: 1.7,
      coreClamp: 0.1,
      falloff: 0.92,
      gain: 0.65,
      rim: 0.14,
      alphaGain: 2.6
    },
    thinking: {
      speed: 0.65,
      swirl: 0.08,
      zoom: 4.6,
      warpFreq: 1.6,
      coreClamp: 0.11,
      falloff: 0.96,
      gain: 0.6,
      rim: 0.13,
      alphaGain: 2.5
    },
    // loudest: fast evolution, dense pattern, hot cores
    speaking: {
      speed: 1.6,
      swirl: 0.16,
      zoom: 5.4,
      warpFreq: 1.95,
      coreClamp: 0.08,
      falloff: 0.85,
      gain: 0.8,
      rim: 0.18,
      alphaGain: 2.9
    }
  }
};

export type OrbRocailleProps = Omit<ShaderOrbProps, "variant">;

export function OrbRocaille({ size = 280, ...rest }: OrbRocailleProps) {
  return <ShaderOrb variant={rocailleOrb} size={size} {...rest} />;
}

export default OrbRocaille;
