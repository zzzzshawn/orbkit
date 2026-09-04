import { readFile } from "node:fs/promises";
import path from "node:path";

const orbsRoot = path.join(process.cwd(), "orbs");

/**
 * Dev-time relative imports → the paths shadcn actually installs to. Applied to
 * every source string the docs site shows, so a copied snippet compiles as-is.
 */
const importRewrites: ReadonlyArray<{ from: string; to: string }> = [
  { from: "../core/orbkit-core", to: "@/components/ui/orbkit-core" }
];

export function rewriteOrbImports(source: string): string {
  return importRewrites.reduce(
    (current, { from, to }) => current.replaceAll(`"${from}"`, `"${to}"`),
    source
  );
}

export async function getOrbSource(fileName: string): Promise<string> {
  const source = await readFile(path.join(orbsRoot, "orbs", fileName), "utf-8");
  return rewriteOrbImports(source);
}

export interface ManualSetupSources {
  coreFilePath: string;
  coreSource: string;
}

export async function getManualSetupSources(): Promise<ManualSetupSources> {
  const coreSource = await readFile(path.join(orbsRoot, "core", "orbkit-core.tsx"), "utf-8");
  return {
    coreFilePath: "components/ui/orbkit-core.tsx",
    coreSource
  };
}
