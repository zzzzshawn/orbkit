/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-27 — a weather-radar mosaic: fronts of colour-classed pixels sweeping
   across the ball.

   The reference is a precipitation map drawn as a coarse grid of square
   dots on cream paper: each dot is one of a handful of flat colours — grey
   where there is barely anything, then blue, cyan, green, red, yellow, a
   rare magenta at the peaks — and the dots thin out to nothing in the
   quiet areas, so the fronts have speckled edges and the calm between
   them is mostly paper. The fronts are long and diagonal, streaked along
   their direction of travel.

   - THE FIELD. The sphere is twisted by a handful of vortices — hashed
     points on it, each rotating the space about the axis through it by a
     Gaussian-falloff angle, alternating in sense — and two 3D fbm scales
     are then read through that twist and MULTIPLIED: a broad
     one decides where the storm systems are, a finer one gives each a
     core and ragged edges, so the calm between systems is empty and the
     peaks sit inside the cells, which is what draws the concentric class
     rings. The noise drifts through the twist on the integrated clock, so
     every system winds into a spiral around the nearest centre and keeps
     swirling as new noise slides in. A threshold window and a response
     curve cut the intensity out of it.
   - THE MOSAIC. The wrapped plane is cut into a grid and the field is
     read ONCE per cell, at the cell's centre, so every dot is one flat
     colour — no gradient ever crosses a dot, which is the whole look. The
     intensity is quantized into seven classes, with a per-cell hash added
     first so the class boundaries dither into speckle rather than draw a
     contour.
   - DROPOUT. Each cell hashes against a density that rises with the
     intensity: the quiet areas keep only a sparse scatter of grey dots and
     the fronts fill in solid. The hash re-rolls on the ambient clock at a
     slow rate, so the scatter twinkles without the fronts moving.
   - THE DOT. A square, inset in its cell so the paper shows as a lattice
     between dots.

   The grid lives on a stereographic wrap of the dome as it faces the
   viewer, so the mosaic compresses gently toward the limb — the pixels are
   ON the sphere — while the field is evaluated in 3D on the sphere's own
   points (3D value noise, vortices as rotations about points on the
   sphere), so the roll only rotates the picture under the pixels and no
   projection ever distorts it. Surface-lit and
   mask-bounded, so alpha IS coverage — premultiplied output, as in
   shdr-14.
---------------------------------------------------------------------------- */

const RADAR_FRAG = `
#define VORTICES 6
#define FBM3_OCT 4

// Volume-reactive values, resolved once per fragment in main().
float radarLoNow;
float radarDensityNow;

/*
  3D value noise. The prelude's noise is 2D, and a 2D field wrapped onto
  the ball has to be projected — and every projection either distorts
  somewhere or seams somewhere, which is exactly what the roll dragged
  into view. Evaluating the field ON the sphere's own points needs
  nothing projected: the roll is just a rotation of the sample point.
*/
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < FBM3_OCT; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(11.7, 7.3, 3.1);
    a *= 0.5;
  }
  return v;
}

// rotate v about the unit axis k by angle a (Rodrigues)
vec3 rotateAbout(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

// the precipitation intensity, 0..1, at a point of the unit sphere
float intensity(vec3 sp, float t) {
  vec3 q = sp;
  /*
    The vortices: hashed points on the sphere, each twisting the space
    around itself — a rotation about the axis through it, by an angle
    that falls off with the angular distance, alternating in sense. The
    centres wander slowly so no spiral sits still.
  */
  for (int k = 0; k < VORTICES; k++) {
    float fk = float(k);
    vec3 c = normalize(vec3(
      hash(vec2(fk * 3.7, 1.1)) - 0.5,
      hash(vec2(fk * 5.9, 2.3)) - 0.5,
      hash(vec2(fk * 7.1, 4.9)) - 0.5
    ));
    c = rotateAbout(c, vec3(0.0, 1.0, 0.0), sin(t * 0.09 + fk * 1.7) * 0.25);
    float ang = acos(clamp(dot(q, c), -1.0, 1.0));
    float fall = exp(-ang * ang / (uP_vortex * uP_vortex));
    float a = uP_swirl * fall * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
    q = rotateAbout(q, c, a);
  }

  // bend, then drift the noise through the twisted space
  vec3 w = vec3(noise3(q * 1.3 + 2.1), noise3(q * 1.3 + 7.3), noise3(q * 1.3 + 4.4)) - 0.5;
  q += w * uP_warp;
  vec3 pq = q * uP_freq + vec3(t * 0.22, -t * 0.13, t * 0.07);

  /*
    Two scales multiplied, not added: a broad mask decides WHERE the storms
    are, a finer field gives each one a core and ragged edges. Adding them
    fills the whole sphere with mid-tones; multiplying leaves the calm
    between systems genuinely empty and puts the peaks inside the cells,
    which is what draws the concentric class rings.
  */
  float big = clamp((fbm3(pq) - 0.5) * 3.0 + 0.5, 0.0, 1.0);
  float fine = clamp((fbm3(pq * 2.6 + 4.7) - 0.5) * 2.4 + 0.5, 0.0, 1.0);
  float f = big * (0.55 + 0.45 * fine);

  f = clamp((f - radarLoNow) / max(uP_hi - radarLoNow, 0.01), 0.0, 1.0);
  // a response curve: the top classes are the rare peaks of a real map
  return pow(f, uP_curve);
}

void main() {
  // input lowers the window (more of the field reads as weather), output
  // fills the dots in
  radarLoNow = uP_lo - 0.08 * uInput;
  radarDensityNow = uP_density * (1.0 + 0.5 * uOutput);

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

  float t = uP_speed; // integrated clock: the weather drifts

  /*
    The pixel grid lives on the UNROLLED dome: a stereographic wrap of the
    front hemisphere as it faces the viewer, which compresses gently toward
    the limb and never changes. The picture rolls underneath it — the
    pixels are the screen, the weather is what is on it. Laying the grid on
    the rolled dome instead put the projection's blow-up (the far side of
    the ball) wherever the roll had turned it, and the cells smeared into
    streaks there.
  */
  vec2 st = n.xy / (1.3 + n.z) * uP_scale;
  vec2 g = st * uP_cells;
  vec2 cell = floor(g);
  vec2 fr = fract(g) - 0.5;

  // the cell centre, back on the dome: invert the wrap, then roll it and
  // read the field there — once per cell, so every dot is one flat colour
  vec2 v = (cell + 0.5) / uP_cells / uP_scale;
  float vv = dot(v, v);
  float A = vv + 1.0;
  float B = 2.6 * vv;
  float C = 1.69 * vv - 1.0;
  float zc = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  vec3 nc = vec3(v * (1.3 + zc), zc);
  float cr = cos(uP_spin);
  float sr = sin(uP_spin);
  vec3 spc = vec3(nc.x * cr - nc.z * sr, nc.y, nc.x * sr + nc.z * cr);

  float f = intensity(spc, t);

  // dither the class boundaries with a per-cell hash, then quantize into
  // the legend's seven classes. The bands are NOT even: red is broad and
  // green thin, as on the reference, and magenta is the rare peak.
  float h = hash(cell + 11.7);
  float fd = clamp(f + (h - 0.5) * uP_dither, 0.0, 1.0);
  float cls = 0.0;
  cls += step(0.10, fd);
  cls += step(0.26, fd);
  cls += step(0.38, fd);
  cls += step(0.46, fd);
  cls += step(0.78, fd);
  cls += step(0.94, fd);

  // dropout: density rises with the intensity; the hash re-rolls slowly
  float frame = floor(uTime * uP_twinkle);
  float roll = hash(cell + vec2(frame * 3.7, -frame * 1.3));
  float density = mix(uP_sparse, 1.0, smoothstep(0.0, 0.6, f)) * radarDensityNow;
  float keep = step(roll, density);

  // the dot: a square inset in its cell
  float dsq = max(abs(fr.x), abs(fr.y));
  float dotMask = 1.0 - smoothstep(uP_dot - 0.06, uP_dot + 0.06, dsq);

  // the class palette
  vec3 ink = uC_c0;
  ink = cls > 0.5 && cls < 1.5 ? uC_c1 : ink;
  ink = cls > 1.5 && cls < 2.5 ? uC_c2 : ink;
  ink = cls > 2.5 && cls < 3.5 ? uC_c3 : ink;
  ink = cls > 3.5 && cls < 4.5 ? uC_c4 : ink;
  ink = cls > 4.5 && cls < 5.5 ? uC_c5 : ink;
  ink = cls > 5.5 ? uC_c6 : ink;

  vec3 col = mix(uC_paper, ink, dotMask * keep);

  // paper grain, so the flats are not dead
  col *= 1.0 + (hash(floor(gl_FragCoord.xy / 2.0) + frame) - 0.5) * uP_grain;

  // dome shading keeps the ball a ball under the mosaic
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  col *= 1.0 - uP_light * (1.0 - lambert);
  float fres = pow(1.0 - z, 3.0);
  col = mix(col, uC_c0, fres * uP_rim);

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr27Orb: OrbVariant = {
  key: "shdr-27",
  label: "SHDR-27",
  note: "a weather-radar mosaic, fronts of coloured pixels sweeping the ball",
  frag: RADAR_FRAG,
  params: [
    { key: "speed", label: "Front speed", min: 0.015, max: 10, step: 0.05, default: 0.6, integrate: true },
    { key: "spin", label: "Roll", min: 0, max: 5, step: 0.03, default: 0.04, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Grid zoom", min: 0.3, max: 8, step: 0.05, default: 2.4 },
    { key: "cells", label: "Grid", min: 8, max: 120, step: 1, default: 34 },
    { key: "dot", label: "Dot size", min: 0.1, max: 0.5, step: 0.01, default: 0.36 },
    { key: "swirl", label: "Swirl", min: 0, max: 8, step: 0.05, default: 1.5 },
    { key: "vortex", label: "Vortex size", min: 0.1, max: 2, step: 0.01, default: 0.45 },
    { key: "freq", label: "Storm scale", min: 0.2, max: 8, step: 0.05, default: 1.6 },
    { key: "warp", label: "Bend", min: 0, max: 3, step: 0.02, default: 0.5 },
    { key: "lo", label: "Quiet threshold", min: 0, max: 1, step: 0.005, default: 0.12 },
    { key: "hi", label: "Peak threshold", min: 0, max: 1, step: 0.005, default: 0.82 },
    { key: "curve", label: "Response curve", min: 0.5, max: 4, step: 0.05, default: 1.4 },
    { key: "dither", label: "Class dither", min: 0, max: 0.6, step: 0.005, default: 0.12 },
    { key: "sparse", label: "Quiet density", min: 0, max: 1, step: 0.01, default: 0.16 },
    { key: "density", label: "Fill", min: 0, max: 1.5, step: 0.01, default: 1 },
    { key: "twinkle", label: "Twinkle rate", min: 0, max: 30, step: 0.5, default: 3 },
    { key: "grain", label: "Paper grain", min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: "light", label: "Key light", min: 0, max: 1, step: 0.01, default: 0.18 },
    { key: "rim", label: "Rim", min: 0, max: 1, step: 0.01, default: 0.35 }
  ],
  /*
   * The paper and the seven classes, quiet to peak: grey, blue, cyan,
   * green, red, yellow, magenta — the radar legend of the reference.
   */
  colors: [
    { key: "paper", label: "Paper", default: "#efe9dc" },
    { key: "c0", label: "Quiet", default: "#a9a9a6" },
    { key: "c1", label: "Class 1", default: "#2e5df0" },
    { key: "c2", label: "Class 2", default: "#38d9ec" },
    { key: "c3", label: "Class 3", default: "#22c35c" },
    { key: "c4", label: "Class 4", default: "#e8322a" },
    { key: "c5", label: "Class 5", default: "#f5d020" },
    { key: "c6", label: "Peak", default: "#e030c0" }
  ],
  /*
    Staged on the drift, the swirl, the window and the fill. The grid, the
    zoom and the storm scale all multiply a coordinate or sit inside a
    floor, so they never move between states. The swirl is an angle,
    bounded, and glides safely.
  */
  statePresets: {
    // at rest: fronts drifting, the ball rolling at a steady turn, the
    // quiet areas sparse, a slow twinkle
    idle: {
      speed: 1,
      spin: 0.27,
      lo: 0.12,
      hi: 0.82,
      curve: 1.4,
      sparse: 0.16,
      density: 1,
      twinkle: 3,
      warp: 0.5,
      swirl: 1.5,
      dither: 0.12
    },
    /*
      searching: the storms go FINE and the swirl hard — the storm scale at
      three times rest, the vortices twisting at nearly three times the
      rest angle on a doubled bend, the roll doubled — with the window
      thrown open (quiet threshold at zero, peak at half), so the whole
      ball is small, tightly wound systems. The storm scale multiplies a
      coordinate, so the glide into and out of thinking passes through a
      rescale — chosen deliberately.
    */
    thinking: {
      speed: 2.4,
      spin: 0.51,
      lo: 0,
      hi: 0.545,
      curve: 1.7,
      sparse: 0.22,
      density: 0.9,
      twinkle: 12,
      freq: 5.2,
      warp: 1.06,
      swirl: 4,
      dither: 0.18
    },
    /*
      answering: the weather FILLS IN and RACES. The quiet threshold drops
      to zero so every cell reads as weather, the fronts widen into red and
      yellow with magenta peaks, the drift runs at six times rest on the
      thinking roll, and the paper grain comes up.
    */
    speaking: {
      speed: 6.5,
      spin: 0.51,
      lo: 0,
      hi: 0.8,
      curve: 1.3,
      sparse: 0.22,
      density: 1.15,
      twinkle: 5,
      warp: 0.45,
      swirl: 2,
      grain: 0.35,
      dither: 0.1
    }
  },
  // the legend holds; the paper cools while searching and warms while
  // answering
  stateColors: {
    idle: { paper: "#efe9dc" },
    thinking: { paper: "#e6e9ee" },
    speaking: { paper: "#f5e6d0" }
  }
};

export type Shdr27Props = Omit<ShaderOrbProps, "variant">;

export function Shdr27({ size = 280, ...rest }: Shdr27Props) {
  return <ShaderOrb variant={shdr27Orb} size={size} {...rest} />;
}

export default Shdr27;
