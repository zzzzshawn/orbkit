/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-19 — beads swelling and shrinking in their cells, packed over the ball.

   Ported from a one-line twigl listing:

     vec2 p=FC.xy/8e1,v;
     for(int i;i++<9;o=max(o,(dot(cos(v-t),sin(v.yx*.62+t))/6.+.2
         -length(p+v+cos(v.yx+t)*.4-1.))*5e1))
       v=vec2(i%3,i/3)-ceil(p);

   What it actually is, decoded:

   - IT IS A CELLULAR FIELD, written as compactly as one can be. Nine
     iterations walk the 3x3 neighbourhood of the fragment's cell; each
     neighbour gets a jittered feature point and a radius, and max() over
     the nine takes the union of the discs. Everything else is the two
     expressions that generate radius and jitter.
   - THE RADIUS IS A DOT OF A COSINE AGAINST A SINE of the cell index, one
     of them swizzled and detuned by .62 so the two never fall into step.
     That is the entire random number generator, and because both terms
     carry the clock, every bead swells and shrinks on its own phase.
     Radii run from about -.13 to .53, so cells with a negative radius
     simply have no bead — the field thins and fills on its own.
   - THE x50 IS AN EDGE RAMP, not a brightness. A signed distance scaled
     that hard and clamped is a hard-edged disc with a pixel of feather,
     which is why beads read as objects with rims rather than as blobs.
   - The listing writes a scalar into a vec4, so its output is greyscale:
     white discs on black.

   Two golf bugs, both fixed here, both worth knowing:

   - THE CELL IDENTITY IS NOT STABLE. The hash input is
     v = neighbour offset - ceil(p), which for a fixed absolute cell C
     works out to C - 2*ceil(p): it depends on WHICH FRAGMENT IS LOOKING.
     So a bead's radius and jitter change across every cell boundary and
     the discs are chopped up on the grid. Keyed on the absolute cell
     index instead, as here, a bead is one bead and crosses borders whole.
   - THE NEIGHBOURHOOD IS OFF BY ONE. i runs 1..9 rather than 0..8, so
     vec2(i%3, i/3) covers (0,-1) through (-1,2) after centring — nine
     cells, but not the nine that surround you. The corner at (-1,-1) is
     missing, and beads there are clipped. Walked properly here.

   Orb decisions, each one a rule in the README:

   - THE ORB IS THE OBJECT: a flat 2D field, so it is sampled through a
     stereographic projection of the dome — the packing compresses toward
     the limb the way beads on a real sphere would — and motion is
     projection-safe 2D, as in shdr-08.
   - FLAT WHITE DISCS ON BLACK IS THE SUBJECT, and the defaults ship that
     way: the listing writes a scalar into a vec4 and stops. What the ball
     adds is the wrap, a little dome shading and the sheen — enough to be
     a sphere, not enough to stop being a dot screen.
   - uP_bead is an option, off by default. Since the winning cell is
     already known, its own distance and radius give a hemisphere for
     free — sqrt(1 - (dist/radius)^2) is a height, and that is a normal to
     light — so the same field can be read as packed glass instead of
     printed circles. It is a different orb, so it is a slider rather than
     a default.
   - Bead size and wander are kept low enough that discs stay separate.
     They are drawn with max() of (radius - distance), so two that overlap
     do not blend — the larger simply wins and bites a straight edge out
     of the smaller. Whole discs with gaps between them is the look; a
     field of clipped crescents is what happens when they are pushed too
     big or shaken too far.
   - The golfed listing relies on i starting at zero; uninitialised locals
     are UNDEFINED in GLSL ES 1.0, explicit here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * AA is a `#define`: ES 1.0 requires constant loop bounds. The bead rims are
 * about a pixel wide by construction, so they need it.
 */
const FOAM_FRAG = `
#define AA 2

// Volume-reactive values, resolved once per fragment in main().
float foamGrow;
float foamJitter;
float foamGain;

vec3 foamRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));

  float t = uP_speed; // integrated clock

  // stereographic wrap of the unrotated dome, as in shdr-08
  vec2 p = pl / (z + 1.0 + uP_bulge) * uP_scale;

  // projection-safe 2D motion: the packing turns and drifts
  float sw = uP_swirl; // integrated clock
  p = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  p += vec2(uP_slide, uP_slide * 0.7); // integrated clock

  vec2 cell = ceil(p);
  vec2 f = p - cell; // in (-1, 0], the fragment's place in its own cell

  /*
    The 3x3 walk, keyed on the ABSOLUTE cell index so a bead is one bead —
    see the header. Tracking the winner as well as the max costs nothing
    and is what makes the shading below possible.
  */
  float cover = 0.0;
  float bestRel = 1e9;
  vec2 bestDelta = vec2(0.0);
  float bestRad = 1.0;
  vec2 bestId = vec2(0.0);

  for (int gy = -1; gy <= 1; gy++) {
    for (int gx = -1; gx <= 1; gx++) {
      vec2 g = vec2(float(gx), float(gy));
      vec2 id = cell + g;

      /*
        The listing's generator: a dot of a cosine against a detuned,
        swizzled sine of the cell index, both carrying the clock. Mind the
        range — a dot of two 2-vectors of unit-bounded components spans
        FOUR, not two, so the listing's /6 puts radii within a third of a
        cell of the mean. Read it as half that and the largest discs
        overlap their neighbours, which is what turns a dot screen into a
        litter of merged blobs.
      */
      float rad = dot(cos(id - t), sin(id.yx * uP_skew + t)) * uP_vary + foamGrow;
      /*
        Fragment to feature point, and the signs matter more than they
        look. The disc labelled id sits at id + jitter in absolute
        coordinates, so delta = p - (id + jitter) = f - g - jitter. Write
        it as f + g and the disc's IDENTITY and its POSITION end up using
        opposite offsets: every fragment then draws disc id in a different
        place, and the field comes out as clumps of half-agreeing circles
        rather than circles.
      */
      vec2 jit = cos(id.yx + t) * foamJitter;
      vec2 delta = f - g - jit;
      float dist = length(delta);

      /*
        The union is taken over COVERAGE, not over the signed distance the
        listing maxes. Those differ exactly where two discs overlap: max of
        (radius - distance) hands the whole overlap to whichever disc wins
        and bites a straight edge out of the other, so the field comes out
        a litter of crescents and pinwheels. Max of the clamped coverage
        keeps every disc whole and merely lets overlapping ones merge.

        The x50 ramp is the listing's, and it is an edge width rather than
        a brightness: a signed distance scaled that hard and clamped is a
        hard-edged disc with about a pixel of feather.
      */
      cover = max(cover, clamp((rad - dist) * uP_edge, 0.0, 1.0));

      /*
        The winner is tracked separately, by RELATIVE depth rather than
        absolute — which disc this fragment is furthest inside, in units of
        that disc's own radius. Only the optional bead shading reads it,
        and relative depth is what keeps a small disc from being shaded as
        though it were the large one beside it.
      */
      float rel = dist / max(rad, 1e-4);
      if (rel < bestRel) {
        bestRel = rel;
        bestDelta = delta;
        bestRad = rad;
        bestId = id;
      }
    }
  }

  /*
    The bead. The winning cell's own distance and radius give the height of
    a hemisphere over the disc, and that is a normal — so the flat decal
    becomes a lit piece of glass without a second field being evaluated.
  */
  float rr = max(bestRad, 1e-4);
  float dome = clamp(1.0 - dot(bestDelta, bestDelta) / (rr * rr), 0.0, 1.0);
  vec3 bn = normalize(vec3(bestDelta / rr, sqrt(dome) + 0.001));

  vec3 key = normalize(vec3(-0.45, 0.55, 0.72));
  float beadLam = clamp(dot(bn, key), 0.0, 1.0);

  // per-disc colour, hashed on the cell index — near-flat at the defaults,
  // which is what keeps the field reading as a dot screen
  vec3 beadCol = mix(uC_low, uC_high, hash(bestId + 0.5));

  // uP_bead at 0 leaves the listing's flat disc, which is the default
  float shade = mix(1.0, 0.45 + 0.85 * beadLam, uP_bead);
  vec3 col = beadCol * shade * foamGain * cover;

  // a dark body under the packing, so the gaps read as the ball rather
  // than as holes in it
  col += uC_body * uP_floorLevel;

  col = pow(max(col, vec3(0.0)), vec3(uP_contrast));

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);

  // dome shading keeps the ball a ball under the packing
  vec3 n = vec3(pl, z);
  float lambert = clamp(dot(n, key), 0.0, 1.0);
  col *= 0.55 + uP_light * lambert;

  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  // Volume coupling: the user's voice shakes the beads off their centres,
  // the agent's swells them and brightens the packing.
  foamGrow = uP_grow * (1.0 + 0.35 * uOutput);
  foamJitter = uP_jitter * (1.0 + 0.5 * uInput);
  foamGain = uP_gain * (0.85 + 0.4 * uOutput);

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
      col += foamRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = foamRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr19Orb: OrbVariant = {
  key: "shdr-19",
  label: "SHDR-19",
  note: "beads swelling and shrinking in their cells, packed over the ball",
  frag: FOAM_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.5, integrate: true },
    { key: "swirl", label: "Swirl", min: 0, max: 3, step: 0.015, default: 0.05, integrate: true },
    { key: "slide", label: "Drift", min: 0, max: 4, step: 0.02, default: 0.1, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Packing scale", min: 0.3, max: 30, step: 0.1, default: 10 },
    { key: "bulge", label: "Dome bulge", min: 0, max: 4, step: 0.02, default: 0.3 },
    { key: "grow", label: "Dot size", min: -0.2, max: 1.2, step: 0.005, default: 0.185 },
    { key: "vary", label: "Size variation", min: 0, max: 0.4, step: 0.005, default: 0.13 },
    { key: "skew", label: "Generator detune", min: 0, max: 3, step: 0.01, default: 0.62 },
    { key: "jitter", label: "Dot wander", min: 0, max: 1.5, step: 0.01, default: 0.1 },
    { key: "edge", label: "Rim hardness", min: 1, max: 200, step: 1, default: 50 },
    { key: "bead", label: "Bead shading", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "gain", label: "Brightness", min: 0.05, max: 4, step: 0.02, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 6, step: 0.05, default: 1 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.1 },
    { key: "floorLevel", label: "Body fill", min: 0, max: 2, step: 0.01, default: 0.06 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.3 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.35 }
  ],
  /*
   * Four stops: the two ends of the per-bead hash, the body the packing
   * sits on, and the glass.
   */
  colors: [
    { key: "low", label: "Dot", default: "#ffffff" },
    { key: "high", label: "Dot accent", default: "#eef5ff" },
    { key: "body", label: "Body", default: "#05070c" },
    { key: "sheen", label: "Sheen", default: "#9dbfe4" }
  ],
  /*
    Staged on BEAD SIZE, which decides whether the ball is a scatter of
    separate beads or a packed foam, and on wander, which decides how far
    each one strays from its cell. Packing scale never moves between
    states — it sets the bead count, and a gliding count reads as the ball
    inflating rather than as a change of mood.
  */
  statePresets: {
    /*
      at rest: a sparse, restless screen. The dots sit small with a wide
      size spread and wander most of a cell, on a dome flattened almost to
      a disc, so the halftone reads as grain rather than pattern — pushed
      bright and hard-contrasted so the few dots that land carry.
    */
    idle: {
      speed: 0.52,
      swirl: 0.045,
      slide: 0.1,
      bulge: 0.08,
      grow: 0.12,
      vary: 0.19,
      skew: 0.63,
      jitter: 0.74,
      edge: 51,
      gain: 2.28,
      contrast: 2.6,
      rim: 0.345
    },
    /*
      searching: the screen is set MOVING. The clock runs five times idle,
      the swirl and slide both open up an order of magnitude, and the
      generator detunes near double, so the dots stream across the ball
      rather than sit on it. They swell a little and wander half as far as
      idle, under a softer contrast and a stronger key light — a flatter,
      brighter, busier screen.
    */
    thinking: {
      speed: 2.55,
      swirl: 0.57,
      slide: 0.84,
      bulge: 0.14,
      grow: 0.19,
      vary: 0.165,
      skew: 1.13,
      jitter: 0.37,
      gain: 1.04,
      contrast: 0.55,
      light: 0.585,
      rim: 0.24
    },
    /*
      answering: the screen goes HARD. The generator detune drops to zero,
      so every dot's size runs on the clock alone and the whole screen
      pulses in step; the size spread opens to its widest and the rim
      hardness nearly triples, so the dots read as punched holes rather
      than beads. The dome rises, the dots settle to a quarter of idle's
      wander, and the body fill is cut — pure white dots on black, at the
      thinking tempo and a harder contrast still.
    */
    speaking: {
      speed: 2.85,
      swirl: 0.585,
      slide: 0.55,
      bulge: 0.28,
      grow: 0.22,
      vary: 0.365,
      skew: 0,
      jitter: 0.17,
      edge: 141,
      gain: 1.35,
      contrast: 3.2,
      saturation: 2.04,
      floorLevel: 0
    }
  },
  // cool glass at rest, then pure white on black for both working states —
  // the answering one keeps the faintly warm body
  stateColors: {
    idle: { low: "#ffffff", high: "#eef5ff", body: "#05070c", sheen: "#9dbfe4" },
    thinking: { low: "#dae6ff", high: "#ffffff", body: "#000000", sheen: "#ffffff" },
    speaking: { low: "#ffffff", high: "#ffffff", body: "#140a06", sheen: "#ffffff" }
  }
};

export type Shdr19Props = Omit<ShaderOrbProps, "variant">;

export function Shdr19({ size = 280, ...rest }: Shdr19Props) {
  return <ShaderOrb variant={shdr19Orb} size={size} {...rest} />;
}

export default Shdr19;
