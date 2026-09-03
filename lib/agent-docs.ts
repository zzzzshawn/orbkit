/*
 * The agent-facing surface, derived from the same data the site and the
 * registry are built from: `orbRegistry` (slug, title, description) and
 * `orbVariantMap` (param schema, colours, state presets). Nothing here is
 * hand-kept per orb — adding an orb updates llms.txt, agents.md, the skill,
 * the JSON catalog and the OpenAPI document at once.
 *
 * Served by the route handlers under app/ (llms.txt, agents.md, skill.md,
 * skill/recipes.md, openapi.json, api/v1/*) and rendered by /agents and
 * /developers.
 */
import { orbVariantMap } from "@/lib/orb-component-map";
import { orbRegistry, type OrbRegistryEntry } from "@/lib/registry-config";
import {
  CREATOR_NAME,
  CREATOR_URL,
  REGISTRY_NAMESPACE,
  SITE_DESCRIPTION,
  SITE_HOMEPAGE,
  SITE_NAME,
  shadcnAddCommand
} from "@/lib/site-config";

export const API_VERSION = "1.0.0";
export const REPO_URL = "https://github.com/zzzzshawn/orba";

export function absolute(path: string): string {
  return new URL(path, SITE_HOMEPAGE).href;
}

/** `npx shadcn@latest add https://…/r/shdr-11.json` — the form that needs no registry alias. */
export function shadcnAddUrlCommand(itemName: string): string {
  return `npx shadcn@latest add ${absolute(`/r/${itemName}.json`)}`;
}

/* ------------------------------ shared facts ------------------------------ */

export const STATES = [
  { name: "idle", meaning: "calm, slow drift — the agent is listening or waiting" },
  { name: "thinking", meaning: "restless motion with a slow wander — the agent is working" },
  { name: "speaking", meaning: "fast, bright, strongly precessing — the agent is talking" }
] as const;

export const WRAPPERS = [
  "none",
  "glass",
  "ring",
  "dotted",
  "ticks",
  "reticle",
  "grid",
  "halftone",
  "scanlines"
] as const;

export interface SharedProp {
  name: string;
  type: string;
  default?: string;
  description: string;
}

/** The prop surface every orb shares. Mirrors ShaderOrbProps in orba-core. */
export const SHARED_PROPS: SharedProp[] = [
  { name: "size", type: "number", default: "280", description: "Rendered diameter in CSS pixels." },
  {
    name: "state",
    type: `"idle" | "thinking" | "speaking"`,
    default: `"idle"`,
    description:
      "Drives the synthesized volume signals and selects the state preset. Params glide between states; the animation phase never jumps."
  },
  {
    name: "params",
    type: "Partial<Record<string, number>>",
    description:
      "Explicit shader-parameter overrides. Any key here wins over the state preset. Only keys the orb declares (see its params) do anything."
  },
  {
    name: "colors",
    type: "Partial<Record<string, string>>",
    description: "Hex colour overrides, for the colour keys the orb declares."
  },
  {
    name: "statePresets",
    type: "Partial<Record<OrbState, Record<string, number>>>",
    description:
      "Per-state param targets merged KEY BY KEY over the orb's own presets, so { thinking: { speed: 2 } } retunes one param of one state and leaves everything else as shipped."
  },
  {
    name: "stateColors",
    type: "Partial<Record<OrbState, Record<string, string>>>",
    description: "The colour counterpart of statePresets, merged the same way."
  },
  {
    name: "stateVolumes",
    type: "Partial<Record<OrbState, { input?: number; output?: number }>>",
    description: "Per-state volume drive (0..1 each), to give a state more or less energy."
  },
  {
    name: "volumes",
    type: "{ input?: number; output?: number }",
    description:
      "Pins the live volume signals (0..1). input is user speech energy, output is agent speech energy. Feed a real mic or TTS level here; omit a channel to keep its synthesized motion."
  },
  { name: "paused", type: "boolean", default: "false", description: "Freeze on the current frame." },
  {
    name: "pauseOffscreen",
    type: "boolean",
    default: "true",
    description: "Stop rendering while scrolled out of view."
  },
  { name: "maxDpr", type: "number", default: "2", description: "Device-pixel-ratio ceiling." },
  {
    name: "wrapper",
    type: "OrbWrapper",
    default: `"none"`,
    description: `Decoration drawn around the orb: ${WRAPPERS.join(", ")}. Never changes the footprint.`
  },
  {
    name: "wrapperColor",
    type: "string",
    default: `"currentColor"`,
    description: "What the wrapper draws its lines in. glass ignores it."
  },
  { name: "className", type: "string", description: "Applied to the outermost element." },
  { name: "style", type: "CSSProperties", description: "Merged onto the outermost element's style." },
  {
    name: "ariaLabel",
    type: "string",
    description: "When set the orb is role=img with this label; otherwise it is aria-hidden."
  }
];

/* --------------------------------- catalog -------------------------------- */

export interface CatalogParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** A rate: the engine integrates it into a clock, so it sets speed, not phase. */
  integrate: boolean;
}

export interface CatalogColor {
  key: string;
  label: string;
  default: string;
}

export interface CatalogEntry {
  slug: string;
  name: string;
  title: string;
  /** One line, lowercase, from the orb file. */
  note: string;
  description: string;
  docs: string;
  playground: string;
  registry: string;
  install: string;
  installByUrl: string;
  file: string;
  importPath: string;
  dependencies: string[];
  params: CatalogParam[];
  colors: CatalogColor[];
  statePresets: Partial<Record<string, Record<string, number>>>;
  stateColors: Partial<Record<string, Record<string, string>>>;
}

function toEntry(orb: OrbRegistryEntry): CatalogEntry {
  const variant = orbVariantMap[orb.slug];
  const file = `components/ui/${orb.fileName}`;
  return {
    slug: orb.slug,
    name: orb.componentName,
    title: orb.title,
    note: variant?.note ?? "",
    description: orb.description,
    docs: absolute(`/playground?orb=${orb.slug}`),
    playground: absolute(`/playground?orb=${orb.slug}`),
    registry: absolute(`/r/${orb.slug}.json`),
    install: shadcnAddCommand(orb.slug),
    installByUrl: shadcnAddUrlCommand(orb.slug),
    file,
    importPath: `@/${file.replace(/\.tsx$/, "")}`,
    dependencies: orb.dependencies,
    params: (variant?.params ?? []).map((p) => ({
      key: p.key,
      label: p.label,
      min: p.min,
      max: p.max,
      step: p.step,
      default: p.default,
      integrate: Boolean(p.integrate)
    })),
    colors: (variant?.colors ?? []).map((c) => ({
      key: c.key,
      label: c.label,
      default: c.default
    })),
    statePresets: variant?.statePresets ?? {},
    stateColors: variant?.stateColors ?? {}
  };
}

export function getCatalog(): CatalogEntry[] {
  return orbRegistry.map(toEntry);
}

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  const orb = orbRegistry.find((entry) => entry.slug === slug);
  return orb ? toEntry(orb) : undefined;
}

/** The list form: everything but the schema, for /api/v1/components. */
export function summarize(entry: CatalogEntry) {
  return {
    slug: entry.slug,
    name: entry.name,
    title: entry.title,
    note: entry.note,
    description: entry.description,
    docs: entry.docs,
    registry: entry.registry,
    install: entry.install,
    paramCount: entry.params.length,
    colorCount: entry.colors.length
  };
}

/* --------------------------------- chooser -------------------------------- */

/**
 * Hand-curated moods → orbs. Everything else an agent needs to choose is in
 * the catalog's one-line notes; this is the shortcut for the common asks.
 */
export const CHOOSER: ReadonlyArray<{ ask: string; picks: string[] }> = [
  { ask: "A voice-assistant avatar with a clear state read", picks: ["shdr-11", "shdr-26", "shdr-13"] },
  { ask: "Calm glass for a product hero or a loading state", picks: ["shdr-01", "shdr-25", "shdr-21"] },
  { ask: "Retro, terminal, pixel, CRT, print", picks: ["shdr-23", "shdr-14", "shdr-28", "shdr-29", "shdr-33", "shdr-27"] },
  { ask: "Nature: water, weather, cloud", picks: ["shdr-16", "shdr-20", "shdr-21", "shdr-17"] },
  { ask: "Cosmic: galaxy, crystal, corona", picks: ["shdr-32", "shdr-18", "shdr-31", "shdr-22"] },
  { ask: "Ornament and pattern", picks: ["shdr-02", "shdr-19", "shdr-30"] }
];

/* ------------------------------ text builders ----------------------------- */

const primary = () => orbRegistry.find((o) => o.slug === "shdr-11") ?? orbRegistry[0];

function usageSnippet(orb: OrbRegistryEntry): string {
  const mod = orb.fileName.replace(/\.tsx$/, "");
  return `import { ${orb.componentName} } from "@/components/ui/${mod}";

const orbState =
  status === "connecting" ? "thinking"
  : isAgentSpeaking ? "speaking"
  : "idle";

<${orb.componentName} size={320} state={orbState} />`;
}

function machineReadableLinks(): string {
  return [
    `- For agents (HTML): ${absolute("/agents")}`,
    `- agents.md: ${absolute("/agents.md")}`,
    `- llms.txt: ${absolute("/llms.txt")}`,
    `- Skill: ${absolute("/skill.md")}`,
    `- Recipes: ${absolute("/skill/recipes.md")}`,
    `- Developer API: ${absolute("/developers")}`,
    `- OpenAPI: ${absolute("/openapi.json")}`,
    `- API index: ${absolute("/api/v1")}`,
    `- Health: ${absolute("/api/v1/health")}`,
    `- JSON catalog: ${absolute("/api/v1/components")}`,
    `- One orb (full param schema and presets): ${absolute("/api/v1/components/<slug>")}`,
    `- Registry item (the source shadcn installs): ${absolute("/r/<slug>.json")}`,
    `- Registry index: ${absolute("/r/registry.json")}`,
    `- Sitemap: ${absolute("/sitemap.xml")}`
  ].join("\n");
}

function catalogTable(entries: CatalogEntry[]): string {
  const rows = entries.map(
    (e) => `| ${e.slug} | ${e.name} | ${e.note} | ${e.params.length} | ${e.colors.map((c) => c.key).join(", ") || "—"} |`
  );
  return ["| Slug | Component | Look | Params | Colours |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

function chooserTable(): string {
  const rows = CHOOSER.map((c) => `| ${c.ask} | ${c.picks.join(", ")} |`);
  return ["| The ask | Try first | ", "| --- | --- |", ...rows].join("\n");
}

function propsTable(): string {
  const rows = SHARED_PROPS.map(
    (p) => `| ${p.name} | ${p.type.replace(/\|/g, "\\|")} | ${p.default ?? "—"} | ${p.description} |`
  );
  return ["| Prop | Type | Default | Notes |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

const RULES = [
  "One orb per agent, driven by `state`. Map your connection status onto idle / thinking / speaking; do not animate the orb yourself.",
  "Override only params the orb declares. Fetch /api/v1/components/<slug> for the exact keys, ranges and defaults; do not invent keys.",
  "Retune a state with `statePresets` / `stateColors` (merged key by key), not by forking the orb file.",
  "Feed a real signal through `volumes` (input = user speech energy, output = agent speech energy, both 0..1) when you have one; otherwise leave it synthesized.",
  "Keep mounted orbs under about a dozen per page — each is a WebGL context and browsers cap those near 16. `pauseOffscreen` (default true) handles scrolling, not count.",
  "Install through the shadcn CLI, never npm. Two files land: components/ui/orba-core.tsx (the runtime) and components/ui/<slug>.tsx (the orb). They import nothing but React.",
  "The runtime is a client component; the orb renders nothing on the server and needs no dynamic import. It respects prefers-reduced-motion by drawing one static frame.",
  "Use the `wrapper` prop for a bezel (glass, ring, dotted, ticks, reticle, grid, halftone, scanlines). Never wrap the canvas in your own border that changes its footprint."
];

export function buildLlmsTxt(): string {
  const entries = getCatalog();
  const first = primary();
  return `# ${SITE_NAME}

${SITE_DESCRIPTION}
${SITE_HOMEPAGE}

Orbs are state-driven avatars for voice and chat agents: pass state="idle" | "thinking" | "speaking" and the orb's motion, colour and energy follow. Source is copied into your project via the shadcn registry, not npm. Zero runtime dependencies. WebGL 1.

## When to use

Use ${SITE_NAME} when an agent is building a UI that needs a live, expressive presence: a voice-assistant avatar, a status indicator for an LLM call, a hero object on a landing page, a loading state that should feel alive.

Do not use it for a static icon, a chart, or anything that has to render on the server or without WebGL.

## How to call it

1. Install one orb (the shared runtime comes along automatically):

   ${shadcnAddUrlCommand(first.slug)}

   Or, if the project's components.json aliases the @${REGISTRY_NAMESPACE} registry: ${shadcnAddCommand(first.slug)}

2. Render it and map your agent's status onto its state:

\`\`\`tsx
${usageSnippet(first)}
\`\`\`

3. Install the skill from ${absolute("/skill.md")} so the chooser and the rules run without fetching this file every time.

## Machine-readable

${machineReadableLinks()}

## CLI

One orb:

${shadcnAddUrlCommand("<slug>")}

Every orb:

${shadcnAddUrlCommand("all")}

Files land in components/ui/. The orb imports the runtime from @/components/ui/orba-core.

## States

${STATES.map((s) => `- ${s.name} — ${s.meaning}`).join("\n")}

Each state synthesizes two volume signals — input (user speech energy) and output (agent speech energy) — which the shader reads as uniforms. Params glide between states, and rate params are integrated into a clock, so a state change never jumps the animation.

## Props (every orb)

${propsTable()}

## Rules

${RULES.map((r) => `- ${r}`).join("\n")}

## Chooser

${chooserTable()}

Every orb, with its one-line look. Params and colours are the keys you may pass; fetch ${absolute("/api/v1/components/<slug>")} for ranges and defaults.

${catalogTable(entries)}

## Playground

Every orb has a live playground with all three states and every param as a slider: ${absolute("/playground?orb=<slug>&state=<idle|thinking|speaking>")}. The playground emits the exact JSX for whatever you dial in.

## Credits

Built by ${CREATOR_NAME} (${CREATOR_URL}). Source: ${REPO_URL}. MIT.
`;
}

export function buildAgentsMd(): string {
  const first = primary();
  return `# For agents

A skill file, a chooser, and a JSON catalog. The agent installs an orb, wires the app's status onto its state, and can read every param back.

${SITE_NAME} is ${SITE_DESCRIPTION.replace(/^Orba is /, "")}

## What an agent does with it

1. Pick an orb from the chooser below (or the full catalog in ${absolute("/llms.txt")}).
2. Install it with the shadcn CLI. The runtime file comes with it.
3. Map the app's status onto \`state\` — idle, thinking, speaking. That is the whole integration.
4. If asked to tune the look, read the orb's params from ${absolute("/api/v1/components/<slug>")} and pass \`params\`, or retune a state with \`statePresets\`.

## How to call it

1. Put ${absolute("/skill.md")} and ${absolute("/skill/recipes.md")} in the skills folder the agent already reads.
2. Install an orb: \`${shadcnAddUrlCommand(first.slug)}\`
3. Ask for the UI. One orb, driven by state.

\`\`\`tsx
${usageSnippet(first)}
\`\`\`

## Chooser

${chooserTable()}

## Rules

${RULES.map((r) => `- ${r}`).join("\n")}

## Try it

### Voice assistant

Build the call screen for our voice agent. It has connecting, listening, and speaking states from the SDK.

Use an ${SITE_NAME} orb as the avatar. Map connecting to thinking, listening to idle, speaking to speaking. Feed the mic level into volumes.input. Don't animate it yourself.

### Landing hero

Add a hero object to the landing page — something alive but calm.

Use an ${SITE_NAME} orb in its idle state with the glass wrapper. Size 420. Don't add a border or a shadow around it.

### Retune

The thinking state on our orb is too busy for the dashboard.

Read the orb's params from the API and pass a statePresets override for thinking only. Keep idle and speaking as shipped.

## Links

- llms.txt: ${absolute("/llms.txt")}
- Skill: ${absolute("/skill.md")}
- Recipes: ${absolute("/skill/recipes.md")}
- JSON catalog: ${absolute("/api/v1/components")}
- OpenAPI: ${absolute("/openapi.json")}
- Developer API: ${absolute("/developers")}
- Playground: ${absolute("/playground")}
- Source: ${REPO_URL}
`;
}

export function buildSkillMd(): string {
  const first = primary();
  return `---
name: ${REGISTRY_NAMESPACE}
description: >-
  Adds a live WebGL shader orb to a React app as the avatar or status
  indicator for a voice or chat agent, driven by state="idle" | "thinking" |
  "speaking". Installs the orb through the shadcn registry (never npm), maps
  the app's connection status onto the orb's state, feeds real mic or TTS
  levels through volumes, and retunes a state with statePresets instead of
  forking the file. Use when the user asks for an AI avatar, a voice-agent
  orb, a "thinking" indicator, an animated sphere or blob for a hero, or
  mentions ${SITE_NAME}, shader orbs, shdr-NN, or @${REGISTRY_NAMESPACE}.
---

# ${REGISTRY_NAMESPACE}

State-driven WebGL orbs. Two files per install, zero dependencies, React 18+.

## Procedure

1. Decide if an orb earns it. A live agent presence, a hero object, a loading state → yes. A static icon, a chart, server-rendered content → no.
2. Pick one orb from the chooser. Unsure? \`${first.slug}\` (${orbVariantMap[first.slug]?.note ?? "the default"}).
3. Install it. Never npm.

   \`\`\`bash
   ${shadcnAddUrlCommand(first.slug)}
   \`\`\`

   Two files land: \`components/ui/orba-core.tsx\` and \`components/ui/${first.slug}.tsx\`. If the project already has orba-core, the CLI leaves it alone.

4. Render it and map status onto state. Copy from [recipes.md](recipes.md). Do not animate the orb yourself; do not set \`paused\` unless the user asks for a still.
5. Tuning: fetch \`${absolute("/api/v1/components/<slug>")}\` for the orb's param keys, ranges and defaults. Pass \`params\` for a fixed override, \`statePresets\` / \`stateColors\` to retune one state. Only keys the orb declares do anything.
6. Check the rules. Then send.

## Chooser

${chooserTable()}

Full catalog with every orb's one-line look: ${absolute("/llms.txt")}. Live previews: ${absolute("/playground?orb=<slug>")}.

## Rules

${RULES.map((r) => `- ${r}`).join("\n")}

## Props

${propsTable()}

## Links

- llms.txt: ${absolute("/llms.txt")}
- agents.md: ${absolute("/agents.md")}
- JSON catalog: ${absolute("/api/v1/components")}
- OpenAPI: ${absolute("/openapi.json")}
`;
}

export function buildRecipesMd(): string {
  const first = primary();
  const c = first.componentName;
  const mod = first.fileName.replace(/\.tsx$/, "");
  const variant = orbVariantMap[first.slug];
  const rateKey = variant?.params.find((p) => p.integrate)?.key ?? "speed";
  const colorKey = variant?.colors[0]?.key;
  return `# Recipes

Load this after [SKILL.md](SKILL.md) when you are about to write the JSX. Swap \`${c}\` / \`${mod}\` for the orb you picked; every orb has the same props.

## Voice agent avatar

Map the SDK's status onto the three states. The orb glides between them.

\`\`\`tsx
"use client";

import { ${c} } from "@/components/ui/${mod}";

export function AgentAvatar({ status, agentSpeaking }: { status: "connecting" | "connected"; agentSpeaking: boolean }) {
  const state =
    status === "connecting" ? "thinking"
    : agentSpeaking ? "speaking"
    : "idle";

  return <${c} size={320} state={state} ariaLabel="Assistant" />;
}
\`\`\`

## Live audio

Feed real levels (0..1). \`input\` is the user's mic, \`output\` is the agent's voice. Omit a channel to keep its synthesized motion.

\`\`\`tsx
<${c} size={320} state={state} volumes={{ input: micLevel, output: ttsLevel }} />
\`\`\`

## Landing hero

Idle, large, under a glass bezel. The wrapper never changes the footprint, so nothing reflows.

\`\`\`tsx
<${c} size={420} state="idle" wrapper="glass" />
\`\`\`

## Retune one state

Merged key by key over the orb's own presets: this touches one param of one state and nothing else. Fetch ${absolute(`/api/v1/components/${first.slug}`)} for the keys.

\`\`\`tsx
<${c}
  state={state}
  statePresets={{ thinking: { ${rateKey}: 1.2 } }}${colorKey ? `
  stateColors={{ speaking: { ${colorKey}: "#ffb347" } }}` : ""}
/>
\`\`\`

## Fixed override

\`params\` wins over every state. Use it for a look that must not change with state.

\`\`\`tsx
<${c} state={state} params={{ ${rateKey}: 0.6 }} />
\`\`\`

## A gallery of orbs

Keep it under about a dozen mounted. \`pauseOffscreen\` is already on, so scrolling is free; the count is what matters.

\`\`\`tsx
{orbs.slice(0, 12).map((Orb) => (
  <Orb key={Orb.name} size={160} state="idle" />
))}
\`\`\`

## Next.js

The runtime is a client component. An orb can be rendered from a server component directly — no dynamic import, no ssr: false. It paints nothing on the server and mounts on the client.

\`\`\`tsx
// app/page.tsx (server component)
import { ${c} } from "@/components/ui/${mod}";

export default function Page() {
  return <${c} size={280} state="idle" />;
}
\`\`\`
`;
}

/* ---------------------------------- API ----------------------------------- */

export function buildApiIndex() {
  return {
    version: API_VERSION,
    name: `${SITE_NAME} API`,
    description:
      "Read-only JSON catalog of every orb: param schema, colours, state presets, install command. No authentication. URL versioned under /api/v1/.",
    openapi: absolute("/openapi.json"),
    endpoints: [
      { method: "GET", path: "/api/v1/health", summary: "Health check", operationId: "getHealth" },
      { method: "GET", path: "/api/v1/components", summary: "List every orb", operationId: "listComponents" },
      {
        method: "GET",
        path: "/api/v1/components/{slug}",
        summary: "One orb with its full param schema and presets",
        operationId: "getComponent"
      },
      { method: "GET", path: "/llms.txt", summary: "Overview, chooser, props, catalog", operationId: "getLlmsTxt" },
      { method: "GET", path: "/agents.md", summary: "Agents page as markdown", operationId: "getAgentsMd" },
      { method: "GET", path: "/skill.md", summary: "Agent skill file", operationId: "getSkill" },
      { method: "GET", path: "/skill/recipes.md", summary: "Skill recipes", operationId: "getSkillRecipes" },
      { method: "GET", path: "/r/{name}.json", summary: "shadcn registry item", operationId: "getRegistryItem" },
      { method: "GET", path: "/r/registry.json", summary: "shadcn registry index", operationId: "getRegistryIndex" },
      { method: "GET", path: "/openapi.json", summary: "This OpenAPI document", operationId: "getOpenApi" }
    ]
  };
}

export function buildOpenApi() {
  const paramSchema = {
    type: "object",
    required: ["key", "label", "min", "max", "step", "default", "integrate"],
    properties: {
      key: { type: "string", description: "Pass this key through `params` or a `statePresets` entry." },
      label: { type: "string" },
      min: { type: "number" },
      max: { type: "number" },
      step: { type: "number" },
      default: { type: "number" },
      integrate: {
        type: "boolean",
        description: "A rate. The engine integrates it into a clock, so it sets speed, not phase."
      }
    }
  };
  const colorSchema = {
    type: "object",
    required: ["key", "label", "default"],
    properties: {
      key: { type: "string", description: "Pass this key through `colors` or a `stateColors` entry." },
      label: { type: "string" },
      default: { type: "string", description: "Hex colour." }
    }
  };
  const summarySchema = {
    type: "object",
    required: ["slug", "name", "title", "note", "description", "docs", "registry", "install", "paramCount", "colorCount"],
    properties: {
      slug: { type: "string", example: "shdr-11" },
      name: { type: "string", description: "React component name.", example: "Shdr11" },
      title: { type: "string" },
      note: { type: "string", description: "One-line look, lowercase." },
      description: { type: "string" },
      docs: { type: "string", format: "uri" },
      registry: { type: "string", format: "uri", description: "The shadcn registry item." },
      install: { type: "string", description: "shadcn CLI command." },
      paramCount: { type: "integer" },
      colorCount: { type: "integer" }
    }
  };
  const componentSchema = {
    allOf: [
      summarySchema,
      {
        type: "object",
        required: ["installByUrl", "file", "importPath", "dependencies", "params", "colors", "statePresets", "stateColors"],
        properties: {
          playground: { type: "string", format: "uri" },
          installByUrl: { type: "string", description: "shadcn CLI command that needs no registry alias." },
          file: { type: "string", description: "Where the orb lands in the consumer project." },
          importPath: { type: "string" },
          dependencies: { type: "array", items: { type: "string" } },
          params: { type: "array", items: { $ref: "#/components/schemas/Param" } },
          colors: { type: "array", items: { $ref: "#/components/schemas/Color" } },
          statePresets: {
            type: "object",
            description: "Per-state param targets the orb ships with, keyed idle / thinking / speaking.",
            additionalProperties: { type: "object", additionalProperties: { type: "number" } }
          },
          stateColors: {
            type: "object",
            description: "Per-state colours the orb ships with.",
            additionalProperties: { type: "object", additionalProperties: { type: "string" } }
          }
        }
      }
    ]
  };
  const problem = {
    type: "object",
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      status: { type: "integer" },
      detail: { type: "string" }
    }
  };

  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} API`,
      summary: "Every orb's param schema, colours and state presets, for agents that install and tune them.",
      description:
        "Public read API. Version 1 is URL-prefixed at /api/v1/. No authentication. Orb source files are copied with the shadcn CLI; this API describes them, it does not install them.",
      version: API_VERSION,
      license: { name: "MIT", url: `${REPO_URL}/blob/main/LICENSE` },
      contact: { name: CREATOR_NAME, url: CREATOR_URL }
    },
    servers: [{ url: SITE_HOMEPAGE, description: "Production" }],
    tags: [
      { name: "meta", description: "Health and API index." },
      { name: "catalog", description: "Orb list and one orb." },
      { name: "machine", description: "Skill, llms.txt, registry, OpenAPI." }
    ],
    paths: {
      "/api/v1": {
        get: {
          operationId: "getApiIndex",
          tags: ["meta"],
          summary: "API index",
          responses: { "200": { description: "API index.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiIndex" } } } } }
        }
      },
      "/api/v1/health": {
        get: {
          operationId: "getHealth",
          tags: ["meta"],
          summary: "Health check",
          responses: { "200": { description: "Healthy.", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } } }
        }
      },
      "/api/v1/components": {
        get: {
          operationId: "listComponents",
          tags: ["catalog"],
          summary: "List every orb",
          responses: {
            "200": {
              description: "Every orb, summarized.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["components"],
                    properties: { components: { type: "array", items: { $ref: "#/components/schemas/ComponentSummary" } } }
                  }
                }
              }
            }
          }
        }
      },
      "/api/v1/components/{slug}": {
        get: {
          operationId: "getComponent",
          tags: ["catalog"],
          summary: "One orb with its full param schema and presets",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string", example: "shdr-11" } }],
          responses: {
            "200": { description: "The orb.", content: { "application/json": { schema: { $ref: "#/components/schemas/Component" } } } },
            "404": { description: "No such orb.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } }
          }
        }
      },
      "/llms.txt": { get: { operationId: "getLlmsTxt", tags: ["machine"], summary: "Overview, chooser, props, catalog", responses: { "200": { description: "Markdown.", content: { "text/markdown": { schema: { type: "string" } } } } } } },
      "/agents.md": { get: { operationId: "getAgentsMd", tags: ["machine"], summary: "Agents page as markdown", responses: { "200": { description: "Markdown.", content: { "text/markdown": { schema: { type: "string" } } } } } } },
      "/skill.md": { get: { operationId: "getSkill", tags: ["machine"], summary: "Agent skill file", responses: { "200": { description: "Markdown with YAML frontmatter.", content: { "text/markdown": { schema: { type: "string" } } } } } } },
      "/skill/recipes.md": { get: { operationId: "getSkillRecipes", tags: ["machine"], summary: "Skill recipes", responses: { "200": { description: "Markdown.", content: { "text/markdown": { schema: { type: "string" } } } } } } },
      "/r/{name}.json": {
        get: {
          operationId: "getRegistryItem",
          tags: ["machine"],
          summary: "shadcn registry item",
          parameters: [{ name: "name", in: "path", required: true, schema: { type: "string", example: "shdr-11" }, description: "An orb slug, `orba-core`, or `all`." }],
          responses: { "200": { description: "shadcn registry item JSON, including the source files.", content: { "application/json": { schema: { type: "object" } } } } }
        }
      },
      "/openapi.json": { get: { operationId: "getOpenApi", tags: ["machine"], summary: "This document", responses: { "200": { description: "OpenAPI 3.1.", content: { "application/json": { schema: { type: "object" } } } } } } }
    },
    components: {
      schemas: {
        ApiIndex: { type: "object", properties: { version: { type: "string" }, name: { type: "string" }, description: { type: "string" }, openapi: { type: "string", format: "uri" }, endpoints: { type: "array", items: { type: "object", properties: { method: { type: "string" }, path: { type: "string" }, summary: { type: "string" }, operationId: { type: "string" } } } } } },
        Health: { type: "object", required: ["status", "version"], properties: { status: { type: "string", enum: ["ok"] }, version: { type: "string" }, orbs: { type: "integer" } } },
        Param: paramSchema,
        Color: colorSchema,
        ComponentSummary: summarySchema,
        Component: componentSchema,
        Problem: problem
      }
    }
  };
}
