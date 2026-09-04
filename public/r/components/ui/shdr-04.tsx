/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-04 — a hollow shell of light, faceted by a voxel lattice, approached
   but never reached.

   Ported from a golfed twigl listing:

     vec3 p;
     for(float i,z,f;i++<5e1;z+=f=.003+.1*abs(length(p)-5.),o.rgb+=(p/z+.8)/f)
       for(p=z*(FC.rgb*2.-r.xyy)/r.y,p.z+=9.,f=1.;f++<7.;
           p+=sin(round(p.zxy/.1)*.1*f-t)/f);
     o=tanh(o/2e3);

   What it actually is, decoded:

   - THE SUBJECT IS A SPHERE, written down as one. abs(length(p) - 5) is
     the distance to a shell of radius five, and the march sphere-traces
     it. Of all the listings in this library this is the only one that did
     not have to be argued onto a ball — it was already one.
   - THE MARCH NEVER ARRIVES. The step is a tenth of the distance to the
     shell, so the remaining gap falls by 10% per step and after fifty
     steps is half a percent of where it started: an asymptotic approach
     from outside that never crosses. Every step accumulates 1/step, so
     the sum is dominated by the last few and the shell reads as a glowing
     surface rather than as anything the ray passes through. The .003 floor
     is the only thing bounding that sum, which makes it the SURFACE
     WIDTH — the closest this shader has to a material.
   - THE LATTICE PITCH IS FIXED ACROSS OCTAVES. round(p.zxy/.1)*.1 snaps
     to a tenth-unit grid, and the octave index f multiplies the PHASE,
     never the lattice. So all six octaves quantize on the SAME grid and
     the displacement is piecewise constant on it — the shell comes out
     faceted at one crisp scale instead of fractally rough. That is the
     opposite of how shdr-22 and shdr-07 use the same trick, where
     each octave gets its own lattice.
   - THE COLOUR IS THE POSITION. p/z is the warped point over the distance
     travelled, so x, y and z paint red, green and blue and the whole thing
     washes toward the .8 white floor as the ray goes deeper. Near facets
     are strongly coloured; far ones are white.

   Port decisions, each one a documented trap or rule in the README:

   - round() is ES 3.0 and does not exist in GLSL ES 1.0 — hand-written as
     floor(x + 0.5).
   - The march starts at the camera rather than at an envelope bound, which
     is the reverse of the choice shdr-22 and orb-nova make. Here the
     APPROACH IS THE IMAGE: skipping ahead to the shell would discard the
     geometric ramp that builds the glow, and the first samples' large p/z
     are what tint the near side.
   - The listing leaves its ray direction unnormalized, so its z is not a
     distance and its .003 and .1 are in a units system that depends on the
     lens. Normalized here, which makes those two numbers mean what they
     say and lets camera distance and lens move independently.
   - The golfed listing relies on i, z and p starting at zero;
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here. p in
     particular is read by the step expression BEFORE the inner loop has
     ever written it, on the first iteration only.
   - Emitted light, so rgb is already premultiplied and alpha comes from
     the peak channel (see shdr-31).
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. STEPS and
 * TURB are the listing's i++ < 5e1 and f++ < 7 (which runs f = 2..7).
 */
const GEODE_FRAG = `
#define STEPS 50
#define TURB 6
#define AA 1

// Volume-reactive values, resolved once per fragment in main().
float geodeTurb;
float geodeWidth;
float geodeExposure;

// GLSL ES 1.0 has no round() — it arrived in ES 3.0. The listing quantizes
// with it, so it ships here.
vec3 roundv(vec3 x) { return floor(x + 0.5); }

vec3 geodeRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, uP_camDist);
  vec3 rd = normalize(vec3(uv, -uP_focal));

  float animTime = uP_speed; // integrated clock
  float shellR = uP_shellR;
  float pitch = max(uP_pitch, 0.002);

  // the run-away bound for rays that miss the shell entirely
  float zEnd = uP_camDist + shellR * 2.5;

  vec3 acc = vec3(0.0);

  // The listing starts its march at the camera and lets the trace do the
  // travelling — see the header. z is the distance already walked.
  float z = 0.0;

  for (int it = 0; it < STEPS; it++) {
    vec3 p = ro + rd * z;

    /*
      Six octaves on ONE lattice. The pitch never changes; only the phase
      multiplier does, so the displacement is piecewise constant on a
      single grid and the shell facets at one scale.
    */
    for (int j = 0; j < TURB; j++) {
      float f = float(j) + 2.0;
      p += geodeTurb * sin(roundv(p.zxy / pitch) * pitch * f - animTime) / f;
    }

    /*
      Sphere trace toward the shell, on the WARPED point — so the facets
      are what the ray is chasing, not a smooth ball underneath them. The
      slack is the listing's tenth, and the floor is the surface width.
    */
    float d = geodeWidth + uP_slack * abs(length(p) - shellR);

    z += d;

    /*
      Position as colour, washing toward white with depth. Guarded on z:
      the listing gets away with reading p/z here because its comma
      operator advances z first, which is worth knowing before anyone
      reorders these two lines.
    */
    acc += (p * uP_hueGain / max(z, 1e-3) + uP_floorLevel) / d;

    if (z > zEnd) break;
  }

  return acc;
}

void main() {
  geodeTurb = uP_turb * (1.0 + 0.5 * uInput);
  geodeWidth = max(uP_width * (1.0 - 0.4 * uOutput), 0.0002);
  geodeExposure = uP_exposure * (1.0 - 0.3 * uOutput);

  vec3 acc = vec3(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = (vec2(float(mx), float(my)) + 0.5) / float(AA) - 0.5;
      acc += geodeRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = geodeRender(gl_FragCoord.xy);
#endif

  // tanh tone map per channel — the golfed /2e3 knee is a tunable here
  vec3 col = tanh3(acc / max(geodeExposure, 1.0));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // alpha from the brightest channel, not luminance — a deep blue facet
  // has low luminance but must not go transparent
  float peak = max(col.r, max(col.g, col.b));
  float a = clamp(peak * uP_alphaGain, 0.0, 1.0);

  /*
    Analytic silhouette against the shell, widened by uP_envScale because
    the turbulence pushes the visible surface OUT past the nominal radius —
    cut at the bare radius and the facets would be shaved flat all round
    the limb.
  */
  vec3 mrd = normalize(vec3(orbUV(), -uP_focal));
  float closest = length(cross(vec3(0.0, 0.0, uP_camDist), mrd));
  float sil = uP_shellR * uP_envScale;
  float band = mix(0.35, 0.012, clamp(uP_edge, 0.0, 1.0));
  float mask = 1.0 - smoothstep(sil * (1.0 - band), sil * 1.005, closest);
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

export const shdr04Orb: OrbVariant = {
  key: "shdr-04",
  label: "SHDR-04",
  note: "a hollow shell of light, faceted by a voxel lattice",
  frag: GEODE_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.6, integrate: true },
    { key: "camDist", label: "Camera distance", min: 1, max: 60, step: 0.3, default: 9 },
    { key: "focal", label: "Lens", min: 0.15, max: 15, step: 0.05, default: 1.35 },
    { key: "shellR", label: "Shell radius", min: 0.3, max: 20, step: 0.1, default: 5 },
    { key: "pitch", label: "Facet size", min: 0.005, max: 1.5, step: 0.005, default: 0.3 },
    { key: "turb", label: "Displacement", min: 0, max: 5, step: 0.02, default: 0.45 },
    { key: "slack", label: "Trace slack", min: 0.01, max: 0.9, step: 0.005, default: 0.1 },
    { key: "width", label: "Surface width", min: 0.0005, max: 0.3, step: 0.0005, default: 0.003 },
    { key: "hueGain", label: "Position hue", min: 0, max: 6, step: 0.02, default: 1 },
    { key: "floorLevel", label: "White floor", min: 0, max: 4, step: 0.02, default: 0.8 },
    { key: "envScale", label: "Silhouette margin", min: 1, max: 2, step: 0.01, default: 1.16 },
    { key: "exposure", label: "Exposure", min: 20, max: 40000, step: 20, default: 3000 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 15, step: 0.1, default: 1.3 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.3 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 15, step: 0.1, default: 2 },
    { key: "edge", label: "Edge sharpness", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "edgeFade", label: "Halo falloff", min: 0.1, max: 3, step: 0.015, default: 0.98 }
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ffffff" }],
  /*
    Staged on displacement — how far the lattice pushes the shell out of
    round — and on surface width, which is the only material control this
    shader has.

    FACET SIZE was held still across all three for a reason: it is a
    quantizer, and a gliding quantizer pops instead of fading (the same rule
    as shdr-14's cell grid and shdr-17's grain). Answering now moves it, 0.3
    to 0.22, so the lattice re-snaps through the half second either side of
    that state rather than cross-fading. Deliberate — see the note there.
  */
  statePresets: {
    // at rest: a shallow crust, the surface held thin and bright
    idle: {
      speed: 0.6,
      turb: 0.45,
      width: 0.003,
      slack: 0.1,
      hueGain: 1,
      exposure: 3000,
      contrast: 1.3
    },
    /*
      searching: the lattice pushes HARD — displacement nearly doubled —
      and the surface pulls to under half its idle width, so the facets
      read as sharp shifting plates. The knee rises with them: this is the
      dim, brittle state.
    */
    thinking: {
      speed: 1.8,
      turb: 0.85,
      width: 0.0012,
      slack: 0.07,
      hueGain: 1.7,
      exposure: 4800,
      contrast: 1.75
    },
    /*
      answering: plates AND lamp, which the other two never are at once. The
      lattice pushes almost as hard as it does while searching — 0.8 against
      0.85 — but on ten times the idle surface width instead of a third of
      it, so the facets stay sharp while the shell they sit on is wide open
      and bright. Fastest of the three, on the widest silhouette margin, and
      the most saturated.

      Two things here break the file's own rules on purpose. Facet size drops
      to 0.22, so the quantizer glides on the way in and out and the lattice
      re-snaps rather than fading; see the staging note above. And the tint
      goes COOL — cyan, cooler than the searching blue — against the warm
      answering tint the colour note below describes.
    */
    speaking: {
      speed: 2,
      pitch: 0.22,
      turb: 0.8,
      width: 0.032,
      slack: 0.165,
      hueGain: 0.5,
      floorLevel: 0.82,
      envScale: 1.67,
      exposure: 1220,
      contrast: 0.92,
      saturation: 1.66
    }
  },
  // the position ramp supplies the colour, so the tint only shifts its
  // temperature: neutral at rest and cool for both of the busy states —
  // blue while searching, a brighter cyan while answering
  stateColors: {
    idle: { tint: "#ffffff" },
    thinking: { tint: "#9db8ff" },
    speaking: { tint: "#94f3ff" }
  }
};

export type Shdr04Props = Omit<ShaderOrbProps, "variant">;

export function Shdr04({ size = 280, ...rest }: Shdr04Props) {
  return <ShaderOrb variant={shdr04Orb} size={size} {...rest} />;
}

export default Shdr04;
