/**
 * Single source of truth for the library's public identity.
 *
 * Renaming the library means editing this file and re-running
 * `pnpm registry:build` — every registry JSON, install command, and docs
 * snippet is derived from these values.
 */

/** shadcn registry namespace. Install commands read `@<namespace>/<item>`. */
export const REGISTRY_NAMESPACE = "orbkit";

/** Human-facing product name. */
export const SITE_NAME = "Orbkit";

/** Where the registry is served from. Consumers fetch `<homepage>/r/<item>.json`. */
export const SITE_HOMEPAGE =
  process.env.REGISTRY_HOMEPAGE ?? "https://orbkit.zzzzshawn.cloud";

export const SITE_DESCRIPTION =
  "Orbkit is a React component library of WebGL shader orbs — expressive, state-driven orbs you install via the shadcn registry and own as local code.";

export const CREATOR_NAME = "zzzzshawn";
export const CREATOR_URL = "https://x.com/zzzzshawn/";

/** Public source repository. */
export const REPO_URL = "https://github.com/zzzzshawn/orbkit";

/** The repository as owner/name, the form shadcn's GitHub-address installs take. */
export const REPO_SLUG = REPO_URL.replace(/^https:\/\/github\.com\//, "");

/**
 * How install commands address the registry.
 *
 * "github" resolves with no consumer setup and works today. Flip it to
 * "namespace" once @orbkit is in the shadcn registry index and
 * `npx shadcn add @orbkit/<item>` resolves on its own; every install command
 * on the site, in the docs, and in the agent surface follows this switch.
 */
export const INSTALL_ADDRESS = "github" as "github" | "namespace";

export function scopedItemName(itemName: string): string {
  return `@${REGISTRY_NAMESPACE}/${itemName}`;
}

/** `zzzzshawn/orbkit/shdr-11` today, `@orbkit/shdr-11` once the index lists the namespace. */
export function registryItemAddress(itemName: string): string {
  return INSTALL_ADDRESS === "github" ? `${REPO_SLUG}/${itemName}` : scopedItemName(itemName);
}

/** The headline install command. */
export function shadcnAddCommand(itemName: string): string {
  return `npx shadcn@latest add ${registryItemAddress(itemName)}`;
}

/** The namespaced form, valid once components.json aliases the registry or the index lists it. */
export function shadcnAddNamespacedCommand(itemName: string): string {
  return `npx shadcn@latest add ${scopedItemName(itemName)}`;
}

/** The components.json entry that makes the namespaced form resolve today. */
export const REGISTRY_ALIAS_SNIPPET = `"registries": {
  "@${REGISTRY_NAMESPACE}": "${SITE_HOMEPAGE}/r/{name}.json"
}`;
