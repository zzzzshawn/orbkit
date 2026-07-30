import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { orbRegistry } from "../lib/registry-config";
import { REGISTRY_NAMESPACE, SITE_HOMEPAGE, SITE_NAME } from "../lib/site-config";

interface RegistryFile {
  path: string;
  type: "registry:ui";
  content: string;
}

const docsRoot = process.cwd();
const orbsRoot = path.join(docsRoot, "orbs");
const publicRegistryDir = path.join(docsRoot, "public", "r");
const registryName = `@${REGISTRY_NAMESPACE}`;
const allRegistryItemName = "all";

/**
 * The runtime every orb imports. Installed once, shared by all orbs.
 *
 * Typed `registry:ui`, not `registry:lib`: shadcn routes files by type, not by
 * the declared path, and `registry:lib` would drop this in the consumer's `lib`
 * alias while the orb still imports `@/components/ui/orba-core` — a broken
 * import on every install. It exports a component, so `registry:ui` is right.
 */
const CORE_TARGET_PATH = "components/ui/orba-core.tsx";

const importRewrites: ReadonlyArray<{ from: string; to: string }> = [
  { from: "../core/orba-core", to: "@/components/ui/orba-core" }
];

function rewriteImports(source: string): string {
  return importRewrites.reduce(
    (current, { from, to }) => current.replaceAll(`"${from}"`, `"${to}"`),
    source
  );
}

async function writeRegistrySource(pathInRegistry: string, content: string): Promise<void> {
  const absolutePath = path.join(publicRegistryDir, pathInRegistry);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf-8");
}

async function build() {
  await rm(publicRegistryDir, { recursive: true, force: true });
  await mkdir(publicRegistryDir, { recursive: true });

  const coreSource = await readFile(path.join(orbsRoot, "core", "orba-core.tsx"), "utf-8");
  const coreFile: RegistryFile = {
    path: CORE_TARGET_PATH,
    type: "registry:ui",
    content: coreSource
  };
  await writeRegistrySource(CORE_TARGET_PATH, coreSource);

  const orbRegistryItems = await Promise.all(
    orbRegistry.map(async (orb) => {
      const componentSource = rewriteImports(
        await readFile(path.join(orbsRoot, "orbs", orb.fileName), "utf-8")
      );
      const componentPath = `components/ui/${orb.fileName}`;

      // Order matters: shadcn writes files in sequence, and the orb imports
      // the core, so the core lands first.
      const files: RegistryFile[] = [
        coreFile,
        { path: componentPath, type: "registry:ui", content: componentSource }
      ];

      await writeRegistrySource(componentPath, componentSource);

      const item = {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: orb.slug,
        type: "registry:ui",
        title: orb.title,
        description: orb.description,
        dependencies: orb.dependencies,
        registryDependencies: [],
        meta: { renderer: "webgl" },
        files
      };

      await writeFile(
        path.join(publicRegistryDir, `${orb.slug}.json`),
        JSON.stringify(item, null, 2) + "\n",
        "utf-8"
      );

      return {
        files,
        name: orb.slug,
        type: "registry:ui" as const,
        title: orb.title,
        description: orb.description,
        dependencies: orb.dependencies,
        registryDependencies: [] as string[],
        url: `/r/${orb.slug}.json`
      };
    })
  );

  // "all" bundles every orb plus the shared core, de-duplicated by path.
  const allFilesByPath = new Map<string, RegistryFile>();
  for (const orbItem of orbRegistryItems) {
    for (const file of orbItem.files) {
      if (!allFilesByPath.has(file.path)) {
        allFilesByPath.set(file.path, file);
      }
    }
  }

  const allItem = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: allRegistryItemName,
    type: "registry:ui",
    title: `All ${SITE_NAME} Orbs`,
    description: "Installs every orb and the shared WebGL runtime in one command.",
    dependencies: [],
    registryDependencies: [],
    meta: { renderer: "webgl" },
    files: [...allFilesByPath.values()]
  };

  await writeFile(
    path.join(publicRegistryDir, `${allRegistryItemName}.json`),
    JSON.stringify(allItem, null, 2) + "\n",
    "utf-8"
  );

  const registryItems = [
    ...orbRegistryItems.map((item) => ({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      url: item.url
    })),
    {
      name: allRegistryItemName,
      type: "registry:ui",
      title: allItem.title,
      description: allItem.description,
      dependencies: allItem.dependencies,
      registryDependencies: allItem.registryDependencies,
      url: `/r/${allRegistryItemName}.json`
    }
  ];

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: registryName,
    homepage: SITE_HOMEPAGE,
    items: registryItems
  };

  await writeFile(
    path.join(docsRoot, "registry.json"),
    JSON.stringify(registry, null, 2) + "\n",
    "utf-8"
  );
  await writeFile(
    path.join(publicRegistryDir, "index.json"),
    JSON.stringify(registryItems, null, 2) + "\n",
    "utf-8"
  );
  await writeFile(
    path.join(publicRegistryDir, "registry.json"),
    JSON.stringify(registry, null, 2) + "\n",
    "utf-8"
  );

  console.log(
    `[orba] registry built: ${orbRegistry.length} orb(s) + "all" → public/r/`
  );
}

void build();
