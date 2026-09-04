/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-32 — a galaxy, marched as a volume of gas and dust inside the ball.

   Built the way the raymarched orbs here are built (shdr-18, shdr-22,
   shdr-21), not as a picture: the ray walks through the ball and at every
   step reads a DENSITY, accumulates its emission front-to-back and carries
   a transmittance so the near gas veils the far. The density is a galaxy:

   - A FLARED DISC. Density falls exponentially in the cylindrical radius
     and exponentially in height above the plane, with a scale height that
     grows outward, so the disc is razor-thin at the core and puffs toward
     the rim the way real discs do. A Gaussian BULGE sits on the centre.
   - LOG-SPIRAL ARMS modulate it: cos(N*phi - k*log(rho)), N arms wound by
     k, raised to a power for lanes. N multiplies phi so it stays an integer
     (continuity across the branch cut) and, with k, never moves between
     states — a gliding winding rakes the arms across the disc.
   - TURBULENCE breaks everything into filaments: the same feedback curl the
     family uses (q += cos(q.yzx * f + t) / f, four octaves, each reading the
     last one's result with its components rolled), with the clock entering
     as a shared phase so the gas boils coherently. Its sum is thresholded
     into clumps, and it also wobbles the arm phase so the arms fray.
   - DUST is the absorption. The transmittance is a vec3, and the extinction
     is weighted toward blue, so light seen through thick gas comes out
     reddened — the brown lanes of a galaxy photograph, for free, from the
     physics rather than a painted-on colour.
   - The colour is a ramp keyed to the cylindrical radius: three stops, the
     core, the inner arms and the outer arms, so the hue changes with
     distance from the centre; the bulge whitens toward the core colour.
   - STARS are not marched — a volumetric point smears along the ray into a
     streak. They are a hashed lattice evaluated at the ray's analytic hit
     with the galactic plane, denser in the arms, then dimmed by the
     transmittance the march left, so dust in front of them veils them.

   The galaxy plane is tilted toward the viewer and turns on its own
   integrated clock. Orb-family conventions throughout: the analytic
   silhouette from shdr-01, tanh tone map with a tunable knee, alpha from
   the peak channel for emitted light, a night fill so the ball reads as a
   solid sphere behind the gas. Uninitialised locals are explicit; loop
   bounds are defines.
---------------------------------------------------------------------------- */

const GALAXY_FRAG = `
#define STEPS 56
#define TURB_OCT 4

// Volume-reactive values, resolved once per fragment in main().
float galDensity;
float galCore;
float galFalloff;

/*
  The galactic density at a point in the galaxy's own frame: the disc lies
  in xz, the normal is y. Returns the density; writes the arm weight and the
  cylindrical radius for the colour.
*/
float galaxy(vec3 p, float t, out float arm, out float rho) {
  rho = length(p.xz);
  float h = p.y;
  // atan(0, 0) is undefined; the exact axis is all bulge anyway
  float phi = rho > 1e-4 ? atan(p.z, p.x) : 0.0;
  float lr = log(max(rho, 0.02));
  float armPhase = phi * uP_arms - uP_wind * lr;

  // feedback curl turbulence, shared phase
  vec3 q = p * uP_turbScale;
  float f = 1.0;
  for (int k = 0; k < TURB_OCT; k++) {
    q += cos(q.yzx * f + t) / f;
    f *= 1.9;
  }
  float n = (sin(q.x) + sin(q.y) + sin(q.z)) / 3.0 * 0.5 + 0.5;
  float clump = smoothstep(uP_threshold, 1.0, n);

  arm = 0.5 + 0.5 * cos(armPhase + (n - 0.5) * uP_ragged);
  arm = pow(arm, uP_armSharp);

  float scaleH = uP_thick * (0.12 + rho);
  float disc = exp(-rho * galFalloff) * exp(-abs(h) / scaleH);
  float bulge = exp(-dot(p, p) * uP_bulge);

  float dens = disc * (0.08 + 1.6 * arm) * (0.25 + 0.75 * clump) + bulge * galCore;
  return dens * galDensity;
}

/*
  One lattice of hashed stars. Each cell either carries a star or not, at a
  hashed position, with its own twinkle rate; the 3x3 neighbourhood is
  gathered so a star near a cell wall is not clipped.
*/
float starField(vec2 p, float density, float size, float twinkleT) {
  vec2 id = floor(p);
  vec2 f = fract(p);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 cid = id + o;
      float h = hash(cid);
      if (h > density) continue;
      vec2 sp = o + vec2(hash(cid + 1.3), hash(cid + 2.7));
      float dd = length(f - sp);
      float tw = 0.55 + 0.45 * sin(twinkleT * (1.5 + 5.0 * hash(cid + 5.1)) + h * 40.0);
      float sz = size * (0.5 + 1.2 * hash(cid + 8.9) * hash(cid + 8.9));
      acc += tw * exp(-dd * dd / (sz * sz)) * (0.4 + 0.6 * h / max(density, 0.001));
    }
  }
  return acc;
}

vec4 galaxyRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float t = uP_churn; // integrated clock: the turbulence boils
  float spin = uP_spin; // integrated clock: the disc turns

  // the galaxy frame: tip about x by the tilt, then turn about the disc's
  // own normal
  float ct = cos(uP_tilt);
  float st = sin(uP_tilt);
  float cs = cos(spin);
  float sn = sin(spin);

  vec3 acc = vec3(0.0);
  vec3 T = vec3(1.0);
  // extinction weighted to blue, so thick gas reddens what is behind it
  vec3 absorb = vec3(0.7, 1.0, 1.5) * uP_absorb;

  // march only the span the envelope can light
  float z = max(uP_camDist - uP_envRadius * 1.05, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.05;
  float dt = (zEnd - z) / float(STEPS);
  // a hashed start offset per pixel hides the step banding
  z += dt * hash(fragCoord * 0.37);

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * z;

    // envelope: nothing outside the ball contributes
    float env = 1.0 - smoothstep(uP_envRadius * 0.92, uP_envRadius, length(p));
    if (env > 0.001) {
      // into the galaxy frame
      vec3 g = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
      g = vec3(g.x * cs - g.z * sn, g.y, g.x * sn + g.z * cs);

      float arm = 0.0;
      float rho = 0.0;
      float d = galaxy(g / uP_envRadius, t, arm, rho) * env;

      // the colour ramp, keyed to radius from the core
      vec3 ramp = mix(uC_inner, uC_outer, smoothstep(0.12, uP_hueReach, rho));
      float coreW = exp(-rho * rho * uP_bulge * 0.6);
      vec3 emit = mix(ramp, uC_core, coreW) * (0.6 + 0.6 * arm);

      acc += T * d * emit * dt;
      T *= exp(-d * absorb * dt);
    }

    z += dt;
    if (T.g < 0.004 || z > zEnd) break;
  }

  return vec4(acc, 1.0 - T.g);
}

void main() {
  // The beat: one wave on the core-beat clock, shared by the core flare and
  // the disc's breathing. Both depths are amplitudes, so they stage cleanly.
  float wave = 0.5 + 0.5 * cos(uP_beat);
  galDensity = uP_density * (1.0 + 0.35 * uInput);
  galCore = uP_core * (1.0 + 0.7 * uOutput) * (1.0 + uP_pulse * wave);
  // breathing: the disc's falloff relaxes on the wave, so the whole disc
  // swells outward and draws back — a smooth exponential, safe to sweep
  galFalloff = uP_falloff / (1.0 + uP_breathe * wave);

  vec4 acc = galaxyRender(gl_FragCoord.xy);

  /*
    Stars, at the ray's exact hit with the galactic plane. The plane is the
    tilted xz-plane through the origin; its world normal is the tilted y.
    The lattice lives in the disc's own turning frame, so the stars turn
    with the gas, and the march's transmittance dims them through the dust.
  */
  {
    vec3 ro = vec3(0.0, 0.0, uP_camDist);
    vec3 rd = normalize(vec3(orbUV(), -uP_focal));
    float ct = cos(uP_tilt);
    float st = sin(uP_tilt);
    vec3 N = vec3(0.0, ct, st);
    float denom = dot(N, rd);
    if (abs(denom) > 1e-4) {
      float th = -dot(N, ro) / denom;
      vec3 q = ro + rd * th;
      if (th > 0.0 && dot(q, q) < uP_envRadius * uP_envRadius * 0.9) {
        vec3 g = vec3(q.x, q.y * ct - q.z * st, q.y * st + q.z * ct) / uP_envRadius;
        float cs = cos(uP_spin);
        float sn = sin(uP_spin);
        vec2 gp = vec2(g.x * cs - g.z * sn, g.x * sn + g.z * cs);
        float rho = length(gp);
        float phi = rho > 1e-4 ? atan(gp.y, gp.x) : 0.0;
        float armW = 0.5 + 0.5 * cos(phi * uP_arms - uP_wind * log(max(rho, 0.02)));
        float sf = starField(gp * uP_starScale, uP_starDensity * (0.3 + 0.7 * armW), 0.12, uP_twinkle);
        float veil = 1.0 - acc.a; // what the march let through
        acc.rgb += vec3(1.0, 0.97, 0.9) * sf * uP_stars * exp(-rho * 1.5) * (0.25 + 0.75 * veil);
      }
    }
  }

  // tanh tone map per channel, tunable knee
  vec3 col = tanh3(acc.rgb / max(uP_exposure, 0.01));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel — emitted light (see shdr-18)
  float peak = max(col.r, max(col.g, col.b));
  float a = clamp(peak * uP_alphaGain, 0.0, 1.0);

  // the night behind: a fill so the ball is a solid sphere, not a cut-out
  col += uC_deep * uP_fill;
  a = max(a, uP_fill);

  // Analytic silhouette — identical construction to shdr-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  vec3 mrd = normalize(vec3(orbUV(), -uP_focal));
  float closest = length(cross(vec3(0.0, 0.0, uP_camDist), mrd));
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

  // a fresnel rim on the glass, inside the mask
  float fres = smoothstep(uP_envRadius * 0.7, uP_envRadius, closest);
  col += uC_rim * uP_rim * fres * fres * mask;

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

export const shdr32Orb: OrbVariant = {
  key: "shdr-32",
  label: "SHDR-32",
  note: "a galaxy marched as gas and dust inside the ball",
  frag: GALAXY_FRAG,
  params: [
    { key: "spin", label: "Disc turn", min: 0, max: 3, step: 0.01, default: 0.06, integrate: true },
    { key: "churn", label: "Gas churn", min: 0, max: 5, step: 0.02, default: 0.25, integrate: true },
    { key: "beat", label: "Core beat", min: 0, max: 12, step: 0.05, default: 0.8, integrate: true },
    { key: "twinkle", label: "Twinkle rate", min: 0, max: 12, step: 0.05, default: 1.2, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.05, default: 2.25 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.6 },
    { key: "tilt", label: "Tilt (0 edge-on)", min: 0, max: 1.5, step: 0.01, default: 0.85 },
    { key: "arms", label: "Arm count", min: 1, max: 6, step: 1, default: 2 },
    { key: "wind", label: "Arm winding", min: 0, max: 8, step: 0.05, default: 3.4 },
    { key: "ragged", label: "Arm fray", min: 0, max: 12, step: 0.05, default: 3 },
    { key: "armSharp", label: "Arm sharpness", min: 0.3, max: 8, step: 0.05, default: 2.2 },
    { key: "falloff", label: "Disc falloff", min: 0.3, max: 12, step: 0.05, default: 1.7 },
    { key: "thick", label: "Disc thickness", min: 0.01, max: 1, step: 0.005, default: 0.035 },
    { key: "bulge", label: "Core tightness", min: 2, max: 200, step: 1, default: 40 },
    { key: "core", label: "Core density", min: 0, max: 20, step: 0.1, default: 5 },
    { key: "turbScale", label: "Turbulence scale", min: 0.5, max: 30, step: 0.1, default: 9 },
    { key: "threshold", label: "Clumping", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "density", label: "Gas density", min: 0.1, max: 40, step: 0.1, default: 14 },
    { key: "absorb", label: "Dust absorption", min: 0, max: 20, step: 0.1, default: 3.5 },
    { key: "stars", label: "Stars", min: 0, max: 10, step: 0.05, default: 1.2 },
    { key: "starDensity", label: "Star density", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "starScale", label: "Star scale", min: 5, max: 200, step: 1, default: 48 },
    { key: "hueReach", label: "Hue reach", min: 0.15, max: 1.5, step: 0.01, default: 0.6 },
    { key: "pulse", label: "Beat depth", min: 0, max: 3, step: 0.01, default: 0.2 },
    { key: "breathe", label: "Disc breathing", min: 0, max: 2, step: 0.01, default: 0 },
    { key: "exposure", label: "Exposure", min: 0.05, max: 50, step: 0.05, default: 1.1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 6, step: 0.05, default: 1.15 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.35 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "fill", label: "Night fill", min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: "rim", label: "Rim light", min: 0, max: 3, step: 0.015, default: 0.35 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  /*
   * Six stops: the overall tint, the core the bulge whitens toward, the
   * inner and outer arm colours the ramp runs between, the night the ball
   * is filled with, and the glass rim.
   */
  colors: [
    { key: "tint", label: "Tint", default: "#ffffff" },
    { key: "core", label: "Core", default: "#fff3d6" },
    { key: "inner", label: "Inner arms", default: "#7fb4ff" },
    { key: "outer", label: "Outer arms", default: "#c46bff" },
    { key: "deep", label: "Night", default: "#04050f" },
    { key: "rim", label: "Rim", default: "#8fb0ff" }
  ],
  /*
    Staged on the TILT first — each state is a different view of the disc —
    and then on the clocks and amplitudes. The tilt glides, and a tipping
    disc is the biggest, most legible motion this orb has, so the state
    change itself is the tell. The arm count and winding, the turbulence
    scale and the star scale all multiply a coordinate and are pinned.
  */
  statePresets: {
    /*
      at rest: the spiral seen about halfway between edge-on and face-on.
      A slow turn, the gas barely boiling, a lazy shallow beat on the core.
    */
    idle: {
      tilt: 0.85,
      spin: 0.06,
      churn: 0.25,
      beat: 0.8,
      twinkle: 1.2,
      pulse: 0.2,
      breathe: 0,
      ragged: 3,
      armSharp: 2.2,
      thick: 0.035,
      threshold: 0.35,
      density: 14,
      core: 5,
      absorb: 3.5,
      stars: 1.2,
      exposure: 1.1,
      contrast: 1.15,
      saturation: 1.35
    },
    /*
      searching: the disc swings FACE-ON and becomes a whirlpool. The arms
      fray to nothing and the gas boils at six times rest on a thicker
      disc, a sparser clumping and a heavier absorption, so what is left is
      filaments and shadow spinning at seven times rest — face-on, the turn
      is fully visible — with the core held down. Cold.
    */
    thinking: {
      tilt: 1.45,
      spin: 0.45,
      churn: 1.6,
      beat: 2.4,
      twinkle: 4.5,
      pulse: 0.25,
      breathe: 0,
      ragged: 8,
      armSharp: 1,
      thick: 0.07,
      threshold: 0.5,
      density: 20,
      core: 3,
      absorb: 6,
      stars: 1.8,
      exposure: 1.05,
      contrast: 1.3,
      saturation: 1.2
    },
    /*
      answering: the disc swings FACE-ON and lights up — the full spiral,
      arms sharp and wide, the core flaring on a hard beat (depth five
      times rest on a clock six times as fast) and the whole disc swelling
      outward and drawing back on the same wave. The gas is dense but the
      dust is cleared, so all of it glows, at a lower knee. Hot.
    */
    speaking: {
      tilt: 1.3,
      spin: 0.2,
      churn: 0.6,
      beat: 4.8,
      twinkle: 2.4,
      pulse: 1,
      breathe: 0.45,
      ragged: 2,
      armSharp: 1.8,
      thick: 0.04,
      threshold: 0.25,
      density: 18,
      core: 12,
      absorb: 1.6,
      stars: 2,
      exposure: 0.75,
      contrast: 1.05,
      saturation: 1.6
    }
  },
  // blue into violet at rest, ice into cyan while searching, gold into rose
  // while answering
  stateColors: {
    idle: { tint: "#ffffff", core: "#fff3d6", inner: "#7fb4ff", outer: "#c46bff", deep: "#04050f", rim: "#8fb0ff" },
    thinking: { tint: "#ffffff", core: "#e6f0ff", inner: "#6fb0ff", outer: "#4fe3ff", deep: "#030614", rim: "#7fa8ff" },
    speaking: { tint: "#ffffff", core: "#fff4c8", inner: "#ffa63c", outer: "#ff3f8e", deep: "#0a0508", rim: "#ffb98a" }
  }
};

export type Shdr32Props = Omit<ShaderOrbProps, "variant">;

export function Shdr32({ size = 280, ...rest }: Shdr32Props) {
  return <ShaderOrb variant={shdr32Orb} size={size} {...rest} />;
}

export default Shdr32;
