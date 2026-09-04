/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "../core/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-09 — torn rings of rainbow light, worn as the ball's own latitudes.

   Ported from a golfed twigl listing (its feedback variant):

     vec2 p=(FC.xy*2.-r)/r.y/.2,v;
     for(float i,l,f;i++<1e1;
         o+=.03/max(l=length(v)-i,-l*3.)*(cos(t-i*.4+.1/l+vec4(0,1,2,3))+1.1))
       for(v=p,f=0.;f++<9.;v+=sin(ceil(v*f+i*.9)-t/2.)/f);
     o=max(tanh(o+(o=texture(b,(FC.xy+r.y*.05*sin(FC.xy+FC.yx/.6))/r))*o),.0);

   What it actually is, decoded:

   - TEN CONCENTRIC RINGS. The accumulator lives in the outer loop's
     increment slot, so it runs after the inner loop: each ring re-warps
     the ORIGINAL point from scratch (v=p) with its own seed i*.9, then
     draws the circle of radius i through that ring's private distortion.
     Ten rings, ten different tears — they are not ten copies of one shape.
   - The warp is CELL-QUANTIZED, sin(ceil(v*f) - t): every lattice cell
     flickers on its own phase, the same construction shdr-22 uses for
     its voxel shimmer, here in 2D and re-seeded per ring.
   - max(l, -l*3.) is an ASYMMETRIC absolute value — l outside the ring,
     3|l| inside. So 1/that lights the outer shoulder of every ring three
     times as hard as the inner one, and the rings read as expanding
     wavefronts rather than as symmetric wires.
   - .1/l inside the colour phase is the good part. It sweeps through the
     entire hue wheel in the last hair of distance before the ring, so
     each ring carries a rainbow fringe that compresses to a hard line
     exactly where the glow peaks.
   - The last line is FRAME FEEDBACK: o + prev*o, where prev is the
     previous frame read through a pixel-scale sinusoidal scramble. That
     is what smears the rings into trails in the original.

   Port decisions, each one a documented trap or rule in the README:

   - THE ORB IS THE OBJECT, and this listing gets a better mapping than
     the family's usual one. A field of concentric circles about the
     origin does not want a stereographic wrap — the circles ARE latitude
     rings, so radius maps to the POLAR ANGLE from the dome's axis and the
     foreshortening is exact instead of approximated.
   - That mapping also has no pole to collapse. acos() is defined across
     the whole sphere, so unlike shdr-08 and shdr-26 — where the
     stereographic divisor forbids it — this dome rolls freely in 3D, and
     rings sweep into view over the limb as it turns.
   - THE FEEDBACK TERM IS NOT PORTED. The engine renders one pass into one
     canvas with no previous-frame texture, so there is nothing to sample;
     adding a ping-pong framebuffer is an engine change, not an orb one.
     What is lost is the temporal smear. What the rings do in space is all
     here.
   - Both singular divisors are softened rather than guarded: the glow
     divisor is floored, which doubles as the LINE WIDTH (the same trick
     as shdr-02's coreClamp), and the .1/l colour phase becomes
     l/(l*l+g), which is 1/l everywhere the listing cared about and finite
     on the ring itself. Left raw, the hue sweep reaches infinite frequency
     exactly where the glow is brightest — the one place aliasing is
     guaranteed to show.
   - The golfed listing relies on i, l and f starting at zero;
     uninitialised locals are UNDEFINED in GLSL ES 1.0, explicit here.
   - Surface-lit and mask-bounded, so alpha IS coverage — premultiplied
     output, as in shdr-17.
---------------------------------------------------------------------------- */

/*
 * Step counts are `#define`s: ES 1.0 requires constant loop bounds. RINGS and
 * TURB are the listing's i++ < 1e1 and f++ < 9. Every ring pays for its own
 * warp, so this is RINGS * TURB sines per sample before supersampling.
 */
const IRIS_FRAG = `
#define RINGS 10
#define TURB 9
#define AA 2

// Volume-reactive values, resolved once per fragment in main().
float irisWarp;
float irisGlow;
float irisFringe;

vec3 irisRender(vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - uRes) / min(uRes.x, uRes.y);
  float R = max(uP_radius, 0.001);

  // the dome: the front hemisphere of a unit ball, in screen space
  vec2 pl = uv / R;
  float z = sqrt(max(1.0 - dot(pl, pl), 0.0));
  vec3 n = vec3(pl, z);

  float t = uP_speed; // integrated clock

  // tilt about X, then roll about Y on its own integrated clock
  float ct = cos(uP_tilt);
  float st = sin(uP_tilt);
  vec3 sp = vec3(n.x, n.y * ct - n.z * st, n.y * st + n.z * ct);
  float cr = cos(uP_spin);
  float sr = sin(uP_spin);
  sp = vec3(sp.x * cr - sp.z * sr, sp.y, sp.x * sr + sp.z * cr);

  /*
    Radius becomes the polar angle from the dome's axis (see the header),
    so ring i lands on the latitude at angle i / uP_scale and the rings
    crowd toward the limb the way a globe's latitudes do. acos is defined
    on the whole sphere, so the roll above can put the axis anywhere —
    including behind the visible face, which sweeps the outer rings into
    view over the limb.
  */
  float pol = acos(clamp(sp.z, -1.0, 1.0));
  vec2 dir = sp.xy / max(length(sp.xy), 1e-4);
  vec2 p = dir * pol * uP_scale;

  vec3 acc = vec3(0.0);

  for (int ri = 0; ri < RINGS; ri++) {
    float i = float(ri) + 1.0;

    /*
      Each ring re-warps the ORIGINAL point with its own seed, exactly as
      the listing does — this loop is why the rings tear differently
      instead of nesting like tree rings.
    */
    vec2 v = p;
    for (int j = 0; j < TURB; j++) {
      float f = float(j) + 1.0;
      v += irisWarp * sin(ceil(v * f + i * uP_seed) - t * 0.5) / f;
    }

    float l = length(v) - i;

    // the asymmetric absolute value, with the floor doubling as the line
    // width — a wider floor is a fatter, softer wavefront
    float side = max(max(l, -uP_inner * l), uP_lineSoft);

    /*
      The hue sweep, softened. l/(l*l+g) tracks 1/l off the ring and rolls
      over to a finite peak on it, so the rainbow compresses into a fringe
      of finite width instead of an aliased band.
    */
    float fr = irisFringe * l / (l * l + uP_fringeSoft);
    vec3 hue = cos(t - i * uP_ringPhase + fr + vec3(0.0, 1.0, 2.0)) + 1.1;

    acc += (irisGlow / side) * hue;
  }

  // the listing's tanh knee, with the divisor exposed
  vec3 col = tanh3(acc / max(uP_exposure, 0.001));
  col = pow(clamp(col, 0.0, 1.0), vec3(uP_contrast));

  // saturation about luminance, then the tint
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uP_saturation);
  col *= uC_tint;

  // dome shading keeps the ball a ball under the rings — gentler than the
  // sibling orbs use, because these rings are emission and a hard lambert
  // reads as a shadow thrown across a light source
  float lambert = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.72))), 0.0, 1.0);
  col *= 0.55 + uP_light * lambert;

  float fres = 1.0 - z;
  fres = fres * fres * fres;
  col += uC_sheen * uP_rim * fres;

  return col;
}

void main() {
  // Volume coupling: the user's voice tears the rings harder, the agent's
  // brightens them and opens the rainbow fringe.
  irisWarp = uP_warp * (1.0 + 0.5 * uInput);
  irisGlow = uP_glow * (0.85 + 0.5 * uOutput);
  irisFringe = uP_fringe * (1.0 + 0.6 * uOutput);

  vec2 uv = orbUV();
  float mask = smoothstep(0.012, -0.012, length(uv) - max(uP_radius, 0.001));

  // Ninety sines per sample before supersampling — none of them worth
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
      col += irisRender(gl_FragCoord.xy + off);
    }
  }
  col /= float(AA * AA);
#else
  col = irisRender(gl_FragCoord.xy);
#endif

  // Surface orb bounded by a mask: alpha IS coverage, so premultiply — the
  // opposite convention from the emissive orbs (see shdr-31).
  float a = mask;
  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);
}
`;

export const shdr09Orb: OrbVariant = {
  key: "shdr-09",
  label: "SHDR-09",
  note: "torn rings of rainbow light worn as the ball's latitudes",
  frag: IRIS_FRAG,
  params: [
    { key: "speed", label: "Anim speed", min: 0.015, max: 10, step: 0.05, default: 0.6, integrate: true },
    { key: "spin", label: "Roll", min: 0, max: 3, step: 0.015, default: 0.12, integrate: true },
    { key: "tilt", label: "Tilt", min: -1.5, max: 1.5, step: 0.015, default: 0.4 },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 0.9 },
    { key: "scale", label: "Ring spacing", min: 0.3, max: 20, step: 0.1, default: 3.5 },
    { key: "warp", label: "Tear", min: 0, max: 3, step: 0.02, default: 0.45 },
    { key: "seed", label: "Ring seed", min: 0, max: 3, step: 0.01, default: 0.9 },
    { key: "glow", label: "Ring glow", min: 0, max: 1, step: 0.002, default: 0.05 },
    { key: "lineSoft", label: "Ring width", min: 0.002, max: 1, step: 0.002, default: 0.05 },
    { key: "inner", label: "Inner falloff", min: 0.2, max: 12, step: 0.05, default: 3 },
    { key: "fringe", label: "Rainbow fringe", min: 0, max: 2, step: 0.005, default: 0.1 },
    { key: "fringeSoft", label: "Fringe width", min: 0.001, max: 1, step: 0.001, default: 0.003 },
    { key: "ringPhase", label: "Ring hue step", min: 0, max: 3, step: 0.01, default: 0.8 },
    { key: "exposure", label: "Exposure", min: 0.05, max: 20, step: 0.05, default: 1.1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1.1 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.02, default: 1.2 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 0.5 },
    { key: "rim", label: "Rim sheen", min: 0, max: 3, step: 0.015, default: 0.4 }
  ],
  colors: [
    { key: "tint", label: "Tint", default: "#ffffff" },
    { key: "sheen", label: "Sheen", default: "#b9d6ff" }
  ],
  /*
    Staged on the two things the rings own: how hard they TEAR, and how
    wide the wavefront is. Ring spacing never moves between states — it
    sets how many rings are on the ball, and a gliding count reads as the
    ball inflating rather than as a change of mood.
  */
  statePresets: {
    // at rest: slow, softly torn, wide calm wavefronts
    idle: {
      speed: 0.6,
      spin: 0.12,
      warp: 0.45,
      glow: 0.05,
      lineSoft: 0.05,
      fringe: 0.1,
      exposure: 1.1,
      contrast: 1.15
    },
    /*
      searching: the rings tear right open — warp near six times idle — and
      broaden rather than thin, so the ball reads as churning instead of
      brittle. The rainbow fringe runs almost to full and softens by two
      orders of magnitude, which is what turns the tears into wide spectral
      bands; exposure, saturation and the rim all lift together to keep that
      readable. Speed and spin sit at the schema defaults, so the ball keeps
      idle's rotation and the whole change reads in the surface, not the
      motion.
    */
    thinking: {
      warp: 2.54,
      glow: 0.2,
      lineSoft: 0.152,
      fringe: 0.96,
      fringeSoft: 0.854,
      ringPhase: 2.53,
      exposure: 1.75,
      contrast: 1.15,
      saturation: 2.22,
      light: 1.035,
      rim: 0.66
    },
    /*
      answering: the tears RELAX to half idle's and the wavefronts broaden
      to four times it — bands of light rather than rings — but the ball is
      travelling under them at near eight times idle speed, the fastest of
      the three by a wide margin. Broad calm shapes moving fast, which is
      the opposite of searching's tight shapes churning in place.

      The colour comes off the FRINGE rather than the glow: eight times
      idle's fringe strength on twenty times its width, with the ring glow
      pulled just under idle's and the knee down, so the light gathers in
      the spectral edges instead of flooding the rings themselves. The key
      light doubles to keep a dome under all that, and the rim sheen is off
      almost entirely.

      Note the RING SEED is staged here, and it is the one value in this
      preset that cannot glide: it sits inside a ceil() in the octave loop,
      so it quantizes, and easing it across a state change steps rather than
      fades. The move is small — 0.9 to 1.02 — but if the transition pops,
      that is what is popping, and the fix is to hold it equal in all three
      states rather than to slow it down.
    */
    speaking: {
      speed: 4.7,
      spin: 0.34,
      warp: 0.22,
      seed: 1.02,
      glow: 0.04,
      lineSoft: 0.22,
      fringe: 0.81,
      fringeSoft: 0.058,
      ringPhase: 1.03,
      exposure: 0.68,
      contrast: 0.85,
      light: 0.99,
      rim: 0.015
    }
  },
  // the rings supply their own rainbow, so the tint only shifts its
  // temperature: neutral at rest, cooled while searching, warmed while
  // answering
  stateColors: {
    idle: { tint: "#ffffff", sheen: "#b9d6ff" },
    thinking: { tint: "#9db8ff", sheen: "#7ba6ff" },
    speaking: { tint: "#ffc492", sheen: "#ffb277" }
  }
};

export type Shdr09Props = Omit<ShaderOrbProps, "variant">;

export function Shdr09({ size = 280, ...rest }: Shdr09Props) {
  return <ShaderOrb variant={shdr09Orb} size={size} {...rest} />;
}

export default Shdr09;
