/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-10 — a lattice of light knitted into the ball's own skin.

   Ported from a golfed twigl listing:

     for(float z,d,i;i++<4e1;){
       vec3 p=z*normalize(FC.rgb*2.-r.xyx);
       p=vec3(atan(p.z+=9.,p.x+1.)*2.,.6*p.y+t+t,length(p.xz)-3.);
       for(d=1.;d<7.;d++)p+=sin(p.yzx*d+t+.5*i)/d;
       z+=d=.4*length(vec4(.3*cos(p)-.3,p.z));
       o+=(cos(p.y+i*.4+vec4(6,1,2,0))+1.)/d;}
     o=tanh(o*o/6e3);

   What it actually is, decoded:

   - THE SECOND LINE IS AN UNWRAP. Rewriting the sample as
     (angle, height, radius - 3) is the standard tunnel unwrap: it flattens
     a CYLINDER of radius three into a strip, so the field can be written
     in plain coordinates and still come out wrapped around a pipe.
   - THE DENSITY IS A LATTICE ON THAT SURFACE. length of
     (.3*cos(p) - .3, p.z) is small only where all three cosines sit at one
     — a 3D lattice in unwrapped space — AND p.z is near zero, which is the
     shell. Cells of the lattice that land on the shell light up; the rest
     is empty. A knitted skin, not a volume.
   - EVERY MARCH STEP GETS ITS OWN PHASE. .5*i in the warp and i*.4 in the
     colour mean consecutive samples are not looking at the same field, so
     the sum comes out as layered gauze rather than as forty copies of one
     surface. It is the cheapest volumetric trick in the listing.
   - o*o BEFORE the knee is a contrast squarer, not a tone map, the same
     move shdr-06 ends on.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT, and here that is a ONE TOKEN change: the
     unwrap's radius term reads length(p.xz), the distance from an axis,
     which makes a pipe. Read length(p) instead — the distance from a
     POINT — and the identical field wraps a sphere. This is exactly the
     move the README describes for shdr-20, whose sigmoid cliff became
     the ball's own shell. Nothing else about the listing had to move.
   - THE WRAP MULTIPLIER MUST STAY AN INTEGER. atan jumps by 2*PI across
     the seam behind the ball, so the unwrapped angle jumps by 2*PI times
     the multiplier; every consumer of it here is a sine or cosine of an
     integer multiple, so at integer wrap the jump is a whole number of
     periods and the seam is invisible. The listing's 2 is not decorative.
     Set a fraction and a hard line opens down the back.
   - The listing offsets its axis by one in x, which is a cylinder-axis
     offset with no meaning on a sphere. Dropped.
   - The golfed listing relies on z, d and i starting at zero;
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - No step-length weighting: 1/d is the density, as in shdr-22 and
     shdr-18, and multiplying by the step would cancel it exactly.
   - The accumulator is divided by the step count before the square, so the
     golfed 6e3 knee lands on a number that fits a slider — the same
     normalization as shdr-06, and for the same reason.
   - Emitted light, so rgb is already premultiplied and alpha comes from
     the peak channel (see shdr-31).
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. STEPS and
 * TURB are the listing's i++ < 4e1 and d < 7.
 */
const WEAVE_FRAG = `
#define STEPS 40
#define TURB 6
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float weaveTurb;
float weaveCell;
float weaveExposure;

vec3 weaveRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float animTime = uP_speed;  // integrated clock: the warp
  float scroll = uP_scroll;   // integrated clock: the skin climbs

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — the near skin veils the far one
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  for (int it = 0; it < STEPS; it++) {
    float fi = float(it) + 1.0;
    vec3 world = ro + rd * z;

    /*
      The unwrap, with the listing's cylinder swapped for the ball: angle
      about the axis, height, and distance from the CENTRE less the shell
      radius. uP_wrap wants to stay a whole number — see the header.
    */
    float rl = length(world);
    vec3 p = vec3(
      atan(world.z, world.x) * uP_wrap,
      world.y * uP_climb + scroll,
      rl - uP_shellR
    );

    // six octaves of feedback warp, each march step on its own phase
    for (int j = 0; j < TURB; j++) {
      float dj = float(j) + 1.0;
      p += weaveTurb * sin(p.yzx * dj + animTime + uP_layer * fi) / dj;
    }

    /*
      The lattice. Small only where all three cosines sit at one and the
      sample is on the shell — so the cells of a 3D lattice in unwrapped
      space are cut by the ball's surface, and what is left is a knitted
      skin. uP_cell is the listing's .3: the amplitude of the cosine terms
      against the shell term, and therefore how much the lattice matters
      relative to simply being on the surface.
    */
    float d = uP_stepScale * length(vec4(weaveCell * cos(p) - weaveCell, p.z));
    d = max(d, uP_envRadius * 0.004);

    // colour by unwrapped height, with each step offset again
    vec3 w = cos(p.y + fi * uP_hueStep + vec3(6.0, 1.0, 2.0) * uP_spread) + 1.0;
    w /= d;
    w = min(w, vec3(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, rl);
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) break;
  }

  return acc;
}

void main() {
  weaveTurb = uP_turb * (1.0 + 0.4 * uInput);
  weaveCell = uP_cell * (1.0 + 0.3 * uInput);
  weaveExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      acc += weaveRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = weaveRender(gl_FragCoord.xy);
#endif

  /*
    The listing's knee is tanh(o*o/6e3) over an unnormalized sum of forty
    steps. Dividing by the step count first pulls the square's scale down
    by forty squared, so the same knee lands near four — a number that fits
    on a slider. The square is a contrast squarer, not a tone map.
  */
  vec3 v = acc / float(STEPS);
  vec3 col = tanh3(v * v / max(weaveExposure, 0.0001));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue thread
  // has low luminance but must not go transparent
  float peak = max(col.r, max(col.g, col.b));
  float a = clamp(peak * uP_alphaGain, 0.0, 1.0);

  // Analytic silhouette — identical construction to shdr-01: exact
  // ray-to-centre distance against the radius, colour AND alpha.
  vec3 mrd = normalize(vec3(orbUV(), -uP_focal));
  float closest = length(cross(vec3(0.0, 0.0, uP_camDist), mrd));
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(uP_envRadius * (1.0 - band), uP_envRadius * 1.005, closest);
  col *= mask;
  a *= mask;

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

export const shdr10Orb: OrbVariant = {
  key: "shdr-10",
  label: "SHDR-10",
  note: "a lattice of light knitted into the ball's own skin",
  frag: WEAVE_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.6, integrate: true },
    { key: "scroll", label: "Climb", min: 0, max: 8, step: 0.03, default: 1.2, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 7 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.05, default: 2 },
    { key: "shellR", label: "Shell radius", min: 0.2, max: 20, step: 0.1, default: 2.6 },
    { key: "wrap", label: "Wraps around", min: 1, max: 14, step: 1, default: 8 },
    { key: "climb", label: "Band spacing", min: 0.05, max: 12, step: 0.05, default: 4 },
    { key: "turb", label: "Warp", min: 0, max: 3, step: 0.02, default: 0.35 },
    { key: "layer", label: "Layer offset", min: 0, max: 2, step: 0.01, default: 0.5 },
    { key: "cell", label: "Lattice weight", min: 0, max: 2, step: 0.01, default: 0.45 },
    { key: "stepScale", label: "Step scale", min: 0.02, max: 3, step: 0.005, default: 0.15 },
    { key: "hueStep", label: "Layer hue", min: 0, max: 3, step: 0.01, default: 0.4 },
    { key: "spread", label: "Colour spread", min: 0, max: 3, step: 0.02, default: 1 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 20, step: 0.1, default: 2.9 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 0.92 },
    { key: "fill", label: "Body fill", min: 0, max: 40, step: 0.05, default: 0.1 },
    { key: "stepClamp", label: "Step clamp", min: 5, max: 5000, step: 5, default: 300 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.2, step: 0.0005, default: 0.004 },
    { key: "exposure", label: "Exposure", min: 0.05, max: 500, step: 0.5, default: 30 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.05, default: 1.15 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.2 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on LATTICE WEIGHT, which decides whether the ball wears a knitted
    net or a smooth shell, and on the two clocks, which are integrated and
    so change rate without ever jumping phase.

    THE LAYER OFFSET IS STAGED ONLY ON A BUDGET, and the budget is
    arithmetic rather than taste. It multiplies the SAMPLE INDEX inside the
    warp — sin(... + uP_layer * fi), with fi running to forty — so it is a
    phase rate across the stack, not an amount: a step of D moves the
    deepest sample by 40*D radians while the nearest barely moves. The old
    0.5 -> 2 stage was 60 radians, nine and a half turns, and the skin
    boiled through every arrangement in between instead of cross-fading.

    Hold |D| at or under 2*PI/40, about 0.157, and even the deepest sample
    travels less than one full turn, which reads as the layers settling.
    Resting sits at 0.5 and searching at 0.65 — 0.15, just inside it — and
    answering stays at 0.5, so every transition in the set is within one
    turn. Anything wider has to be reached with lattice weight and warp
    instead: both are plain amplitudes, and both glide cleanly.

    COLOUR SPLIT is staged on the same budget and the same reasoning. It
    scales a fixed vec3 inside the hue cosine, so its worst channel moves
    six radians per unit; searching's step of 0.55 is about half a turn on
    that channel, which crossfades. A step past one unit would not.

    Wraps around never moves either: it must stay a whole number or the seam
    opens, and a slider gliding through 1.5 would tear the ball open in the
    middle of a transition. Band spacing and layer hue are held for the same
    class of reason — both are frequencies read off a coordinate.
  */
  statePresets: {
    // at rest: an open net climbing slowly
    idle: {
      speed: 0.6,
      scroll: 1.2,
      turb: 0.35,
      cell: 0.45,
      exposure: 30,
      scatter: 0.004,
      alphaGain: 2
    },
    /*
      searching: the net DECOHERES. Three things pull in the same direction.
      Lattice weight drops to two thirds of resting's, so the cosine terms
      no longer close hard on their cells; the warp runs at nearly two and a
      half times resting and churns what is left of them; and the layer
      offset steps up by 0.15 — the whole phase budget above, and as far as
      the forty samples can be pushed out of agreement without the
      transition boiling.

      And it is BRIGHT. The knee drops to well under half resting's — near
      answering's, so this is no longer the dim state — with saturation
      raised half again over resting, contrast pulled back so nothing
      crushes, and the colour split opened to 1.55, which spreads the three
      channels further apart in phase and is what turns the decohering skin
      into full spectrum rather than a blue haze. The tint goes with it:
      near white with only a cool cast, where a saturated blue would have
      thrown all that colour away again.

      Step scale drops to two thirds under all of it, so the ray resolves
      finer detail over less depth, and the diffusion stays low enough that
      the far side still shows through.
    */
    thinking: {
      speed: 1.9,
      scroll: 0.5,
      turb: 0.85,
      layer: 0.65,
      cell: 0.3,
      stepScale: 0.09,
      spread: 1.55,
      fill: 0.12,
      exposure: 13,
      scatter: 0.006,
      contrast: 1.05,
      saturation: 1.7,
      alphaGain: 2.6
    },
    /*
      answering: the net SNAPS IN. Lattice weight goes to more than twice
      resting's and nearly five times searching's, so the cells close hard
      and the skin reads as knitted rope rather than gauze, with the warp
      down to a fifth of searching's so nothing blurs it.

      And it CLIMBS: the scroll clock runs three and a half times resting's,
      the fastest of the three, so the whole net travels up the ball while
      holding its shape. The knee drops to a quarter of searching's and the
      alpha gain lifts — this is unmistakably the bright state.
    */
    speaking: {
      speed: 1,
      scroll: 4.2,
      turb: 0.18,
      cell: 0.95,
      exposure: 11,
      scatter: 0.0015,
      contrast: 0.9,
      saturation: 1.45,
      alphaGain: 2.8
    }
  },
  // the height ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest, barely cooled while searching — a
  // saturated blue there would cancel the colour split that state is built
  // on — and warmed while answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#e8f4ff" },
    speaking: { tint: "#ffc492" }
  }
};

export type Shdr10Props = Omit<ShaderOrbProps, "variant">;

export function Shdr10({ size = 280, ...rest }: Shdr10Props) {
  return <ShaderOrb variant={shdr10Orb} size={size} {...rest} />;
}

export default Shdr10;
