/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-30 — a meadow folding into itself, falling forever toward a blue
   vanishing point.

   Not a port of a golfed listing like its neighbours: built to a reference
   picture — a flower meadow whose sky peels up and inward through nested
   rectangular frames, each one the same landscape a size smaller, until
   the recursion closes on a scrap of blue sky and cloud.

   How it is put together:

   - THE RECURSION IS A LOGARITHM. Take the CHEBYSHEV norm of the point,
     max(|x|,|y|), and the level sets are SQUARES rather than circles —
     which is the whole difference between this and a spiral tunnel.
     log of that norm, base K, is a continuous frame index; its fractional
     part says where inside one frame the fragment sits, and raising K back
     to that fraction gives the radius the fragment maps to in the BASE
     frame. Every fragment therefore reads one small picture, and the
     picture contains itself.
   - THE CLOCK GOES INTO THE LOG, not into a scale. Adding to the frame
     index slides the whole mapping, so the tunnel flies inward forever
     with no seam to hide and no accumulating error — an integrated clock
     makes the rate tunable without jumping the fall.
   - THE PICTURE is painted in the base frame's own coordinates: sky and
     cloud above the horizon line, canopy and meadow below it, and flowers
     hashed into the low ground. Because every frame reads the SAME base
     picture, the clouds and flowers repeat at every scale, which is what
     the reference does and what makes the recursion legible.
   - THE SMEAR ON THE WALLS is the reference's most distinctive texture,
     and it comes for free from the geometry: the land noise is sampled on
     (distance around the frame, frame index), with a low frequency on the
     second axis, so its features run long in the direction the recursion
     stretches them.
   - AERIAL PERSPECTIVE IS LOAD-BEARING. Depth has to come from the SCREEN
     radius, not from the position inside a frame — every frame has the
     same fractional part, so that number carries no depth at all. Fading
     toward the sky colour as the screen radius goes to zero is what makes
     the middle read as far away rather than as small, and it doubles as
     the guard on the log at the exact centre.

   Orb decisions, each one a rule in the README:

   - THE ORB IS THE OBJECT: the tunnel is sampled through a stereographic
     projection of the dome, so the frames compress toward the limb the
     way a texture on a real sphere does, and the vanishing point sits at
     the ball's centre. With the fresnel sheen over it the ball reads as
     glass with a world falling away inside it, not as a disc cut out of a
     picture.
   - The frame index runs continuously across frames while the picture
     coordinate resets at every boundary. That reset is not a defect to
     smooth away: it IS the edge of the picture, and it draws the nested
     frame borders the reference is made of.
   - Distance around the frame is a real arc length around the square, not
     atan and not a swap between the two axes at the corners. Both of those
     put a seam on the wall; the arc length puts its one wrap at a corner,
     where a frame corner already is.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * AA is a `#define`: ES 1.0 requires constant loop bounds. The recursion
 * crowds an unbounded number of frames into the last few pixels before the
 * limb, so supersampling here is not polish — it is the only thing standing
 * between the rim and a band of noise.
 */
const DROSTE_FRAG = `
#define AA 2

// Volume-reactive values, resolved once per fragment in main().
float drosteHaze;
float drosteCloud;
float drosteBloom;

/*
  Arc length around the unit square, in [0,8), counter-clockwise from the
  bottom-right corner — two units per face. Continuous everywhere except
  its single wrap, which lands on a corner.
*/
float squareArc(vec2 q) {
  if (abs(q.x) >= abs(q.y)) {
    if (q.x > 0.0) return q.y + 1.0;
    return 5.0 - q.y;
  }
  if (q.y > 0.0) return 3.0 - q.x;
  return 7.0 + q.x;
}

/*
  Flower colour by hash: mostly white daisies, then the planted warm, then
  the cornflower blues — which reuse the SKY colour rather than adding a
  sixth stop, because that is what keeps them reading as part of the same
  picture instead of as confetti thrown over it.
*/
vec3 drosteFlower(float h) {
  vec3 c = uC_cloud;
  c = mix(c, uC_bloom, step(0.52, h));
  c = mix(c, uC_sky, step(0.86, h));
  return c;
}

vec3 drosteRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));

  float fall = uP_fall;   // integrated clock: the flight inward
  float drift = uP_drift; // integrated clock: weather

  /*
    The frame tilt is a STATIC angle, not an integrated clock like the roll
    every other orb here gets. Those clocks seed at a random phase per
    mount, which is exactly right for a field with no preferred direction
    and exactly wrong for a picture: it lands the sky down one side of the
    ball and the meadow up the other. This one has an up.
  */
  float sw = uP_tilt;

  // stereographic wrap — the tunnel is inside the ball, and compresses
  // toward the limb the way a texture on a sphere does
  vec2 p = pl / (z + 1.0 + uP_bulge) * uP_scale;
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;

  /*
    The Chebyshev norm makes the level sets SQUARES. The floor on it is
    what keeps the logarithm finite at the dead centre; the haze below
    covers that last pixel anyway.
  */
  float m = max(max(abs(p.x), abs(p.y)), 0.002);

  float K = max(uP_ratio, 1.05);
  float L = log2(m) / log2(K) + fall;

  vec2 q = p / m;                 // direction, on the unit square boundary
  float sm = pow(K, fract(L));    // this fragment's radius in base-frame units
  vec2 P = q * sm;                // where it lands in the base picture

  float Yn = P.y / K;             // picture height, about -1 at the bottom edge
  float arc = squareArc(q);       // distance around the frame

  // ---- sky -----------------------------------------------------------
  vec3 col = mix(uC_sky * 0.72, uC_sky, clamp(Yn * 1.3, 0.0, 1.0));

  /*
    Cloud and land are both read in BASE-PICTURE coordinates, so every
    frame carries the same weather at its own scale — which is the whole
    point of a picture that contains itself.
  */
  float skyMask = smoothstep(uP_horizon - 0.3, uP_horizon + 0.2, Yn);
  float cl = fbm(P * uP_cloudScale + vec2(drift, drift * 0.3));
  cl = smoothstep(drosteCloud, drosteCloud + 0.16, cl);
  col = mix(col, uC_cloud, cl * (0.2 + 0.8 * skyMask));

  // ---- land ----------------------------------------------------------
  /*
    The smear. Sampled on (distance around the frame, frame index) with a
    low frequency on the second axis, so features run LONG in the
    direction the recursion stretches them — the streaked walls of the
    reference, straight out of the geometry.
  */
  float streak = fbm(vec2(arc * uP_streakFreq, L * uP_streakRad));

  vec3 land = mix(uC_canopy, uC_meadow, smoothstep(0.02, -0.62, Yn));
  land *= 0.42 + 1.25 * streak;

  // water: the low ground holds it where the streak field pools
  float water = smoothstep(0.42, 0.16, streak) * smoothstep(0.05, -0.3, Yn);
  land = mix(land, uC_water, water * uP_water);

  /*
    Flowers, hashed one to a cell on the same (around, index) grid, jittered
    inside it. Densest low in the picture and gone by the horizon.
  */
  vec2 fg = vec2(arc * uP_flowerScale, L * uP_flowerScale * 0.3);
  vec2 fc = floor(fg);
  vec2 ff = fract(fg) - 0.5;
  vec2 dcv = ff - (vec2(hash(fc + 3.7), hash(fc + 19.1)) - 0.5) * 0.6;
  float petal = smoothstep(uP_flowerSize, uP_flowerSize * 0.35, length(dcv));
  float present = step(1.0 - drosteBloom, hash(fc + 51.3));
  float meadow = smoothstep(0.13, -0.38, Yn);
  land = mix(land, drosteFlower(hash(fc + 7.9)), petal * present * meadow);

  float landMask = 1.0 - smoothstep(uP_horizon - 0.12, uP_horizon + 0.16, Yn);
  col = mix(col, land, landMask);

  /*
    The picture's own edge. Darkening across the frame and resetting hard
    at its boundary is not an artefact to smooth away — it draws the
    nested borders the reference is built out of.
  */
  col *= mix(1.0, uP_frameShade, fract(L));

  /*
    Aerial perspective, from the SCREEN radius. Every frame has the same
    fractional part, so depth cannot come from inside a frame — it has to
    come from how far in the fragment sits. This is what makes the middle
    read as far away instead of merely small.
  */
  float deep = 1.0 - smoothstep(0.0, uP_hazeRange, m);
  col = mix(col, uC_sky, deep * drosteHaze);

  col = pow(max(col, vec3(0.0)), vec3(uP_contrast)) * uP_gain;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);

  // dome shading, kept light — this is a window, not a lit surface
  vec3 n = vec3(pl, z);
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.72 + uP_light * lambert;

  // the glass: a strong fresnel is what turns a picture into a sphere
  // with a world inside it
  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  // Volume coupling: the user's voice thickens the weather, the agent's
  // clears the haze and brings the meadow into flower.
  drosteCloud = clamp(uP_cloudCover - 0.12 * uInput, 0.02, 0.98);
  drosteHaze = uP_haze * (1.0 - 0.25 * uOutput);
  drosteBloom = clamp(uP_flowerDensity * (1.0 + 0.5 * uOutput), 0.0, 1.0);

  vec2 uv = orbUV();
  float mask = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Two fbm evaluations and a flower grid per sample — none of it worth
  // paying for outside the silhouette.
  if (mask <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 col = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 off = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      col += drosteRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = drosteRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr30Orb: OrbVariant = {
  key: "shdr-30",
  label: "SHDR-30",
  note: "a meadow folding into itself toward a blue vanishing point",
  frag: DROSTE_FRAG,
  params: [
    { key: "fall", label: "Fall speed", min: 0, max: 4, step: 0.01, default: 0.12, integrate: true },
    { key: "tilt", label: "Frame tilt", min: -1.6, max: 1.6, step: 0.01, default: 0 },
    { key: "drift", label: "Weather drift", min: 0, max: 4, step: 0.02, default: 0.2, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Tunnel scale", min: 0.3, max: 20, step: 0.1, default: 4.5 },
    { key: "bulge", label: "Dome bulge", min: 0, max: 4, step: 0.02, default: 0.25 },
    { key: "ratio", label: "Frame ratio", min: 1.1, max: 6, step: 0.02, default: 1.8 },
    { key: "horizon", label: "Horizon", min: -0.9, max: 0.9, step: 0.01, default: 0.14 },
    { key: "cloudScale", label: "Cloud scale", min: 0.1, max: 8, step: 0.05, default: 1.6 },
    { key: "cloudCover", label: "Cloud cover", min: 0.02, max: 0.98, step: 0.01, default: 0.46 },
    { key: "streakFreq", label: "Wall detail", min: 0.2, max: 20, step: 0.1, default: 5 },
    { key: "streakRad", label: "Smear", min: 0.02, max: 4, step: 0.02, default: 0.5 },
    { key: "water", label: "Water", min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: "flowerScale", label: "Flower scale", min: 2, max: 120, step: 1, default: 44 },
    { key: "flowerDensity", label: "Flower density", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "flowerSize", label: "Flower size", min: 0.05, max: 0.6, step: 0.01, default: 0.26 },
    { key: "frameShade", label: "Frame shading", min: 0.2, max: 1.4, step: 0.01, default: 0.62 },
    { key: "haze", label: "Aerial haze", min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: "hazeRange", label: "Haze reach", min: 0.005, max: 1.5, step: 0.005, default: 0.09 },
    { key: "gain", label: "Brightness", min: 0.05, max: 4, step: 0.02, default: 1.05 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.05 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.1 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.35 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.55 }
  ],
  /*
   * Six stops, and they are the picture rather than a palette: the sky the
   * recursion closes on, its cloud, the dark canopy, the meadow under the
   * flowers, the planted warm colour, and the glass.
   */
  colors: [
    { key: "sky", label: "Sky", default: "#4a92e0" },
    { key: "cloud", label: "Cloud", default: "#f7fbff" },
    { key: "canopy", label: "Canopy", default: "#12401f" },
    { key: "meadow", label: "Meadow", default: "#5aa63a" },
    { key: "water", label: "Water", default: "#156f6a" },
    { key: "bloom", label: "Bloom", default: "#ff6a3a" },
    { key: "sheen", label: "Sheen", default: "#cfe6ff" }
  ],
  /*
    Staged on the fall, which is the orb's whole subject, and on the haze,
    which decides how far into the recursion the eye can see. Frame ratio
    sets how many frames land on the ball; it differs only for idle, and
    the glide out of rest reads as the tunnel breathing once.
  */
  statePresets: {
    /*
      at rest: a slow fall, deep haze, weather barely moving — on a frame
      ratio nearly double the working states, so fewer, larger frames land
      on the ball, with the horizon dropped below centre. The wall detail
      is coarsened to a broad smear, the water drained entirely, and the
      meadow thinned to sparse, oversized flowers; brighter, and more
      saturated, than the states it falls into.
    */
    idle: {
      fall: 0.12,
      drift: 0.2,
      bulge: 0.2,
      ratio: 3.06,
      horizon: -0.11,
      cloudScale: 1.2,
      cloudCover: 0.42,
      streakFreq: 2.9,
      streakRad: 0.54,
      water: 0,
      flowerScale: 24,
      flowerDensity: 0.27,
      flowerSize: 0.43,
      haze: 0.8,
      hazeRange: 0.09,
      gain: 1.38,
      saturation: 1.56,
      light: 0.345,
      rim: 0.555
    },
    /*
      searching: the fall QUINTUPLES and the haze closes in over three
      times as far, so the recursion is swallowed within a frame or two of
      the middle — the eye is pulled down a tunnel it cannot see the end
      of. The weather thickens and the meadow goes out of flower. Lit hard
      against that: the key light nearly triples, and the gain, contrast
      and saturation all come up, so what the haze leaves is vivid.
    */
    thinking: {
      fall: 0.6,
      drift: 0.5,
      haze: 1,
      hazeRange: 0.3,
      cloudCover: 0.3,
      flowerDensity: 0.28,
      gain: 1.42,
      contrast: 1.45,
      saturation: 2,
      light: 0.96
    },
    /*
      answering: the fall goes FASTEST of the three — twelve times idle —
      on a drift five times as quick and a tunnel nearly doubled in scale,
      with the frames given a slight tilt. The haze lifts to less than half
      idle over a longer reach, opening the recursion to the vanishing
      point; the walls go to fine, wide-smeared detail, the clouds scale up
      threefold, and the meadow comes fully into flower on larger blooms.
      Lit and saturated hardest of the three.
    */
    speaking: {
      fall: 1.47,
      tilt: 0.03,
      drift: 1.54,
      scale: 8.7,
      horizon: 0.03,
      cloudScale: 3.65,
      cloudCover: 0.44,
      streakFreq: 11,
      streakRad: 1.48,
      flowerScale: 32,
      flowerDensity: 0.95,
      haze: 0.38,
      hazeRange: 0.315,
      gain: 1.36,
      contrast: 1.45,
      saturation: 2.32,
      light: 0.57
    }
  },
  // the picture keeps its own colours; the states move the weather and the
  // light, cooling toward overcast while searching and warming while
  // answering
  stateColors: {
    idle: {
      sky: "#4a92e0",
      cloud: "#f7fbff",
      canopy: "#12401f",
      meadow: "#5aa63a",
      water: "#156f6a",
      bloom: "#ff6a3a",
      sheen: "#cfe6ff"
    },
    thinking: {
      sky: "#3f6fa8",
      cloud: "#dde8f4",
      canopy: "#0e2c2e",
      meadow: "#3f7f5c",
      water: "#12525f",
      bloom: "#7d8cff",
      sheen: "#b6cdf0"
    },
    speaking: {
      sky: "#6fb0ec",
      cloud: "#fff6e8",
      canopy: "#204a16",
      meadow: "#7cc23f",
      water: "#1d8a76",
      bloom: "#ffb02e",
      sheen: "#ffe3c4"
    }
  }
};

export type Shdr30Props = Omit<ShaderOrbProps, "variant">;

export function Shdr30({ size = 280, ...rest }: Shdr30Props) {
  return <ShaderOrb variant={shdr30Orb} size={size} {...rest} />;
}

export default Shdr30;
