import type { Metadata } from "next";

import { CopyButton } from "@/components/copy-button";
import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import { ShikiCodeView } from "@/components/shiki-code-view";
import { orbRegistry } from "@/lib/registry-config";
import { getManualSetupSources, getOrbSource } from "@/lib/source";

export const metadata: Metadata = {
  title: "Manual setup",
  description: "Install Orba orbs by copying the runtime and component files directly."
};

export default async function ManualSetupPage() {
  const first = orbRegistry[0];
  const [{ coreFilePath, coreSource }, orbSources] = await Promise.all([
    getManualSetupSources(),
    Promise.all(orbRegistry.map((orb) => getOrbSource(orb.fileName)))
  ]);

  // The runtime once, then one file per orb — copy the core plus whichever orbs
  // you want.
  const files: Array<{ path: string; source: string }> = [
    { path: coreFilePath, source: coreSource },
    ...orbRegistry.map((orb, i) => ({
      path: `components/ui/${orb.fileName}`,
      source: orbSources[i]
    }))
  ];

  return (
    <DocsShell
      title="Manual setup"
      lead="Not using the shadcn CLI? Copy the runtime plus the orbs you want into your project. They import nothing but React."
      active="/getting-started/manual"
    >
      <DocsSection heading="1. Check your alias">
        <p>
          The orb imports the runtime from <code>@/components/ui/orba-core</code>. If your project
          uses a different alias, adjust the import at the top of the orb file — that is the only
          path either file references.
        </p>
        <DocsCode lang="jsonc">{`// tsconfig.json
{
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}`}</DocsCode>
      </DocsSection>

      {files.map((file, index) => (
        <DocsSection key={file.path} heading={`${index + 2}. ${file.path}`}>
          <div className="relative rounded-lg bg-code-bg p-4">
            <div className="absolute right-3 top-3 z-10">
              <CopyButton
                value={file.source}
                className="inline-flex items-center justify-center rounded-md bg-surface-soft p-1.5 text-fg-strong transition-opacity duration-150 ease-out hover:opacity-90"
                iconClassName="size-4"
              />
            </div>
            <div className="max-h-[70dvh] overflow-auto">
              <ShikiCodeView code={file.source} lang="tsx" />
            </div>
          </div>
        </DocsSection>
      ))}

      <DocsSection heading={`${files.length + 2}. Use it`}>
        <DocsCode lang="tsx">{`import { ${first.componentName} } from "@/components/ui/${first.fileName.replace(".tsx", "")}";

<${first.componentName} size={280} state="idle" />`}</DocsCode>
      </DocsSection>
    </DocsShell>
  );
}
