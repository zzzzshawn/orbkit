/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-18 — a crystal folded out of one eighth of space, tumbling.

   Ported from a golfed twigl listing:

     for(float i,z,d;i++<5e1;o+=(cos(.2*z+vec4(0,2,3,0))+1.)/d/z)
     {vec3 p=z*normalize(FC.rgb*2.-r.xyy),a=normalize(cos(vec3(0,2,4)+t));
      p.z+=4.,a=abs(a*dot(a,p)-cross(a,p));
      z+=d=.3*length(cos(max(a,a.yzx)));}
     o=tanh(o/1e2);

   What it actually is, decoded:

   - THE FOLD IS THE WHOLE ORB. abs() on a 3-vector reflects all eight
     octants into one, so whatever is drawn in that eighth appears seven
     more times, mirrored — the field is forced into the symmetry of a
     crystal without a single explicit mirror plane being written down.
   - max(a, a.yzx) FOLDS AGAIN, on the diagonals. Component-wise max
     against the vector's own rolled swizzle creases the field wherever
     two components are equal, which are exactly the diagonal planes of
     the cube. Between them and the octant fold, the field carries the
     full symmetry of an octahedron.
   - THE ROTATION IS EXACT AND NEGATIVE. a*dot(a,p) - cross(a,p) with unit
     a is Rodrigues at exactly MINUS 90 degrees — shdr-22 decodes the
     same construction with a plus. It matters here beyond handedness:
     the fold happens AFTER the rotation, so the mirror planes are carried
     around by the axis, and the axis wanders on the clock. The crystal
     tumbles; it is not a static mandala with a moving texture.
   - The step and the density are one quantity again, length of a cosine
     of the folded point — periodic, so the crystal repeats through space,
     and small wherever the cosines null together, which lights the cell
     walls.
   - cos(.2*z + vec4(0,2,3,0)) + 1 tints by DEPTH ALONG THE RAY, with the
     channels far enough apart to run most of a hue wheel, and the 1/z
     brightens what is near.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT: the crystal is periodic and fills space, so it
     is bounded by the family's envelope and analytic silhouette. That also
     disposes of the listing's brightest region, which is the 1/z bloom
     sitting on the lens at z near zero — outside the envelope, cut. What
     survives of 1/z inside the ball is a gentle front-to-back shading,
     which is the useful half of it.
   - The golfed rotation IS orthonormal here, against the README's standing
     warning — see above. Left as written.
   - The listing relies on i, z and d starting at zero; uninitialised
     locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - Accumulation is weighted by the step length, as the README requires:
     the step collapses on the cell walls, so an unweighted sum piles up
     hundreds of samples exactly where the field is already brightest.
   - This orb does NOT carry the clamp-normalization line its siblings do
     (shdr-22, shdr-07, orb-nova). Theirs exists because their raw
     step weights run into the hundreds, so the clamp would leak into total
     energy; here the 1/d spike is bounded by the step FLOOR long before
     the clamp sees it, the raw weights are order one, and normalizing
     would only darken everything by a constant.
   - Emitted light, so rgb is already premultiplied and alpha comes from
     the peak channel (see shdr-31).
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. STEPS is
 * the listing's i++ < 5e1.
 */
const OCTANT_FRAG = `
#define STEPS 50
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float octantFold;
float octantFreq;
float octantExposure;

vec3 octantRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float wander = uP_wander; // integrated clock: the axis, and with it the
                            // mirror planes, tumble

  /*
    The wandering axis. Unit by construction, which is what makes the
    rotation below an exact one — and the three phases are far enough
    apart that the cosines can never null together, so the normalize is
    safe without a guard.
  */
  vec3 axis = normalize(cos(wander + vec3(0.0, 2.0, 4.0)));

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — near cells veil far ones
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    // the exact minus-90-degree rotation about the wandering axis
    vec3 a = dot(axis, p) * axis - cross(axis, p);

    /*
      The two folds, both blendable. uP_fold reflects the octants together
      and uP_crease creases the diagonals; at zero the crystal dissolves
      back into an ordinary periodic field, which is worth being able to
      see, because the symmetry is doing more work here than the field is.
    */
    a = mix(a, abs(a), octantFold);
    a = mix(a, max(a, a.yzx), uP_crease);

    // step and density in one quantity, as in the listing
    float d = uP_stepScale * length(cos(a * octantFreq));
    d = max(d, uP_envRadius * 0.004);

    /*
      Depth as hue, near as bright.

      The hue is keyed to depth measured from where the envelope BEGINS,
      not from the camera. The listing marches from the lens out to twenty
      units and cycles its ramp several times over that; bounded to the
      ball, the same .2 slope covers barely a quarter turn of the wheel —
      and the quarter it covers has both green and blue sitting at the
      bottom of their cosines, so the first build of this orb came out a
      flat dark red. Anchored to the ball, the ramp spans it, and moving
      the camera no longer repaints the crystal.

      No step-length weighting here, unlike orb-nova and against the
      README's usual rule — because 1/d IS this shader's density, not an
      artefact of sphere tracing. Multiply it by the step and the two
      cancel exactly, leaving a flat sum with every trace of the cell walls
      gone. The clamp does the job the step weight would have, which is
      also what shdr-22 does with the same construction.
    */
    float zRel = z - (uP_camDist - uP_envRadius);
    vec3 w = cos(uP_hue * zRel + vec3(0.0, 2.0, 3.0) * uP_spread) + 1.0;
    w /= d * max(z, 0.05);
    w = min(w, vec3(uP_stepClamp));

    // envelope: plateau through the ball, cut 12% past the radius so the
    // analytic silhouette in main() still has emission left to cut
    float env = smoothstep(uP_envRadius * 1.12, uP_envRadius * uP_envCore, length(p));
    w = (w + uP_fill) * env;

    acc += T * w;
    T *= exp(-dot(w, vec3(0.299, 0.587, 0.114)) * uP_scatter);

    z += d;
    if (T < 0.004 || z > zEnd) break;
  }

  return acc;
}

void main() {
  octantFold = clamp(uP_fold * (1.0 + 0.3 * uInput), 0.0, 1.0);
  octantFreq = uP_freq * (1.0 + 0.25 * uInput);
  octantExposure = uP_exposure * (1.0 - 0.35 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      acc += octantRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = octantRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e2 knee is a tunable here
  vec3 col = tanh3(acc / max(octantExposure, 0.01));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue cell
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

export const shdr18Orb: OrbVariant = {
  key: "shdr-18",
  label: "SHDR-18",
  note: "a crystal folded out of one eighth of space, tumbling",
  frag: OCTANT_FRAG,
  params: [
    { key: "wander", label: "Tumble", min: 0, max: 5, step: 0.02, default: 0.5, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 4 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.05, default: 1.5 },
    { key: "fold", label: "Octant fold", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "crease", label: "Diagonal crease", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "freq", label: "Crystal frequency", min: 0.1, max: 20, step: 0.05, default: 5 },
    { key: "stepScale", label: "Step scale", min: 0.02, max: 2, step: 0.01, default: 0.3 },
    { key: "hue", label: "Depth hue", min: 0, max: 4, step: 0.01, default: 1.5 },
    { key: "spread", label: "Colour spread", min: 0, max: 3, step: 0.02, default: 1 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 15, step: 0.1, default: 2.1 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 0.9 },
    { key: "fill", label: "Body fill", min: 0, max: 20, step: 0.01, default: 0.02 },
    { key: "stepClamp", label: "Step clamp", min: 1, max: 2000, step: 1, default: 40 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.2, step: 0.001, default: 0.004 },
    { key: "exposure", label: "Exposure", min: 0.2, max: 500, step: 0.5, default: 18 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.05, default: 1.2 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.25 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on the two folds, which is the only orb here where SYMMETRY is
    the mood: a crystal at rest, the mirrors relaxing open while it works,
    and locked hard shut while it answers. The tumble carries the tempo.
  */
  statePresets: {
    // at rest: fully folded, turning slowly — a still crystal
    idle: {
      wander: 0.5,
      fold: 1,
      crease: 1,
      freq: 5,
      exposure: 18,
      scatter: 0.004,
      alphaGain: 2
    },
    /*
      searching: the crystal is pushed BACK and the mirrors loosen a hair.
      The lens nearly doubles so the fold sits deeper in the frame, the
      octant fold slips just under one — enough for the field to drift out
      of register without dissolving — on a tumble twice idle and a
      slightly coarser cell. The step clamp is thrown wide open and the
      diffusion raised fivefold, so the march runs long and the light
      fogs: the brightest state, but hazed rather than sharp.
    */
    thinking: {
      wander: 1.08,
      focal: 2.7,
      fold: 0.91,
      crease: 1,
      freq: 4.1,
      stepClamp: 1200,
      scatter: 0.02,
      exposure: 26,
      alphaGain: 2
    },
    /*
      answering: the mirrors LOCK SHUT again and the crystal goes finer
      than idle, marched on a step nearly twice as long so the cell walls
      read as crisp lines rather than fog. The envelope core drops to half,
      which hollows the ball and leaves the crystal floating in it; the
      depth hue runs faster and the saturation is pushed hard, at less than
      half the idle knee — the sharpest, most coloured state.
    */
    speaking: {
      wander: 0.7,
      fold: 1,
      crease: 1,
      freq: 6.05,
      stepScale: 0.51,
      hue: 2,
      envCore: 0.49,
      exposure: 8,
      scatter: 0.002,
      saturation: 2,
      alphaGain: 2.7
    }
  },
  // the depth ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest, cooled while searching, warmed while
  // answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#9db8ff" },
    speaking: { tint: "#ffc492" }
  }
};

export type Shdr18Props = Omit<ShaderOrbProps, "variant">;

export function Shdr18({ size = 280, ...rest }: Shdr18Props) {
  return <ShaderOrb variant={shdr18Orb} size={size} {...rest} />;
}

export default Shdr18;
