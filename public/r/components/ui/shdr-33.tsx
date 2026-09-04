/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-33 — a thermal image, risograph-printed, wrapped on the ball.

   The reference is a heat map put through a cheap colour print: blocky
   sources glowing white-hot inside nested rectangular contours that cool
   from yellow through orange and violet to black, all of it rendered as a
   coarse square-dot halftone whose three ink screens do not quite line up,
   on grainy paper. Three stages reproduce it:

   - THE HEAT. A noise field, not placed sources: three octaves of value
     noise, domain-warped by a coarser noise so the pools bend and pinch,
     with a threshold window cut out of it — everything below the window
     is the cold field, everything above is white-hot, and the window in
     between is where the ramp lives. Value noise at low frequency sits on
     a lattice, which is what gives the pools their blocky, rectangular
     lean without anything being drawn as a rectangle, and the warp is
     what keeps them from looking like a grid. The field DRIFTS under the
     sample point, and the warp drifts at a different rate, so the pools
     travel, merge and split rather than sit. The field is then QUANTIZED
     into bands and blended back with the smooth field, which draws the
     nested contours: a thermal camera's palette is a lookup with visible
     steps, and the steps are the contours.
   - THE PALETTE. Five stops climb the heat — near-black, violet-blue,
     red-orange, yellow, white — the classic false-colour thermal ramp.
   - THE PRINT. The palette colour is separated into cyan, magenta and
     yellow ink coverage (1 - channel), and each ink is laid down as a
     screen of round dots whose size carries the coverage, mixed in lightly
     over the smooth palette so it reads as texture rather than a grid. The three screens sit at
     slightly different angles and offsets, so where two overlap you get
     the violet (cyan over magenta) and the orange (magenta over yellow) of
     the reference, and the misregistration gives the moire that makes it
     look printed rather than rendered. Paper white shows through where the
     dots are small, which is why the hot cores come out pale.
   - GRAIN. Two taps of animated noise as in shdr-17: one folded into the
     heat before quantizing, so the band edges dither; one over the final
     print, as paper.

   The plane is sampled through a stereographic wrap of a rotating dome, so
   the print compresses toward the limb and rolls around the ball rather
   than sitting flat on a disc. Surface-lit and mask-bounded, so alpha IS
   coverage — premultiplied output, as in shdr-14.
---------------------------------------------------------------------------- */

const HEAT_FRAG = `
const float PI = 3.14159265359;

// Volume-reactive values, resolved once per fragment in main().
float heatGainNow;
float heatJitterNow;

float grainNoise(vec2 gpix, float frame, float seed) {
  return hash(gpix + vec2(frame * 13.71 + seed, frame * 7.37 - seed));
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/*
  One ink screen. Square dots on a grid at angle a, offset o (the
  misregistration), sized by the coverage: coverage 0 is paper, coverage 1
  is a solid. Returns how much of this pixel the ink covers.

  The grid is laid in SCREEN space, not on the wrapped plane: a print is
  flat, and it is the picture that curves round the ball. A screen on the
  wrapped coordinates changes pitch toward the limb and beats against the
  other two into moire rings.
*/
float screen(vec2 uv, float a, vec2 o, float coverage, float soft) {
  vec2 cell = rot2(a) * uv * uP_dots + o;
  vec2 f = fract(cell) - 0.5;
  float d = length(f); // a round dot: reads as tone, not as a grid
  // dot half-size from coverage; sqrt so mid-tones read as mid-tones the
  // way a real screen's area does
  float size = 0.5 * sqrt(clamp(coverage * uP_dotGain, 0.0, 1.0));
  return 1.0 - smoothstep(size - soft, size + soft, d);
}

void main() {
  heatGainNow = uP_gain * (1.0 + 0.6 * uOutput);
  heatJitterNow = uP_jitter * (1.0 + 1.5 * uInput);

  vec2 uv = orbUV();
  float rd = length(uv);
  float R = uP_radius;
  float mask = smoothstep(0.012, -0.012, rd - R);

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

  float t = uP_speed; // integrated clock: the sources drift

  // stereographic wrap of the plane onto the ball
  vec2 st = sp.xy / (1.3 + sp.z) * uP_scale;

  /*
    The heat: a drifting, domain-warped noise field with a threshold window
    cut out of it. Two drifts at different rates so the pools travel and
    change shape rather than slide as one sheet; the input jitter is a fast
    wobble on top.
  */
  vec2 p = st * uP_freq + vec2(t * 0.11, -t * 0.07);
  vec2 wp = st * uP_freq * 0.55 + vec2(-t * 0.05, t * 0.08);
  vec2 warp = vec2(noise(wp + 3.1), noise(wp + 9.4)) - 0.5;
  p += warp * uP_warp;
  p += vec2(sin(t * 3.7), cos(t * 4.3)) * heatJitterNow;
  float field = noise(p) * 0.62 + noise(p * 2.1 + 5.3) * 0.26 + noise(p * 4.2 + 1.7) * 0.12;
  float heat = clamp((field - uP_lo) * heatGainNow / max(uP_hi - uP_lo, 0.01), 0.0, 1.0);

  // grain tap 1: dither the field before it is banded, so the contour
  // edges break up into speckle instead of clean steps
  vec2 gpix = floor(gl_FragCoord.xy / max(uP_grainSize, 1.0));
  float frame = floor(uTime * 48.0);
  heat += (grainNoise(gpix, frame, 3.1) - 0.5) * uP_dither;

  // the contours: quantize into bands, blend back with the smooth field
  float banded = floor(heat * uP_bands + 0.5) / uP_bands;
  heat = clamp(mix(heat, banded, uP_banding), 0.0, 1.0);
  heat = pow(heat, uP_contrast);

  // the thermal ramp
  vec3 base = mix(uC_cold, uC_cool, smoothstep(0.0, 0.3, heat));
  base = mix(base, uC_warm, smoothstep(0.3, 0.55, heat));
  base = mix(base, uC_hot, smoothstep(0.55, 0.78, heat));
  base = mix(base, uC_core, smoothstep(0.78, 0.97, heat));

  /*
    The print. Separate the palette into CMY coverage and lay each ink down
    as its own screen; the paper shows through the gaps. The angles are the
    classic offsets, scaled by the misregistration, plus a per-ink shift.
  */
  float soft = uP_dotSoft;
  float mis = uP_misregister;
  float cC = screen(uv, 0.035 * mis, vec2(0.22, 0.12) * mis, 1.0 - base.r, soft);
  float cM = screen(uv, -0.03 * mis, vec2(-0.14, 0.2) * mis, 1.0 - base.g, soft);
  float cY = screen(uv, 0.0, vec2(0.0), 1.0 - base.b, soft);

  vec3 print = uC_paper;
  print *= mix(vec3(1.0), vec3(0.05, 0.62, 0.92), cC * uP_ink);
  print *= mix(vec3(1.0), vec3(0.92, 0.08, 0.48), cM * uP_ink);
  print *= mix(vec3(1.0), vec3(0.98, 0.86, 0.02), cY * uP_ink);

  // the unprinted palette is mixed back a little so the blacks stay black
  // and the screens never wash the whole ball to paper
  vec3 col = mix(base, print, uP_printMix);

  // grain tap 2: paper
  col *= 1.0 + (grainNoise(gpix, frame, 27.9) - 0.5) * uP_grain;

  // dome shading keeps the ball a ball under the print
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 1.0 - uP_light * (1.0 - lambert);
  float fres = pow(1.0 - z, 2.5);
  col += uC_paper * uP_rim * fres * 0.5;

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

// the rest look: warm pools drifting slowly, contours soft
const HEAT_REST = {
  speed: 0.5,
  spin: 0.05,
  gain: 1,
  warp: 0.6,
  lo: 0.42,
  hi: 0.74,
  jitter: 0.015,
  banding: 0.85,
  grain: 0.35,
  contrast: 1
};

const HEAT_PALETTE = {
  cold: "#0b0a1e",
  cool: "#3b2a9a",
  warm: "#f05a28",
  hot: "#f6b53a",
  core: "#fff1e6"
};

export const shdr33Orb: OrbVariant = {
  key: "shdr-33",
  label: "SHDR-33",
  note: "a thermal image, risograph-printed on the ball",
  frag: HEAT_FRAG,
  params: [
    { key: "speed", label: "Drift", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.05, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Zoom", min: 0.3, max: 8, step: 0.05, default: 3 },
    { key: "freq", label: "Pool scale", min: 0.2, max: 6, step: 0.05, default: 1.4 },
    { key: "warp", label: "Warp", min: 0, max: 3, step: 0.02, default: 0.6 },
    { key: "lo", label: "Cold threshold", min: 0, max: 1, step: 0.005, default: 0.42 },
    { key: "hi", label: "Hot threshold", min: 0, max: 1, step: 0.005, default: 0.74 },
    { key: "gain", label: "Heat gain", min: 0.1, max: 6, step: 0.02, default: 1 },
    { key: "jitter", label: "Heat jitter", min: 0, max: 0.5, step: 0.005, default: 0.015 },
    { key: "bands", label: "Contour bands", min: 2, max: 24, step: 1, default: 7 },
    { key: "banding", label: "Contour strength", min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: "contrast", label: "Contrast", min: 0.3, max: 3, step: 0.02, default: 1 },
    { key: "dither", label: "Dither", min: 0, max: 0.6, step: 0.005, default: 0.05 },
    { key: "dots", label: "Screen pitch", min: 4, max: 120, step: 1, default: 46 },
    { key: "dotGain", label: "Dot gain", min: 0.2, max: 2, step: 0.01, default: 1 },
    { key: "dotSoft", label: "Dot softness", min: 0.01, max: 0.3, step: 0.005, default: 0.12 },
    { key: "misregister", label: "Misregistration", min: 0, max: 3, step: 0.02, default: 0.5 },
    { key: "ink", label: "Ink density", min: 0, max: 1, step: 0.01, default: 0.92 },
    { key: "printMix", label: "Print mix", min: 0, max: 1, step: 0.01, default: 0.28 },
    { key: "grain", label: "Paper grain", min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: "grainSize", label: "Grain size", min: 1, max: 8, step: 1, default: 2 },
    { key: "light", label: "Key light", min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: "rim", label: "Rim light", min: 0, max: 3, step: 0.015, default: 0.25 }
  ],
  /*
   * Six stops: five up the thermal ramp, and the paper the screens are
   * printed on.
   */
  colors: [
    { key: "cold", label: "Cold", default: "#0b0a1e" },
    { key: "cool", label: "Cool", default: "#3b2a9a" },
    { key: "warm", label: "Warm", default: "#f05a28" },
    { key: "hot", label: "Hot", default: "#f6b53a" },
    { key: "core", label: "Core", default: "#fff1e6" },
    { key: "paper", label: "Paper", default: "#f4ecdf" }
  ],
  /*
    All three states share the rest palette; idle is the rest preset.
    Speaking is the rest look set RACING in place — the drift at eighteen
    times rest on a roll forty times as fast, the pools slightly finer and
    the warp more than doubled, with the window dropped so more of it
    reads as hot — without the rescale thinking makes. Thinking is the
    rest look zoomed out and set racing: the plane at four times the
    zoom with the pools three times finer and the warp tripled, the drift
    at twenty times rest on a roll ten times as fast, the window dropped
    so more of it reads as hot, on fewer, softer bands and a finer screen.
    Note the zoom, the pool scale, the band count and the screen pitch all
    multiply a coordinate, so the transition into and out of thinking
    glides through a rescale — chosen deliberately.
  */
  statePresets: {
    idle: HEAT_REST,
    thinking: {
      ...HEAT_REST,
      speed: 10,
      spin: 0.51,
      scale: 4.6,
      freq: 3.1,
      warp: 1.82,
      lo: 0.3,
      hi: 0.66,
      jitter: 0,
      bands: 6,
      banding: 0.75,
      dots: 42
    },
    speaking: {
      ...HEAT_REST,
      speed: 8.8,
      spin: 2.01,
      freq: 1.3,
      warp: 1.42,
      lo: 0.345,
      hi: 0.72,
      jitter: 0
    }
  },
  stateColors: {
    idle: HEAT_PALETTE,
    thinking: HEAT_PALETTE,
    speaking: HEAT_PALETTE
  }
};

export type Shdr33Props = Omit<ShaderOrbProps, "variant">;

export function Shdr33({ size = 280, ...rest }: Shdr33Props) {
  return <ShaderOrb variant={shdr33Orb} size={size} {...rest} />;
}

export default Shdr33;
