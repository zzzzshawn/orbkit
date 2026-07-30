# Orba

WebGL shader orbs for React, distributed through a shadcn registry. Install an orb, own the
source, tune every uniform.

Built the same way as [Dot Matrix](https://dotmatrix.zzzzshawn.cloud) — a docs site that *is* the
registry, with the components living in-repo as plain source files.

```bash
npx shadcn@latest add @orba/orb-hydrogen
```

> The registry namespace, product name, and homepage all come from
> [`lib/site-config.ts`](lib/site-config.ts). Renaming the library is a one-file edit plus
> `pnpm registry:build`.

## Orbs

| Slug | Title | Description |
| --- | --- | --- |
| `orb-hydrogen` | Hydrogen | Quantum orbital — \|psi\|² of a hydrogen-like wave function on a rotating dome, rainbow chromatic bands over dark metal. |
| `orb-corona` | Corona | Raymarched SDF shell — the space between a sine-warped sphere and a plain one, lit only by godrays accumulated along each ray. |
| `orb-nimbus` | Nimbus | Light diffusing through a cloud — a volumetric march with Beer-Lambert transmittance, a second march toward the light for self-shadowing, and a Henyey-Greenstein phase function that blooms the lit limb. |
| `orb-rocaille` | Rocaille | Ornate scrollwork — ten colour layers folded by a nine-step feedback warp, sampled through a stereographic projection of the dome so the filigree compresses toward the rim. |
| `orb-quasar` | Quasar | A Rodrigues-swept core inside frosted, dispersive glass — analytic ray/sphere intersect for an exact normal, jittered for frost, refracted at three indices so the caustics split into rainbow fringes. |

## Usage

```tsx
import { OrbHydrogen } from "@/components/ui/orb-hydrogen";

<OrbHydrogen size={280} state="idle" />;
```

Orbs are built for agent UIs, so they take a `state` rather than a pile of animation props. Each
state synthesizes two volume signals — input (user speech energy) and output (agent speech
energy) — which the shader reads as uniforms.

```tsx
const orbState =
  status === "connecting" ? "thinking"
  : isUserSpeaking ? "listening"
  : isAgentSpeaking ? "speaking"
  : "idle";

<OrbHydrogen size={320} state={orbState} />;
```

Override any shader parameter; anything you leave out follows the active state's preset.

```tsx
<OrbHydrogen state="speaking" params={{ glow: 1.4, chromaSpread: 0.3 }} />
```

Full prop and parameter tables: [`/getting-started/usage`](app/getting-started/usage/page.tsx).

## Architecture

```
orbs/
  core/orba-core.tsx     the WebGL runtime: types, GLSL prelude, volume synthesis, <ShaderOrb>
  orbs/orb-hydrogen.tsx  one file per orb: fragment shader + param schema + state presets
  index.ts               barrel for the docs site
lib/
  site-config.ts         name, namespace, homepage — the only place identity is written
  registry-config.ts     the orb manifest the registry builds from
  orb-component-map.ts   slug → component and slug → variant, for the gallery and playground
scripts/
  build-registry.ts      orbs/ → public/r/*.json (shadcn registry)
```

Two design rules make the rest fall out:

1. **The param schema is data.** `OrbVariant.params` drives the DialKit controls in the
   playground *and* the parameter table in the docs. Adding an orb never means hand-writing
   sliders or documentation rows.
2. **`"use client"` lives on the runtime, not the orb.** `orb-hydrogen.tsx` has no directive, so
   server components can read `hydrogenOrb` as real data. Marking it would turn every export into
   an opaque client reference and break the docs tables.

### Registry file types

The core is emitted as `registry:ui`, not `registry:lib`. shadcn routes files by **type**, not by
the declared path — `registry:lib` lands them in the consumer's `lib` alias while the orb still
imports `@/components/ui/orba-core`, which breaks every install.

## Adding an orb

1. Create `orbs/orbs/orb-<name>.tsx` exporting a component and an `OrbVariant`. Copy
   `orb-hydrogen.tsx` as the template — no `"use client"` directive.
2. Write the fragment shader against the prelude in `ORB_GLSL_HELPERS` (`uRes`, `uTime`, `uAnim`,
   `uInput`, `uOutput`, plus `noise`/`fbm`/`orbUV`). Declare every tunable as a `uP_<key>` uniform
   and list it in `params` — the engine generates the uniform declarations from the schema.
3. Register it in `lib/registry-config.ts` and `lib/orb-component-map.ts`.
4. `pnpm registry:build`.

Mark rate params `integrate: true`. The engine turns those into a clock
(`clock += dt * value * volumeSpeed`) and uploads the clock, so changing the rate speeds the
motion up or slows it down instead of jumping the phase.

### Porting a shader from Shadertoy or similar

The runtime is WebGL 1 / GLSL ES 1.0, which is stricter than the ES 3.0 most shader snippets
assume. The usual fixes, all of which `orb-corona.tsx` needed:

- `transpose()`, `inverse()`, `round()` and friends are ES 3.0 — hand-write them.
- Write to `gl_FragColor`; there is no user-declared `out vec4 fragColor`.
- Loop conditions must compare the index against a constant. Put the real exit test inside the
  body as an `if (…) break;`.
- `u_time` / `iTime` → an `integrate: true` param; `u_resolution` / `iResolution` → `uRes`.
- Loop bounds and supersampling factors must be `#define`s, not uniforms.

**Emissive shaders need care with alpha.** Orbs composite onto the page, so an opaque
`vec4(col, 1.0)` paints a square. Derive alpha from luminance — but output `vec4(col, a)`, not
`vec4(col * a, a)`: for emitted light the colour is already premultiplied, and multiplying again
darkens the glow quadratically. Surface-lit orbs bounded by a mask (Hydrogen, Rocaille) are the
opposite case — there alpha *is* coverage, so premultiply normally.

If the effect is volumetric and reaches the frame edge, taper radially — **colour as well as
alpha**. Fading only alpha leaves the pixel emitting at full brightness right up to the cutoff,
which reads as a hard rim wherever the taper crosses something bright.

### Making a flat or open shader read as an orb

Most interesting shaders are not spheres. Two moves cover almost every case:

- **Open 3D shapes** (a flame, a plume): blend the distance field toward `length(p) - radius`.
  Then watch the ratio of warp amplitude to radius — a warp larger than the radius tears the
  sphere apart — and the warp's *base frequency*, which decides whether turbulence deforms the
  silhouette or textures it. Low frequency bends the ball; high frequency details it.
- **Flat 2D fields**: don't mask a disc out of them, that reads as a coin. Sample the field
  through a stereographic projection of the dome (`p = sp.xy / (sp.z + 1.0)`), so it compresses
  toward the rim the way a texture on a real sphere does, and add a fresnel rim light.

Watch out for golfed "rotation" matrices such as `mat2(cos(a + vec4(0,11,33,0)))`. Those phase
constants only approximate ∓sin, so the matrix is not orthonormal — its determinant breathes with
`a`. On an open shape that reads as character; on a sphere it is a time-varying non-uniform scale
that visibly squashes the silhouette. Use a real rotation.

Golfed ray setups are worth re-deriving too. A very common one is `ro = vec3(0,0,-D)` followed by
`p.z += D`, which cancels: the march starts at the origin and walks outward. That is fine for pure
accumulation, but the first surface contact is then the *far* wall and its outward normal faces
away from the viewer, so every lighting term silently collapses to zero. If you want to shade a
solid, put the camera outside and march toward it.

**Surface detail cannot come from accumulation on a closed shell.** Every ray that hits the orb
crosses the surface, so anything summed along the ray comes out near-uniform across the disc — a
smudge. Evaluate detail at the contact point instead, as a function of the surface direction: an
isoline through a warped field (`abs(fract(v) - 0.5)`) gives a thin, branching network.

### Volumetric orbs

`orb-nimbus` is the worked example — march a density field, track Beer-Lambert transmittance, and
do a short second march toward the light for self-shadowing. Alpha is then `1 - T`, which is
exactly what the volume occludes, so a volumetric orb needs no radial fade at all: bound the
density by the sphere and the silhouette comes free.

Two things will make it render black or flat, and neither is obvious:

- **Light placement versus the phase function.** A Henyey-Greenstein lobe with `g > 0` scatters
  *forward*, so it only blooms when the light is behind the cloud from the camera's view — the
  light direction wanting the same sign as the view direction. Put the light on the camera's side
  and every ray samples the lobe's back-scatter tail, roughly ten times smaller.
- **Applying the shadow term twice.** `mix(shadowCol, lightCol, shadow) * shadow` looks right and
  is not: it scales the shadowed end of the mix toward zero, so the cool colour is always
  multiplied away and the cloud renders monochrome however you tint it. Use the shadow term once.

Also drop the `1/(4π)` from the phase function and fold it into your intensity parameter, or the
whole term sits near 0.02 and the slider only becomes useful in the hundreds.

Two more traps worth knowing:

- Weight ray-marched accumulation by the step length. Sphere tracing shrinks steps near the
  surface, so an unweighted `+=` piles up hundreds of samples exactly where the effect was meant
  to stay thin. Multiply by `dt` to make it a line integral.
- Golfed shaders lean on **uninitialised locals being zero** (`vec3 a; a -= .57;` to build a
  constant axis). That is undefined in GLSL ES 1.0 — initialise explicitly.

### `pnpm check:orbs`

Every mistake above fails somewhere far from its cause, so they are checked statically. The
script reports four kinds:

| Kind | What it catches | How it fails without the check |
| --- | --- | --- |
| `BACKTICK` | a backtick in a GLSL comment | ends the template literal early; TypeScript reports `TS1005`/`TS1443` on an unrelated line |
| `MISSING` | `uP_*`/`uC_*` used with no schema entry | the engine never creates the uniform — runtime "undeclared identifier" |
| `UNUSED` | a schema entry no shader reads | dead slider in the playground, meaningless row in the docs |
| `STALE` | a preset naming a param that no longer exists | silently does nothing — the worst of the four |

It runs as part of `pnpm build`.

## Runtime behaviour

- **Pauses offscreen.** Each orb owns a WebGL context and browsers cap live contexts (commonly
  ~16), so gallery cards stop rendering when scrolled away. Opt out with `pauseOffscreen={false}`.
- **Responsive.** A `ResizeObserver` tracks the element box; drop `size` and size from CSS.
- **`prefers-reduced-motion`.** Draws a single representative frame, then stops.
- **DPR capped at 2** by default (`maxDpr`).

## Development

```bash
pnpm install
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | Docs site + playground |
| `pnpm check:orbs` | Static checks over every orb — see below |
| `pnpm registry:build` | Regenerate `public/r/` and `registry.json` from `orbs/` |
| `pnpm build` | `check:orbs`, then `registry:build`, then `next build` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

### Verifying an install end to end

The registry is served by the dev server, so the CLI can install from it directly:

```bash
npx shadcn@latest add http://localhost:3000/r/orb-hydrogen.json
```

Run that against a scratch project with a `components.json` and confirm both files land in
`components/ui/` and the project typechecks. That is the only check that exercises the whole
path — path rewriting, file typing, and alias resolution.

## License

MIT
