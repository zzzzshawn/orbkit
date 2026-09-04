/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-05 — rainbow rings travelling through a lattice of lenses.

   Ported from a two-line twigl listing, the shortest in this library:

     vec2 p=(FC.xy*2.-r)/r.y*5.;
     o=cos(length(tan(p)+p)-t+vec4(0,.7,1,3));

   What it actually is, decoded:

   - tan(p) IS THE LENS GRID. Componentwise tangent has a pole every PI, so
     the plane is cut into a square lattice of cells and the coordinate
     diverges at every cell wall. Inside a cell the map is a gentle
     distortion; at the wall it throws the sample to infinity.
   - ADDING p BACK IS WHAT KEEPS IT LEGIBLE. tan alone would map every cell
     onto the whole plane and the cells would be identical; tan(p) + p
     offsets each one by its own position, so every cell in the lattice
     shows a DIFFERENT part of the ring field. The grid is a lattice of
     lenses looking at different places, not a tiling of one image.
   - THE PICTURE IS ONE COSINE of the length of that. Concentric rings, at
     three channel phases a fraction of a radian apart, travelling on the
     clock. Rings inward, colour fringing where the phases separate,
     and where a cell wall is approached the rings pile up without limit.
   - THERE IS NO TONE MAP. The listing ends on a raw cosine, so everything
     below zero is clamped away by the display — half of every period is
     hard black, which is what makes the bands read as edges rather than
     as a gradient.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: a flat 2D field, so it is sampled through a
     stereographic projection of the dome and finished with a fresnel
     sheen, never masked out of the plane as a disc. Motion is
     projection-safe 2D, as in shdr-08.
   - tan() IS SOFTENED, and this is the one change the port could not do
     without. sin/cos reaches infinite ring frequency at every cell wall,
     which no amount of supersampling resolves — it is not a sampling
     problem, it is unbounded bandwidth. sin*cos/(cos*cos + g) equals tan
     wherever tan is finite and caps at 1/(2*sqrt(g)) where it is not, so
     g sets how tightly the rings may crowd before the wall stops them.
     The same softened reciprocal as shdr-26's cell poles and
     shdr-09's rainbow fringe.
   - Even softened the walls are the busiest thing on the ball, so this orb
     supersamples where the smooth-field orbs do not.
   - The listing's clamp at zero is kept: it is not an artefact of the
     display, it is half the image.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * AA is a `#define`: ES 1.0 requires constant loop bounds. Three is not
 * caution here — the cell walls put the highest spatial frequency in this
 * library right where the light is brightest.
 */
const CAUSTIC_FRAG = `
#define AA 3

// Volume-reactive values, resolved once per fragment in main().
float causticSoft;
float causticGain;
float causticSpread;

/*
  Softened tangent. Equal to sin/cos wherever cos is not near zero, capped
  at 1/(2*sqrt(g)) where it is — see the header for why the raw pole cannot
  be supersampled away.
*/
vec2 tanSoft(vec2 x, float g) {
  vec2 s = sin(x);
  vec2 c = cos(x);
  return s * c / (c * c + g);
}

vec3 causticRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));

  float ring = uP_ring; // integrated clock: the rings travel

  // stereographic wrap of the unrotated dome, as in shdr-08 — the lens
  // lattice compresses toward the limb the way a texture on a sphere does
  vec2 p = pl / (z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion: the lattice turns and slides
  float sw = uP_swirl; // integrated clock
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p += vec2(uP_slide, uP_slide * 0.6); // integrated clock

  /*
    The lens lattice. Adding p back to its own tangent is what gives every
    cell a different view instead of tiling one image — see the header.
  */
  float L = length(tanSoft(p, causticSoft) * uP_lens + p);

  /*
    One cosine, three phases. The listing's (0, .7, 1) sit well under a
    radian apart, so the channels overlap through most of a band and only
    separate at its shoulders — white cores with coloured edges, not three
    independent rainbows.
  */
  vec3 col = cos(L * uP_freq - ring + vec3(0.0, 0.7, 1.0) * causticSpread);

  // the listing's clamp: half of every period is hard black, and that is
  // what makes these read as bands rather than as a gradient
  col = max(col, vec3(0.0)) * causticGain;

  col = pow(col, vec3(uP_contrast));

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // a dark body under the bands, so the black half of the cosine reads as
  // the ball rather than as a hole in it
  col += uC_body * uP_floorLevel;

  // dome shading keeps the ball a ball under the lattice
  vec3 n = vec3(pl, z);
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.6 + uP_light * lambert;

  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  // Volume coupling: the user's voice lets the walls crowd tighter, the
  // agent's brightens the bands and opens the colour split.
  causticSoft = max(uP_poleSoft * (1.0 - 0.5 * uInput), 0.0008);
  causticGain = uP_gain * (0.85 + 0.45 * uOutput);
  causticSpread = uP_spread * (1.0 + 0.5 * uOutput);

  vec2 uv = orbUV();
  float mask = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  if (mask <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 col = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 off = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      col += causticRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = causticRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr05Orb: OrbVariant = {
  key: "shdr-05",
  label: "SHDR-05",
  note: "rainbow rings travelling through a lattice of lenses",
  frag: CAUSTIC_FRAG,
  params: [
    { key: "ring", label: "Ring speed", min: 0, max: 8, step: 0.03, default: 0.9, integrate: true },
    { key: "swirl", label: "Swirl", min: 0, max: 3, step: 0.015, default: 0.05, integrate: true },
    { key: "slide", label: "Lattice slide", min: 0, max: 4, step: 0.02, default: 0.12, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Lattice scale", min: 0.3, max: 20, step: 0.1, default: 5 },
    { key: "bulge", label: "Dome bulge", min: 0, max: 4, step: 0.02, default: 0.3 },
    { key: "lens", label: "Lens strength", min: 0, max: 4, step: 0.02, default: 1 },
    { key: "poleSoft", label: "Wall softness", min: 0.0008, max: 0.5, step: 0.0008, default: 0.02 },
    { key: "freq", label: "Ring frequency", min: 0.05, max: 8, step: 0.05, default: 1 },
    { key: "spread", label: "Colour split", min: 0, max: 4, step: 0.02, default: 1 },
    { key: "gain", label: "Brightness", min: 0.05, max: 4, step: 0.02, default: 1.1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 6, step: 0.05, default: 1 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.15 },
    { key: "floorLevel", label: "Body fill", min: 0, max: 2, step: 0.01, default: 0.12 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.4 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.45 }
  ],
  colors: [
    { key: "tint", label: "Tint", default: "#ffffff" },
    { key: "body", label: "Body", default: "#141a30" },
    { key: "sheen", label: "Sheen", default: "#bcd8ff" }
  ],
  /*
    Staged on WALL SOFTNESS, which decides how tightly the rings are
    allowed to crowd before a cell wall stops them, and on ring frequency,
    which decides how many bands are on the ball at all. Lattice scale
    never moves between states — it sets the cell count, and a gliding cell
    count reads as the ball inflating rather than as a change of mood.

    Dome bulge and lens strength are staged too, so the SHAPE moves with the
    mood as well as the lattice: resting flattens both, and the two busy
    states drive them up — answering hardest, which puts bulge at 0 through
    0.36 to 0.96 across the three. They are continuous geometry rather than
    a quantizer, so gliding them is safe.
  */
  statePresets: {
    /*
      at rest: a plain sphere of drifting bands. Dome bulge is at zero and
      the lens down to under half its default — the only state that flattens
      both — so the ball is read straight rather than through a lens, which
      is what lets resting look settled even though the rings never stop
      moving.

      The walls are the TIGHTEST of the three here, under a third of
      searching's and a fifth of answering's, so the rings crowd hard
      against them; the colour split narrows to 0.7 with the key light
      raised well over its default to put back the separation the narrower
      split gives away.
    */
    idle: {
      ring: 0.9,
      swirl: 0.195,
      slide: 0.26,
      bulge: 0,
      lens: 0.38,
      poleSoft: 0.012,
      freq: 1.05,
      spread: 0.7,
      gain: 1.1,
      contrast: 1,
      saturation: 1.14,
      light: 0.66
    },
    /*
      searching: the ball comes UP. Where resting is flat and read straight,
      this bulges the dome and drives the lens past one, so the bands are
      magnified through the middle — and the drift roughly triples, swirl
      and lattice slide together, on a ring clock three times as fast.

      It is also the hardest-looking of the three by some way: contrast more
      than triples over resting and saturation doubles, on a body fill three
      times as deep and with the rim sheen switched off entirely, so nothing
      softens the edge. The walls open to three times resting's, which stops
      the rings being hairlines — this state reads through colour and shape
      now, not through fineness.
    */
    thinking: {
      ring: 3,
      swirl: 0.57,
      slide: 0.88,
      bulge: 0.36,
      lens: 1.28,
      poleSoft: 0.042,
      freq: 1.3,
      spread: 1.82,
      gain: 0.88,
      contrast: 3.2,
      saturation: 2.36,
      floorLevel: 0.4,
      rim: 0
    },
    /*
      answering: the FINEST banding of the three by a long way — ring
      frequency near five times resting's and nearly four times searching's
      — laid over the most strongly domed ball, bulge pushed almost to one
      against resting's flat zero. Many tight bands, spread across a surface
      curving away from you.

      The walls open to five times resting's, which is what keeps banding
      that fine from crowding into a solid field, and the drift is the
      highest of the three on both controls. Colour split comes back to
      about where resting holds it, so it is the fineness that carries this
      state rather than the split.
    */
    speaking: {
      ring: 1.4,
      swirl: 0.6,
      slide: 1,
      bulge: 0.96,
      lens: 1.2,
      poleSoft: 0.064,
      freq: 4.8,
      spread: 0.68,
      gain: 1.6,
      contrast: 0.75
    }
  },
  // the ring phases supply the colour, so the tint only shifts temperature
  // and the body carries the mood: neutral at rest, cold while searching,
  // warm while answering
  stateColors: {
    idle: { tint: "#ffffff", body: "#141a30", sheen: "#bcd8ff" },
    thinking: { tint: "#a6c0ff", body: "#080c26", sheen: "#7ea9ff" },
    speaking: { tint: "#ffc492", body: "#2e1408", sheen: "#ffb277" }
  }
};

export type Shdr05Props = Omit<ShaderOrbProps, "variant">;

export function Shdr05({ size = 280, ...rest }: Shdr05Props) {
  return <ShaderOrb variant={shdr05Orb} size={size} {...rest} />;
}

export default Shdr05;
