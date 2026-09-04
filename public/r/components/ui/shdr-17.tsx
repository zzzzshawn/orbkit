/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-17 — a grainy, hyper-saturated storm raging on the ball.

   The weather is the classic two-level DOMAIN WARP: the storm field is fbm
   sampled where a previous fbm said to look, so the clouds tear and curl
   instead of just scrolling. It lives on a stereographic wrap of a rotating
   dome, with JOVIAN BAND SHEAR on top — latitude rings flowing past each
   other at different speeds, banded like a gas giant, because sp.y is
   invariant under the dome's Y-roll the bands stay horizontal while the
   weather rolls beneath them.

   Colour is where it goes loud: a four-stop gradient (deep → low → mid → hot)
   climbs the storm field, and an iridescent cosine rainbow keyed to the same
   field is multiplied over it, so every pressure level of the storm carries
   its own hue and the whole ball cycles through many colours at once.

   The GRAIN is the signature. Two taps of animated white noise, refreshed on
   the ambient clock at about 24 fps — cinema rate: fast enough to read as
   film flicker rather than stutter, and deliberately NOT the integrated
   clock, because the flicker rate should not follow the agent state:

     FIELD GRAIN  folded into the storm field BEFORE the gradient, so the
                  colour stops dither into speckle instead of smooth bands —
                  the risograph read.
     FILM GRAIN   multiplied over the final colour, plain photographic noise.

   Lightning: a hashed gate per flash interval with an exponential decay —
   most intervals stay dark, some flash — and the gate opens wide with agent
   output, so a speaking orb strobes its high-pressure cells.

   Surface-lit and mask-bounded, so alpha IS coverage — premultiplied output,
   as in shdr-14.
---------------------------------------------------------------------------- */

const TEMPEST_FRAG = `
const float PI = 3.14159265359;

// Animated white noise, one tap per grain cell per grain frame. The seed
// decorrelates the two taps so field grain and film grain never line up.
float grainNoise(vec2 gpix, float frame, float seed) {
  return hash(gpix + vec2(frame * 13.71 + seed, frame * 7.37 - seed));
}

void main() {
  // Volume coupling: user input churns the warp harder, agent output
  // brightens the field — the lightning gate opens separately below.
  float warpNow = uP_warp * (1.0 + 0.55 * uInput);
  float gainNow = uP_gain * (0.85 + 0.45 * uOutput);

  vec2 uv = orbUV();
  float rd = length(uv);
  float R = uP_radius;
  float mask = smoothstep(0.012, -0.012, rd - R);

  // The storm below costs five fbm evaluations per fragment — skip all of it
  // outside the silhouette instead of computing weather for transparent sky.
  if (mask <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 pl = uv / R;
  float r2 = dot(pl, pl);
  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = vec3(pl, z);

  // roll the dome about Y on its own integrated clock
  float cr = cos(uP_spin);
  float sr = sin(uP_spin);
  vec3 sp = vec3(n.x * cr - n.z * sr, n.y, n.x * sr + n.z * cr);

  float t = uP_speed; // integrated clock

  // stereographic wrap: the weather travels around the ball and compresses
  // toward the limb instead of sliding across a flat disc
  vec2 st = sp.xy / (1.3 + sp.z) * uP_scale;

  /*
    Jovian band flow: a uniform stream plus a BOUNDED traveling wave of
    shear, so latitude rings appear to slip past each other. The obvious
    construction — t * sin(latitude) — accumulates the differential forever
    and rakes the field into hairline streaks within seconds of the random
    mount phase; the wave form keeps the shear amplitude fixed while its
    phase travels. sp.y is untouched by the Y-roll, so the bands hold
    horizontal while the dome turns underneath them.
  */
  st.x -= t * 0.3;
  st.x += uP_shear * sin(sp.y * uP_bands - t * 0.45);

  // two-level domain warp, the storm-cloud construction: q says where to
  // look, w says where q said to look, the field reads there
  vec2 q = vec2(
    fbm(st + vec2(0.0, t * 0.35)),
    fbm(st + vec2(5.2, 1.3) - vec2(t * 0.28, 0.0))
  );
  vec2 w = vec2(
    fbm(st + warpNow * q + vec2(1.7, 9.2) + vec2(t * 0.12, 0.0)),
    fbm(st + warpNow * q + vec2(8.3, 2.8) - vec2(0.0, t * 0.1))
  );
  float f = fbm(st + uP_churn * w);

  /*
    Grain tap 1: speckle folded into the FIELD itself, before the gradient,
    so the colour stops below dither into grain instead of smooth bands.
    Refreshed on the ambient clock — the flicker rate stays constant across
    states on purpose (see the header note).
  */
  vec2 gpix = floor(gl_FragCoord.xy / max(uP_grainSize, 1.0));
  float frame = floor(uTime * 48.0);
  float g1 = grainNoise(gpix, frame, 3.1);
  f += (g1 - 0.5) * uP_grain;

  f = pow(clamp(f * gainNow, 0.0, 1.0), uP_contrast);

  // four-stop palette climbing the storm field
  vec3 col = mix(uC_deep, uC_low, smoothstep(0.05, 0.35, f));
  col = mix(col, uC_mid, smoothstep(0.35, 0.62, f));
  col = mix(col, uC_hot, smoothstep(0.62, 0.88, f));

  // iridescent shimmer: a cosine rainbow keyed to the field AND to the warp
  // vector — q varies at storm-cell scale, so the rainbow lands as coherent
  // coloured weather cells instead of hue noise that optically averages to
  // grey — multiplied in so it bends hues without erasing the palette
  vec3 shimmer = 0.5 + 0.5 * cos(2.0 * PI * (f * 0.9 + q.x * 1.1 + t * 0.06 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * (0.35 + 1.9 * shimmer), uP_rainbow);

  /*
    Lightning: one hashed gate per flash interval with an exponential decay,
    so most intervals stay dark and some strike. Agent output opens the gate
    — an idle orb flickers occasionally, a speaking one strobes. The strike
    lands hardest on the high-pressure cells of the field.
  */
  float ft = t * uP_flashRate;
  float gate = step(1.0 - (0.1 + 0.5 * uOutput), hash(vec2(floor(ft), 7.7)));
  float flashEnv = gate * exp(-fract(ft) * 6.0);
  // squared so the strike stays inside the storm cells — a linear weight
  // tints the whole ball and reads as the canvas strobing, not as weather
  float high = smoothstep(0.55, 0.95, f);
  col += uC_flash * (flashEnv * uP_flash) * (0.06 + 0.94 * high * high);

  // dome shading keeps the ball a ball under the weather
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 0.35 + uP_light * lambert;
  float fres = pow(1.0 - z, 2.5);
  col += uC_flash * uP_rim * fres * (0.4 + 0.35 * flashEnv);

  // grain tap 2: plain film grain over the final colour
  float g2 = grainNoise(gpix, frame, 27.9);
  col *= 1.0 + (g2 - 0.5) * uP_filmGrain;

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr17Orb: OrbVariant = {
  key: "shdr-17",
  label: "SHDR-17",
  note: "a grainy many-coloured storm with band shear and lightning",
  frag: TEMPEST_FRAG,
  params: [
    { key: "speed", label: "Storm speed", min: 0.015, max: 10, step: 0.05, default: 0.9, integrate: true },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.12, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Weather scale", min: 0.3, max: 12, step: 0.1, default: 2.4 },
    { key: "bands", label: "Band count", min: 0, max: 20, step: 0.1, default: 6 },
    { key: "shear", label: "Band shear", min: 0, max: 5, step: 0.03, default: 1.1 },
    { key: "warp", label: "Warp", min: 0, max: 8, step: 0.05, default: 2.2 },
    { key: "churn", label: "Churn", min: 0, max: 8, step: 0.05, default: 1.4 },
    { key: "gain", label: "Brightness", min: 0.05, max: 5, step: 0.05, default: 1.15 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.35 },
    { key: "grain", label: "Field grain", min: 0, max: 2, step: 0.01, default: 0.4 },
    { key: "filmGrain", label: "Film grain", min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: "grainSize", label: "Grain size", min: 1, max: 8, step: 1, default: 2 },
    { key: "rainbow", label: "Iridescence", min: 0, max: 2, step: 0.01, default: 0.65 },
    { key: "flashRate", label: "Flash rate", min: 0, max: 10, step: 0.05, default: 1.6 },
    { key: "flash", label: "Flash power", min: 0, max: 5, step: 0.03, default: 1.2 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.85 },
    { key: "rim", label: "Rim light", min: 0, max: 3, step: 0.015, default: 0.5 }
  ],
  /*
   * Five stops: four climbing the storm field plus the lightning colour.
   * The iridescence param multiplies a rainbow over all of them, so the
   * palette here sets the mood and the shimmer supplies the extra hues.
   */
  colors: [
    { key: "deep", label: "Deep", default: "#2a0f4e" },
    { key: "low", label: "Low pressure", default: "#0fd0c3" },
    { key: "mid", label: "Mid pressure", default: "#ff5e9d" },
    { key: "hot", label: "High pressure", default: "#ffd166" },
    { key: "flash", label: "Lightning", default: "#eaf4ff" }
  ],
  /*
    Staged in the family language. Grain and grain size never move between
    states — grain is a quantizer, and a gliding quantizer pops instead of
    fading (same rule as the dither orb's cell grid).
  */
  statePresets: {
    // brooding: bands drifting, the odd distant flicker
    idle: {
      speed: 0.9,
      shear: 1.1,
      warp: 2.2,
      churn: 1.4,
      flash: 0.7,
      gain: 1.15,
      contrast: 1.35
    },
    // computing: the storm churns IN PLACE — clock at twice idle, deeper
    // warp, bands almost stalled, lightning held back
    thinking: {
      speed: 2.2,
      shear: 0.6,
      warp: 3.4,
      churn: 2.1,
      flash: 0.6,
      gain: 1.05,
      contrast: 1.5
    },
    // answering: bands race, the field blooms bright, lightning strobes
    speaking: {
      speed: 1.6,
      shear: 2.2,
      warp: 2.6,
      churn: 1.6,
      flash: 2.6,
      gain: 1.45,
      contrast: 1.2
    }
  },
  // teal-magenta-amber carnival at rest, cold indigo-cyan while computing,
  // hot magma while answering
  stateColors: {
    idle: {
      deep: "#2a0f4e",
      low: "#0fd0c3",
      mid: "#ff5e9d",
      hot: "#ffd166",
      flash: "#eaf4ff"
    },
    thinking: {
      deep: "#0d1440",
      low: "#4c4cf0",
      mid: "#9d4ce0",
      hot: "#4ce0ff",
      flash: "#d5e5ff"
    },
    speaking: {
      deep: "#3a0f1e",
      low: "#ff6a3d",
      mid: "#ff2e88",
      hot: "#ffd23f",
      flash: "#fff3e0"
    }
  }
};

export type Shdr17Props = Omit<ShaderOrbProps, "variant">;

export function Shdr17({ size = 280, ...rest }: Shdr17Props) {
  return <ShaderOrb variant={shdr17Orb} size={size} {...rest} />;
}

export default Shdr17;
