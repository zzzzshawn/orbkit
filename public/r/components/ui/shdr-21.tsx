/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orba-core";

/* ----------------------------------------------------------------------------
   SHDR-21 — light diffusing through a cloud.

   A real volumetric integration rather than a surface. The march walks a
   density field bounded by a sphere and, at every step, does three things:

     TRANSMITTANCE  how much of the background still gets through, tracked as
                    T *= exp(-density * dt * absorb). Beer-Lambert.
     SHADOW         a short second march toward the light, so the far side of a
                    dense clump is dimmer than the lit side. This is the whole
                    reason the orb reads as volume and not as a flat glow.
     IN-SCATTER     light added at this step, weighted by density, by the shadow
                    term, and by a Henyey-Greenstein phase function.

   The phase function is what makes it feel like light rather than paint. It
   biases scattering forward, so the limb facing the light blooms and the rest
   stays soft — the same reason a cloud is blinding when you look toward the sun
   through it and merely bright otherwise.

   Alpha is 1 - T, which is exactly what the volume occludes, so this one needs
   no radial fade to hide the canvas edge: density falls to zero at the sphere
   boundary and the alpha goes with it.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. The march
 * is STEPS * (1 + LIGHT_STEPS) density evaluations, so LIGHT_STEPS is the
 * expensive knob — 4 is enough for readable self-shadowing.
 */
const NIMBUS_FRAG = `
#define STEPS 56
#define LIGHT_STEPS 4
#define DENSITY_OCT 4
#define AA 1

const float PI = 3.14159265359;

// Volume-reactive values, resolved once per fragment in main().
float nimbusPower;
float nimbusDensity;

/*
  Density inside the sphere.

  The radial term falls to zero at the boundary, which both bounds the volume
  and gives the soft edge for free. The cos-warp folds the sample point a few
  times — the same cheap turbulence the other orbs use — and the threshold
  carves that into clumps rather than an even fog.
*/
float density(vec3 p, float animTime) {
  float shell = 1.0 - length(p) / uP_radius;
  if (shell <= 0.0) return 0.0;

  vec3 q = p * uP_scale;
  float f = 1.0;
  for (int k = 0; k < DENSITY_OCT; k++) {
    q += cos(q.yzx * f + animTime * uP_churn) / f;
    f *= 1.8;
  }

  float n = (sin(q.x) + sin(q.y) + sin(q.z)) / 3.0 * 0.5 + 0.5;
  // smoothstep against the threshold is the clump control: high threshold
  // leaves sparse wisps, low fills the sphere with even fog
  float clump = smoothstep(uP_threshold, 1.0, n);
  return clump * pow(shell, uP_edgeSoft) * nimbusDensity;
}

/*
  Henyey-Greenstein: g > 0 biases scattering forward, which is what gives the
  bloom on the limb facing the light.

  The physical form carries a 1/(4*PI) normalisation. It is dropped here and
  folded into uP_power instead — kept in, the whole term sits around 0.02 and
  the orb renders black unless power is pushed into the hundreds, which makes
  the slider useless.
*/
float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 0.0001), 1.5);
}

vec4 nimbusRender(vec2 fragCoord) {
  float animTime = uP_speed; // integrated clock

  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, -uP_camDist);
  vec3 rd = normalize(vec3(uv, uP_focal));

  /*
    Light direction, slowly orbiting so the shading is never static.

    The z term is kept POSITIVE — the camera looks along +z, so a light also
    pointing along +z sits behind the cloud. That is the back-lit case, where
    dot(rd, L) approaches 1 and the forward-scattering phase blooms. Put the
    light on the camera's side instead and every ray samples the phase function
    on its back-scatter tail, where it is roughly ten times smaller, and the orb
    goes muddy.
  */
  vec3 L = normalize(vec3(
    cos(animTime * uP_lightSpin) * 0.7,
    0.45,
    sin(animTime * uP_lightSpin) * 0.35 + 0.65
  ));

  float phase = phaseHG(dot(rd, L), uP_aniso);

  // Start the march at the sphere's front face instead of the camera — every
  // step before that contributes nothing, and at 56 steps they are expensive.
  float toCentre = uP_camDist;
  float tStart = max(toCentre - uP_radius, 0.0);
  float span = 2.0 * uP_radius;
  float dt = span / float(STEPS);

  float T = 1.0;
  vec3 scattered = vec3(0.0);

  for (int i = 0; i < STEPS; i++) {
    float t = tStart + (float(i) + 0.5) * dt;
    vec3 p = ro + rd * t;

    float dn = density(p, animTime);
    if (dn > 0.001) {
      // short march toward the light for self-shadowing
      float shadow = 1.0;
      float lstep = uP_radius / float(LIGHT_STEPS);
      for (int k = 1; k <= LIGHT_STEPS; k++) {
        vec3 lp = p + L * (float(k) - 0.5) * lstep;
        shadow *= exp(-density(lp, animTime) * lstep * uP_shadowAbsorb);
      }

      /*
        In-scattered light: warm where lit, cool where the volume shadows
        itself.

        The shadow term appears ONCE, inside the mix. Multiplying by it again
        as a factor — the obvious-looking thing to write — scales the shadowed
        end of the mix toward zero, so the cool colour is always multiplied
        away and the cloud comes out monochrome beige however it is tinted.
        uP_shadowLift is how much light still reaches the shadowed side.
      */
      vec3 lit = mix(uC_shadow * uP_shadowLift, uC_light, shadow);
      scattered += T * dn * dt * lit * phase * nimbusPower;

      T *= exp(-dn * dt * uP_absorb);
      if (T < 0.01) break;
    }
  }

  // a soft ambient body so the unlit side is not pure black
  float body = 1.0 - T;
  scattered += uC_shadow * body * uP_ambient;

  return vec4(scattered, body);
}

void main() {
  /*
    Agent output turns the light up; user input thickens the cloud. Both are
    AMPLITUDES. Churn is deliberately NOT volume-scaled: it multiplies the
    accumulated clock into a phase (animTime * churn), so scaling it by the
    live volume would turn every volume wobble into a phase jump the size of
    the whole clock — the cloud scrambles chaotically on each state change
    instead of gliding, and gets worse the longer the page is open.
  */
  nimbusPower = uP_power * (0.7 + 0.9 * uOutput);
  nimbusDensity = uP_density * (1.0 + 0.35 * uInput);

  vec4 acc = vec4(0.0);
#if AA > 1
  for (int mx = 0; mx < AA; mx++) {
    for (int my = 0; my < AA; my++) {
      vec2 offset = vec2(float(mx), float(my)) / float(AA) - 0.5;
      acc += nimbusRender(gl_FragCoord.xy + offset);
    }
  }
  acc /= float(AA * AA);
#else
  acc = nimbusRender(gl_FragCoord.xy);
#endif

  vec3 col = tanh3(acc.rgb * uP_exposure);
  float a = clamp(acc.a * uP_alphaGain, 0.0, 1.0);

  // Emitted/scattered light, so rgb is already premultiplied — do NOT multiply
  // by alpha again (see the same note in shdr-31).
  gl_FragColor = vec4(col, a);
}
`;

export const shdr21Orb: OrbVariant = {
  key: "shdr-21",
  label: "SHDR-21",
  note: "light diffusing through a cloud",
  frag: NIMBUS_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 10, integrate: true },
    { key: "camDist", label: "Camera distance", min: 0.5, max: 40, step: 0.2, default: 4.4 },
    { key: "focal", label: "Lens", min: 0.3, max: 15, step: 0.1, default: 1.8 },
    { key: "radius", label: "Cloud radius", min: 0.15, max: 10, step: 0.05, default: 2 },
    { key: "scale", label: "Cloud scale", min: 0.1, max: 15, step: 0.1, default: 0.8 },
    { key: "churn", label: "Churn", min: 0, max: 5, step: 0.03, default: 0.3 },
    { key: "threshold", label: "Clumping", min: 0, max: 3, step: 0.015, default: 0.075 },
    { key: "edgeSoft", label: "Edge softness", min: 0.1, max: 10, step: 0.05, default: 0.8 },
    { key: "density", label: "Density", min: 0.03, max: 20, step: 0.1, default: 3.2 },
    { key: "absorb", label: "Absorption", min: 0.03, max: 15, step: 0.1, default: 1.4 },
    { key: "shadowAbsorb", label: "Shadow depth", min: 0, max: 20, step: 0.1, default: 2.4 },
    { key: "shadowLift", label: "Shadow lift", min: 0, max: 5, step: 0.03, default: 0.55 },
    { key: "aniso", label: "Forward scatter", min: -0.9, max: 0.9, step: 0.01, default: 0.45 },
    { key: "lightSpin", label: "Light orbit", min: 0, max: 3, step: 0.015, default: 0.12 },
    { key: "power", label: "Light power", min: 0.03, max: 40, step: 0.2, default: 1.9 },
    { key: "ambient", label: "Ambient", min: 0, max: 3, step: 0.015, default: 0.12 },
    { key: "exposure", label: "Exposure", min: 0.03, max: 10, step: 0.05, default: 1 },
    { key: "alphaGain", label: "Alpha gain", min: 0.05, max: 10, step: 0.05, default: 1.5 }
  ],
  /*
   * The engine uploads these as uC_<key> vec3 uniforms. Warm light against a
   * cool shadow is what reads as depth — a single-hue cloud looks flat however
   * well it is shadowed.
   */
  colors: [
    { key: "light", label: "Light", default: "#ffd7a3" },
    { key: "shadow", label: "Shadow", default: "#3a4a8c" }
  ],
  statePresets: {
    /*
      Every state shares the same speed, geometry and cloud shape — only the
      AMBIENCE and the palette move, so switching state relights the cloud
      instead of restaging it. The engine glides params and cross-fades
      colours on one shared easing, so the change reads as a mood shift.
    */
    idle: {
      ambient: 0.12,
      power: 1.9,
      shadowLift: 0.55
    },
    thinking: {
      ambient: 0.22,
      power: 2.15,
      shadowLift: 0.65
    },
    speaking: {
      ambient: 0.46,
      power: 3.1,
      shadowLift: 0.95
    }
  },
  /*
    The palette carries the rest of the state read: a warm lamp over cool
    shadow at rest, shifting violet while it thinks, and burning hot while
    speaking.
  */
  stateColors: {
    idle: { light: "#ffd7a3", shadow: "#3a4a8c" },
    thinking: { light: "#e6d4ff", shadow: "#3b3f96" },
    speaking: { light: "#ffb066", shadow: "#7a2f6e" }
  }
};

export type Shdr21Props = Omit<ShaderOrbProps, "variant">;

export function Shdr21({ size = 280, ...rest }: Shdr21Props) {
  return <ShaderOrb variant={shdr21Orb} size={size} {...rest} />;
}

export default Shdr21;
