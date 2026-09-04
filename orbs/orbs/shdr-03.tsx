/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-03 — a turbulent belt of light girdling the ball, coloured by its
   own distance field.

   Ported from a golfed twigl listing:

     for(float i,z,d;i++<8e1;o+=(cos(d/.1+vec4(0,2,4,0))+1.)/d*z)
     {vec3 p=z*normalize(FC.rgb*2.-r.xyy),
           a=normalize(cos(vec3(4,2,0)+t-d*8.));
      p.z+=5.,a=a*dot(a,p)-cross(a,p);
      for(d=1.;d++<9.;)a+=sin(a*d+t).yzx/d;
      z+=d=.05*abs(length(p)-3.)+.04*abs(a.y);}
     o=tanh(o/1e4);

   What it actually is, decoded:

   - THE FIELD IS A SPHERE PLUS A PLANE, added. abs(length(p) - 3) is the
     distance to a shell of radius three; abs(a.y) is the distance to the
     plane y = 0 of the TURBULENT frame. A sum is small only where both
     terms are, so what lights up is the intersection — a great circle
     round the ball, dragged out of true by eight octaves of warp. A belt,
     not a shell.
   - THE SHELL TERM READS THE RAW POINT AND THE PLANE TERM READS THE
     WARPED ONE. That asymmetry is the whole composition: the ball stays a
     clean sphere while the belt writhes across it. Warp both and the
     sphere goes with it.
   - THE ROTATION AXIS IS FED BY THE PREVIOUS STEP'S DENSITY. The listing
     writes cos(vec3(4,2,0) + t - d*8) where d is left over from the last
     iteration, so the axis — and with it the belt's tilt — settles as the
     ray closes on the surface and swings away from it out in the open. It
     is a one-line feedback loop hiding inside a constant.
   - HUE COMES FROM THE DENSITY, NOT FROM DEPTH. cos(d/.1 + ...) bands the
     colour along the distance field itself, so the belt is contoured in
     rainbow like a topographic map of its own edge — where shdr-18
     colours by depth along the ray and shdr-22 by step index.
   - The weight is z/d, not 1/d: it brightens what is FAR as well as what
     is close to the surface, so the far limb of the belt burns hotter
     than the near one.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT, and this listing hands it over: the shell it
     traces is the ball. All that was needed was the family envelope and
     analytic silhouette to bound the residue, sized past the shell so the
     belt is not shaved at the limb.
   - The golfed rotation, a*dot(a,p) - cross(a,p) with unit a, is an exact
     minus-90-degree Rodrigues — orthonormal, against the README's usual
     warning about golfed rotations. Same construction as shdr-18.
   - The listing relies on d being ZERO on the first iteration, where the
     axis reads it before anything has written it. Uninitialised locals are
     UNDEFINED in GLSL ES 1.0 — explicit here, and it matters more than
     usual because that value steers the geometry rather than a phase.
   - No step-length weighting: 1/d is the density, as in shdr-22 and
     shdr-18, and multiplying by the step would cancel it exactly. The
     clamp bounds it instead.
   - Both singular divisors need floors. The step floor is the BELT WIDTH,
     which is the only material control here.
   - Emitted light, so rgb is already premultiplied and alpha comes from
     the peak channel (see shdr-31).
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. STEPS and
 * TURB are the listing's i++ < 8e1 and d++ < 9 (which runs d = 2..9).
 */
const ECLIPTIC_FRAG = `
#define STEPS 80
#define TURB 8
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float eclipticTurb;
float eclipticPlane;
float eclipticExposure;
float eclipticWidth;

vec3 eclipticRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float animTime = uP_speed; // integrated clock: the warp
  float wander = uP_wander;  // integrated clock: the belt's tilt

  vec3 acc = vec3(0.0);

  // transmittance carried front-to-back — the near belt veils the far one
  float T = 1.0;

  // march only the span the envelope can light, as in shdr-01
  float z = max(uP_camDist - uP_envRadius * 1.3, 0.0);
  float zEnd = uP_camDist + uP_envRadius * 1.3;

  /*
    The listing's feedback variable, explicit. On the first iteration the
    axis below reads this before anything has written it — zero is what the
    golfed version gets, so zero is what it gets here.
  */
  float d = 0.0;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    /*
      The axis, steered by the PREVIOUS step's density: the belt's tilt
      settles as the ray closes on the surface and swings away from it out
      in the open. The three phases are far enough apart that the cosines
      can never null together, so the normalize is safe without a guard.
    */
    vec3 axis = normalize(cos(wander + vec3(4.0, 2.0, 0.0) - d * uP_feedback));

    // the exact minus-90-degree rotation about that axis
    vec3 a = dot(axis, p) * axis - cross(axis, p);

    // eight octaves of plain feedback warp — no lattice quantizer here,
    // unlike its cousins shdr-22 and shdr-04
    for (int j = 0; j < TURB; j++) {
      float f = float(j) + 2.0;
      a += eclipticTurb * sin(a * f + animTime).yzx / f;
    }

    /*
      Sphere plus plane. The shell reads the RAW point so the ball stays a
      ball; the plane reads the WARPED one so the belt writhes across it.
      uP_plane at zero drops the belt and lights the whole shell, which is
      worth being able to see once.
    */
    d = uP_shellW * abs(length(p) - uP_shellR) + eclipticPlane * abs(a.y);
    d = max(d, eclipticWidth);

    /*
      Hue from the DENSITY — the belt contoured in rainbow along its own
      distance field — and the listing's z in the numerator, which burns
      the far limb hotter than the near one.
    */
    vec3 w = cos(d * uP_hue + vec3(0.0, 2.0, 4.0) * uP_spread) + 1.0;
    w *= z / d;
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
  /*
    The SURGE: tightness and warp swept together on one phase, so the belt
    gathers into a hard warped girdle and then opens back into a smooth
    shell. Two params, one gesture — swept apart they read as two unrelated
    things happening at once.

    Absolute bounds rather than a swing around what was dialled, so the range
    is exactly the range: tightness 0.1 to 0.3, warp 0.5 to 1.6. That is why
    the mix sits OUTSIDE the volume terms below — folding the surge under
    them would shave the top of both ranges by whatever the agent happened to
    be doing. At surge zero those terms are all that is left, so a state that
    does not ask for this is untouched.
  */
  float surge = 0.5 - 0.5 * cos(uAnim * 4.0);

  eclipticTurb = mix(uP_turb * (1.0 + 0.4 * uInput), mix(0.5, 1.6, surge), uP_surge);
  // the belt broadens toward a full shell while the agent speaks
  eclipticPlane = mix(uP_plane * (1.0 - 0.35 * uOutput), mix(0.1, 0.3, surge), uP_surge);
  eclipticExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  /*
    The belt BREATHES. At pulse zero the width is exactly what was dialled,
    so a state that does not ask for this is untouched; at one it sweeps the
    whole way from nothing to that width and back, once every few seconds.

    It cannot truly reach zero. Belt width is the march's step floor — see
    the port note above — and a zero step stalls the ray on one point, which
    with no scatter to close the transmittance accumulates the clamp eighty
    times into a white flare. The floor is the param's own minimum, four
    times finer than what the resting belt uses, so it reads as gone.

    Off uAnim rather than a raw clock, so the breath quickens with the agent
    like every other motion in the engine.
  */
  eclipticWidth = max(uP_width * (1.0 - uP_pulse * (0.5 + 0.5 * cos(uAnim * 3.0))), 5e-4);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      acc += eclipticRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = eclipticRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the envelope and transmittance change the
  // accumulator's scale, so the golfed /1e4 knee is a tunable here
  vec3 col = tanh3(acc / max(eclipticExposure, 1.0));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue contour
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

export const shdr03Orb: OrbVariant = {
  key: "shdr-03",
  label: "SHDR-03",
  note: "a turbulent belt of light girdling the ball, contoured in rainbow",
  frag: ECLIPTIC_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.6, integrate: true },
    { key: "wander", label: "Belt tilt drift", min: 0, max: 5, step: 0.02, default: 0.3, integrate: true },
    { key: "feedback", label: "Tilt feedback", min: 0, max: 40, step: 0.1, default: 1.5 },
    { key: "camDist", label: "Camera distance", min: 1, max: 50, step: 0.3, default: 5 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.05, default: 1.05 },
    { key: "shellR", label: "Shell radius", min: 0.2, max: 20, step: 0.1, default: 3 },
    { key: "shellW", label: "Shell weight", min: 0.005, max: 1, step: 0.005, default: 0.12 },
    { key: "plane", label: "Belt tightness", min: 0, max: 1, step: 0.005, default: 0.15 },
    { key: "turb", label: "Warp", min: 0, max: 4, step: 0.02, default: 0.55 },
    { key: "width", label: "Belt width", min: 0.0005, max: 0.4, step: 0.0005, default: 0.004 },
    { key: "pulse", label: "Belt breathing", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "surge", label: "Belt surge", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "hue", label: "Contour hue", min: 0, max: 60, step: 0.1, default: 25 },
    { key: "spread", label: "Colour spread", min: 0, max: 3, step: 0.02, default: 1 },
    { key: "envRadius", label: "Envelope radius", min: 0.15, max: 20, step: 0.1, default: 3.3 },
    { key: "envCore", label: "Envelope core", min: 0.3, max: 1.02, step: 0.01, default: 0.92 },
    { key: "fill", label: "Body fill", min: 0, max: 40, step: 0.05, default: 0.1 },
    { key: "stepClamp", label: "Step clamp", min: 5, max: 20000, step: 25, default: 1500 },
    { key: "scatter", label: "Diffusion", min: 0, max: 0.1, step: 0.0002, default: 0.0006 },
    { key: "exposure", label: "Exposure", min: 20, max: 100000, step: 50, default: 1500 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.05, default: 1.2 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.25 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on BELT TIGHTNESS, which is the only control that changes what
    the object is: high and the light is a single girdle, low and it opens
    out into the whole shell. Warp and belt width carry the rest.
  */
  statePresets: {
    /*
      at rest: a hairline thread on a small, thin shell. The belt is left
      loose — a twentieth of the way to thinking's wire — so it is the WARP,
      more than double what searching carries and the highest steady value of
      the three, that gives the light its shape rather than the plane
      confining it. Hue is pushed warm and the
      envelope opened to its ceiling, which is what lets so fine a line still
      read as a body.
    */
    idle: {
      speed: 0.6,
      wander: 0.3,
      feedback: 2,
      shellR: 2,
      shellW: 0.085,
      plane: 0.085,
      turb: 1.54,
      width: 0.001,
      hue: 39.8,
      spread: 0.94,
      envCore: 1.02,
      stepClamp: 1475,
      exposure: 1450,
      scatter: 0.0006,
      alphaGain: 2
    },
    /*
      searching: the belt BREATHES. Width is on `pulse` at full depth, so the
      band swells from nothing to fifty times the resting belt and closes
      again every few seconds — the state's whole tell, and the reason warp
      drops to under half of idle's: the shape comes from the breathing now,
      not from the noise.

      Under it the belt is also four times tighter than at rest and hunting
      hard — the tilt three times as fast, the axis feedback near quadrupled
      — on a shell pulled small and thin inside a much wider envelope, so
      what pulses is a broad band on a small ball rather than a girdle.
    */
    thinking: {
      speed: 2,
      wander: 1.1,
      feedback: 7.5,
      focal: 1.9,
      shellR: 1.9,
      shellW: 0.005,
      plane: 0.345,
      turb: 0.7,
      width: 0.048,
      pulse: 1,
      hue: 28.3,
      spread: 1.02,
      envRadius: 7.4,
      envCore: 0.84,
      exposure: 2300,
      scatter: 0,
      alphaGain: 2
    },
    /*
      answering: the belt SURGES. Tightness and warp are both on the surge at
      full depth, sweeping 0.1 to 0.3 and 0.5 to 1.6 together about every
      second and a half — from a loose, lightly warped band to a tight warped
      girdle and back. Where thinking pulses one control, this one swings the
      two that decide what the object is, which is why it reads as the
      loudest of the three.

      Tightness starts the sweep at exactly what is dialled here, so the
      preset value is the loose end of the swing; warp does not, and its 0.14
      is only what you would see with the surge turned off. What the preset
      carries either way is the body under them — a broad shell, tilt
      drifting near three times idle's, the axis feedback almost off — plus
      eighteen times the resting belt width to keep the girdle solid at the
      tight end.
    */
    speaking: {
      speed: 0.9,
      wander: 0.84,
      feedback: 0.3,
      shellR: 1.8,
      shellW: 0.19,
      plane: 0.1,
      turb: 0.14,
      width: 0.018,
      surge: 1,
      spread: 1.04,
      envRadius: 3.4,
      exposure: 650,
      scatter: 0.0003,
      alphaGain: 2.7
    }
  },
  // the contour ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest, cooled while searching, warmed while
  // answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#9db8ff" },
    speaking: { tint: "#ffc492" }
  }
};

export type Shdr03Props = Omit<ShaderOrbProps, "variant">;

export function Shdr03({ size = 280, ...rest }: Shdr03Props) {
  return <ShaderOrb variant={shdr03Orb} size={size} {...rest} />;
}

export default Shdr03;
