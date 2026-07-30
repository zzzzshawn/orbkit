/**
 * Single source of truth for the library's public identity.
 *
 * Renaming the library means editing this file and re-running
 * `pnpm registry:build` — every registry JSON, install command, and docs
 * snippet is derived from these values.
 */

/** shadcn registry namespace. Install commands read `@<namespace>/<item>`. */
export const REGISTRY_NAMESPACE = "orba";

/** Human-facing product name. */
export const SITE_NAME = "Orba";

/** Where the registry is served from. Consumers fetch `<homepage>/r/<item>.json`. */
export const SITE_HOMEPAGE =
  process.env.REGISTRY_HOMEPAGE ?? "https://orba.zzzzshawn.cloud";

export const SITE_DESCRIPTION =
  "Orba is a React component library of WebGL shader orbs — expressive, state-driven orbs you install via the shadcn registry and own as local code.";

export const CREATOR_NAME = "zzzzshawn";
export const CREATOR_URL = "https://x.com/zzzzshawn/";

/** `npx shadcn@latest add @orba/orb-hydrogen` */
export function shadcnAddCommand(itemName: string): string {
  return `npx shadcn@latest add @${REGISTRY_NAMESPACE}/${itemName}`;
}

export function scopedItemName(itemName: string): string {
  return `@${REGISTRY_NAMESPACE}/${itemName}`;
}
