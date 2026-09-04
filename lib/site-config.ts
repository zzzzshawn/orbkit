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

/** `npx shadcn@latest add @orbkit/shdr-11` */
export function shadcnAddCommand(itemName: string): string {
  return `npx shadcn@latest add @${REGISTRY_NAMESPACE}/${itemName}`;
}

export function scopedItemName(itemName: string): string {
  return `@${REGISTRY_NAMESPACE}/${itemName}`;
}
