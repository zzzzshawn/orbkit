/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-12 — a ball built from glossy toy bricks, studs up.

   THE ORB IS THE OBJECT: the sphere is assembled from interlocking plastic
   bricks the way a brick-built globe is. A DDA march walks a rectilinear
   lattice whose cells are one stud wide and one brick tall (bricks are 1.2
   stud pitches high, the real proportion); a cell is solid wherever its
   centre sits inside the unit sphere.

   What sells the toy:

   - BRICKWORK BONDING: bricks are 2x4 studs. Each layer alternates its
     long axis, and every (layer, row) course staggers by a hashed offset —
     so seams never align vertically, exactly like a proper build. A cell
     maps to its owning brick analytically; the brick id drives colour,
     mold variance, seams and the rebuild blink.
   - STUDS: every upward face gets its stud embossed — a perturbed normal
     around the stud rim, a lifted highlight on the cap and a contact ring
     outside it. The lighting does the work; the silhouette stays brick.
   - SEAMS: thin dark joints drawn only on true brick boundaries (the two
     axes tangent to the struck face), not around every stud.
   - PLASTIC: five tunable brick colours picked per brick — the patch
     parameter slides the palette from per-brick confetti to big moulded
     colour regions — with a white Blinn specular for the ABS sheen.
   - REBUILD: bricks in the outer two courses blink out and back on an
     integrated clock, revealing the darker bricks beneath. Idle loses an
     occasional brick; THINKING churns the whole shell — the ball visibly
     rebuilding itself — and speaking snaps it whole, fast and glossy.

   Construction notes:

   - The march is BOUNDED by an analytic sphere just past the brick
     corners, so empty pixels cost two dot products. No noise runs in the
     solid test — interior cells answer with one length() — which makes
     this one of the cheapest marched orbs in the library.
   - The DDA is anisotropic (cell height differs from pitch): the standard
     Amanatides & Woo setup generalizes by using per-axis cell sizes.
   - No fwidth, no round, constant loop bound with inner breaks —
     GLSL ES 1.0 throughout, as everywhere in this repo.
   - Surface-lit and hit-bounded, so alpha IS coverage — premultiplied
     output (trivially: hits are opaque, misses are clear).
---------------------------------------------------------------------------- */

const BRICK_FRAG = `
#define STEPS 96

// Per-fragment constants, resolved once in main().
vec3 lgCell;  // cell sizes: (stud pitch, brick height, stud pitch)
float lgGap;

// Brick-lookup results (GLSL ES 1.0 has no out-struct ergonomics).
vec3 lgBid;     // unique id of the owning brick
float lgOff;    // long-axis stagger offset of its course, in studs
float lgOrient; // 0: long axis runs along x, 1: along z

mat2 lgRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/*
  Which 2x4 brick owns this stud cell? Layers alternate their long axis
  and every (layer, row) course staggers by a hashed offset — brickwork
  bonding, so vertical seams never stack.
*/
void lgBrick(vec3 cellIdx) {
  lgOrient = mod(cellIdx.y, 2.0);
  float lc = lgOrient < 0.5 ? cellIdx.x : cellIdx.z;
  float sc = lgOrient < 0.5 ? cellIdx.z : cellIdx.x;
  float srow = floor(sc / 2.0);
  lgOff = floor(hash(vec2(cellIdx.y * 3.17, srow * 7.31)) * 4.0);
  lgBid = vec3(floor((lc + lgOff) / 4.0), cellIdx.y, srow + lgOrient * 913.0);
}

/*
  The world function: inside the ball, minus bricks currently blinked out
  of the outer two courses. Interior cells answer with a single length —
  the brick lookup only runs in the shell.
*/
float lgSolid(vec3 cc) {
  float r = length(cc);
  if (r >= 1.0) return 0.0;
  if (r > 1.0 - 2.2 * lgCell.y) {
    lgBrick(floor(cc / lgCell));
    float blink = fract(hash(lgBid.xy * 0.173 + lgBid.z * 0.089) + uP_rebuild * 0.03);
    if (blink < lgGap) return 0.0; // this brick is off the build right now
  }
  return 1.0;
}

void main() {
  // Volume coupling: agent output stokes the sheen and the gain; user
  // input brightens the key light.
  float glossNow = uP_gloss * (0.7 + 0.9 * uOutput);
  float gainNow = uP_gain * (0.92 + 0.25 * uOutput);
  float lightNow = uP_light * (1.0 + 0.3 * uInput);

  float pitch = 2.0 / clamp(uP_studs, 8.0, 48.0);
  lgCell = vec3(pitch, pitch * 1.2, pitch); // real brick proportion
  lgGap = clamp(uP_gap, 0.0, 0.9);

  float bound = 1.0 + length(lgCell) * 0.5 + 0.001;

  vec2 uv = orbUV() / uP_radius;
  vec3 ro = vec3(uv * bound, 2.6);
  vec3 rd = vec3(0.0, 0.0, -1.0);

  // rotate the RAY into object space (inverse tumble) — the lattice stays
  // axis-aligned and the studs stay up while the ball turns. Light and
  // view rotate along, keeping the sun fixed relative to the viewer.
  mat2 tiltM = lgRot(uP_tilt); // positive tilt looks DOWN at the studs
  mat2 spinM = lgRot(-uP_spin); // integrated clock
  ro.yz = tiltM * ro.yz;
  ro.xz = spinM * ro.xz;
  rd.yz = tiltM * rd.yz;
  rd.xz = spinM * rd.xz;
  vec3 Lo = normalize(vec3(-0.5, 0.7, 0.55));
  Lo.yz = tiltM * Lo.yz;
  Lo.xz = spinM * Lo.xz;
  vec3 Vo = vec3(0.0, 0.0, 1.0);
  Vo.yz = tiltM * Vo.yz;
  Vo.xz = spinM * Vo.xz;

  // DDA needs nonzero direction components — nudge, keep the sign
  vec3 sgn = vec3(
    rd.x >= 0.0 ? 1.0 : -1.0,
    rd.y >= 0.0 ? 1.0 : -1.0,
    rd.z >= 0.0 ? 1.0 : -1.0
  );
  rd = normalize(sgn * max(abs(rd), vec3(1.0e-4)));

  // analytic bounding sphere: empty pixels exit here
  float b = dot(rd, ro);
  float c = dot(ro, ro) - bound * bound;
  float disc = b * b - c;
  if (disc < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float sq = sqrt(disc);
  vec3 p0 = ro + rd * (-b - sq + pitch * 0.001);
  float tSpan = 2.0 * sq;

  // Amanatides & Woo, anisotropic cells: per-axis sizes throughout
  vec3 vp = floor(p0 / lgCell);
  vec3 tDelta = lgCell / abs(rd);
  vec3 tMax = ((vp + step(vec3(0.0), rd)) * lgCell - p0) / rd;

  float hitF = 0.0;
  vec3 mask = vec3(0.0, 0.0, 1.0); // first-voxel fallback: face the viewer
  float tCur = 0.0;

  for (int i = 0; i < STEPS; i++) {
    if (lgSolid((vp + 0.5) * lgCell) > 0.5) {
      hitF = 1.0;
      break;
    }
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      tCur = tMax.x;
      tMax.x += tDelta.x;
      vp.x += sgn.x;
      mask = vec3(1.0, 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      tCur = tMax.y;
      tMax.y += tDelta.y;
      vp.y += sgn.y;
      mask = vec3(0.0, 1.0, 0.0);
    } else {
      tCur = tMax.z;
      tMax.z += tDelta.z;
      vp.z += sgn.z;
      mask = vec3(0.0, 0.0, 1.0);
    }
    if (tCur > tSpan) break; // left the bound: miss
  }

  if (hitF < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // the hit cell, its brick, and the struck face
  vec3 cc = (vp + 0.5) * lgCell;
  float r = length(cc);
  vec3 dir = cc / max(r, 1.0e-4);
  lgBrick(vp);
  vec3 n = -mask * sgn;
  vec3 hp = p0 + rd * tCur;

  /*
    Brick colour: a per-brick hash picks one of the five plastic colours.
    The patch parameter slides the pick toward a smooth field over the
    sphere, so 0 is per-brick confetti and 1 is big moulded colour
    regions; the field is range-stretched so all five colours appear.
  */
  float cph = hash(lgBid.xy * 1.37 + lgBid.z * 0.91);
  float rn = noise(dir.xy * 2.6 + 7.0) * 0.5 + noise(dir.yz * 2.6 + 13.0) * 0.5;
  rn = clamp(0.5 + (rn - 0.5) * 2.2, 0.0, 0.999);
  float idx = floor(clamp(mix(cph, rn, clamp(uP_patch, 0.0, 1.0)), 0.0, 0.999) * 5.0);
  vec3 albedo = idx < 0.5 ? uC_brickA
    : (idx < 1.5 ? uC_brickB
    : (idx < 2.5 ? uC_brickC
    : (idx < 3.5 ? uC_brickD : uC_brickE)));
  albedo *= 0.93 + 0.14 * hash(lgBid.xy * 0.53 + lgBid.z * 1.7); // mold variance

  /*
    Seams: distance to the nearest BRICK boundary along each lattice axis,
    from the continuous within-brick coordinates. Only the two axes
    tangent to the struck face draw — stud grid lines never do.
  */
  vec3 sp = hp / lgCell;
  float lcC = lgOrient < 0.5 ? sp.x : sp.z;
  float scC = lgOrient < 0.5 ? sp.z : sp.x;
  float u4 = fract((lcC + lgOff) / 4.0);
  float v2 = fract(scC / 2.0);
  float wY = fract(sp.y);
  float dL = min(u4, 1.0 - u4) * 4.0 * pitch;
  float dS = min(v2, 1.0 - v2) * 2.0 * pitch;
  float dY = min(wY, 1.0 - wY) * lgCell.y;
  float seamD;
  if (mask.y > 0.5) seamD = min(dL, dS);
  else if (mask.x > 0.5) seamD = min(dY, lgOrient < 0.5 ? dS : dL);
  else seamD = min(dY, lgOrient < 0.5 ? dL : dS);
  float seam = (1.0 - smoothstep(0.0, 0.07 * pitch, seamD)) * clamp(uP_seam, 0.0, 1.0);

  /*
    Studs, embossed the way the real brick photographs: the normal tilts
    hard around the stud shoulder so the light wraps it like a cylinder
    edge, the cap lifts, a contact shadow falls on the side facing away
    from the light, and a faint ring engraved into the cap stands in for
    the moulded logo.
  */
  vec3 nEff = n;
  float studF = 0.0;
  float shadowF = 0.0;
  float engrave = 0.0;
  float studAmt = clamp(uP_stud, 0.0, 1.0);
  if (mask.y > 0.5 && n.y > 0.5) {
    vec2 cuv = fract(hp.xz / pitch) - 0.5;
    float sd = length(cuv);
    float rim = smoothstep(0.14, 0.29, sd) * (1.0 - smoothstep(0.29, 0.335, sd));
    vec3 tiltN = normalize(vec3(cuv.x, 0.42, cuv.y));
    nEff = normalize(mix(n, tiltN, rim * studAmt));
    studF = 1.0 - smoothstep(0.285, 0.33, sd);
    vec2 lxz = normalize(Lo.xz + vec2(1.0e-5));
    float away = clamp(dot(normalize(cuv + vec2(1.0e-5)), -lxz), 0.0, 1.0);
    shadowF = smoothstep(0.47, 0.335, sd) * (1.0 - studF) * (0.35 + 0.65 * away);
    engrave = smoothstep(0.11, 0.135, sd) * (1.0 - smoothstep(0.155, 0.18, sd)) * studF;
  }

  // plastic shading: lambert + wrap for roundness + white Blinn sheen,
  // dimmed toward the interior so revealed under-bricks read as inside
  float lam = clamp(dot(nEff, Lo), 0.0, 1.0);
  float wrap = clamp(dot(dir, Lo) * 0.5 + 0.5, 0.0, 1.0);
  float depthDim = mix(1.0, 0.55, clamp((1.0 - r) / (3.0 * lgCell.y), 0.0, 1.0));
  float shade = (0.34 + 0.42 * wrap * wrap + 0.8 * lam * lightNow) * depthDim;

  vec3 col = albedo * shade * (1.0 + 0.1 * studF);
  col *= 1.0 - shadowF * 0.38 * studAmt; // stud contact shadow
  col *= 1.0 - engrave * 0.14 * studAmt; // moulded logo ring

  // chamfered edge: a thin bright bevel line just inside the dark joint,
  // catching the light the way the real brick's edges do
  float bevel = smoothstep(0.05 * pitch, 0.085 * pitch, seamD)
    * (1.0 - smoothstep(0.085 * pitch, 0.16 * pitch, seamD));
  col += albedo * bevel * (0.18 + 0.5 * lam) * clamp(uP_seam, 0.0, 1.0);
  col *= 1.0 - seam * 0.8; // dark joints

  // two-lobe plastic sheen: a sharp hotspot over a broad soft gloss
  float ndh = clamp(dot(nEff, normalize(Lo + Vo)), 0.0, 1.0);
  float spec = pow(ndh, 48.0) + 0.22 * pow(ndh, 8.0);
  col += vec3(1.0) * spec * glossNow * (1.0 - seam) * depthDim;

  col *= gainNow;
  col = pow(max(col, 0.0), vec3(uP_contrast));

  // Surface-lit orb bounded by the hit test: alpha IS coverage, and a hit
  // is fully opaque — premultiplied output, trivially (see shdr-28).
  gl_FragColor = vec4(col, 1.0);
}
`;

export const shdr12Orb: OrbVariant = {
  key: "shdr-12",
  label: "SHDR-12",
  note: "a ball of glossy toy bricks, studs up — it rebuilds itself while it thinks",
  frag: BRICK_FRAG,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 5, step: 0.03, default: 0.25, integrate: true },
    { key: "tilt", label: "Tilt", min: 0, max: 4, step: 0.02, default: 0.55 },
    { key: "rebuild", label: "Rebuild rate", min: 0, max: 20, step: 0.1, default: 0.4, integrate: true },
    { key: "gap", label: "Missing bricks", min: 0, max: 0.8, step: 0.01, default: 0.07 },
    { key: "studs", label: "Studs", min: 8, max: 48, step: 1, default: 18 },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.95 },
    { key: "patch", label: "Colour patches", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "stud", label: "Stud relief", min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: "seam", label: "Seams", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "gloss", label: "Gloss", min: 0, max: 3, step: 0.02, default: 1 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 1 },
    { key: "gain", label: "Gain", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1 }
  ],
  colors: [
    { key: "brickA", label: "Red", default: "#c4281c" },
    { key: "brickB", label: "Yellow", default: "#f2cd37" },
    { key: "brickC", label: "Blue", default: "#1e5aa8" },
    { key: "brickD", label: "Green", default: "#00852b" },
    { key: "brickE", label: "White", default: "#f4f4f4" }
  ],
  /*
    The rebuild blink is the state read:

      idle SETTLES     lazy tumble, an occasional brick popped off the shell
      thinking BUILDS  the tumble all but stops while the outer courses
                       churn — bricks blinking out and back everywhere,
                       the ball visibly rebuilding itself
      speaking SNAPS   whole and glossy: the gaps close, the sheen flares,
                       and the ball turns fast to answer

    Two controls are deliberately NOT staged, and both for the same reason:
    they quantize, so easing them steps instead of fading. STUDS sets the
    grid pitch, and a gliding pitch re-tiles the whole shell — the ball
    reads as inflating rather than changing mood. COLOUR PATCHES lands
    inside a floor() that picks one of the five brick colours, so easing it
    flips bricks between colours one at a time, which reads as a fault
    rather than a transition. Everything staged below is either an
    amplitude or one of the two integrated clocks, whose rate can change
    without their phase ever jumping.

    The surface finish carries as much of the read as the blink does:
    searching wears full stud relief and hard seams on a matt gloss — every
    brick edge visible, an object mid-assembly — and answering flattens the
    studs, sinks the seams and flares the sheen, so it resolves into one
    moulded piece.
  */
  statePresets: {
    idle: {
      spin: 0.25,
      rebuild: 0.4,
      gap: 0.07,
      gloss: 1,
      gain: 1,
      light: 1
    },
    thinking: {
      spin: 0.03,
      tilt: 0.9,
      rebuild: 9,
      gap: 0.55,
      stud: 1,
      seam: 0.95,
      gloss: 0.55,
      gain: 1.05,
      light: 1.15,
      contrast: 1.05
    },
    speaking: {
      spin: 1.6,
      tilt: 0.42,
      rebuild: 0.5,
      gap: 0,
      stud: 0.6,
      seam: 0.3,
      gloss: 2.4,
      gain: 1.25,
      light: 1.35,
      contrast: 0.95
    }
  },
  /*
    Answering swaps the whole box out. Resting and searching keep the
    classic five above — that palette is the joke, and it should be what
    the orb looks like most of the time — but the state that snaps whole
    and glossy gets a hot set to snap INTO: the same five slots, pushed to
    high chroma, so the sheen at gloss 2.4 has something saturated to sit
    on rather than a flat primary.

    Safe to stage, unlike the patch control that picks between these. Each
    brick keeps its slot through the change and only the colour in that
    slot eases, so the shell cross-fades where flipping bricks between
    slots would pop. Omitting idle and thinking is deliberate: an unlisted
    state falls back to the colour defaults, which is exactly the classic
    palette.
  */
  stateColors: {
    speaking: {
      brickA: "#ff3b6b",
      brickB: "#ffc93c",
      brickC: "#21d4fd",
      brickD: "#7af5a0",
      brickE: "#ffffff"
    }
  }
};

export type Shdr12Props = Omit<ShaderOrbProps, "variant">;

export function Shdr12({ size = 280, ...rest }: Shdr12Props) {
  return <ShaderOrb variant={shdr12Orb} size={size} {...rest} />;
}

export default Shdr12;
