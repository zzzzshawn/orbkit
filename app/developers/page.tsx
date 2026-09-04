import type { Metadata } from "next";

import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import { API_VERSION, absolute, buildApiIndex } from "@/lib/agent-docs";
import { SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Developer API",
  description: `The read-only JSON API for ${SITE_NAME}: every orb's param schema, colours and state presets.`
};

const linkClass = "theme-link underline underline-offset-4";

export default function DevelopersPage() {
  const index = buildApiIndex();

  return (
    <DocsShell
      title="Developer API"
      lead={`A read-only JSON catalog of every orb — param schema, colours, state presets, install command — for tools and agents. No authentication. Version ${API_VERSION}, URL-prefixed at /api/v1/.`}
      active="/developers"
    >
      <DocsSection heading="Endpoints">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-fg-dim">
              <tr>
                <th className="py-1 pr-4 font-normal">Path</th>
                <th className="py-1 pr-4 font-normal">Summary</th>
                <th className="py-1 font-normal">operationId</th>
              </tr>
            </thead>
            <tbody>
              {index.endpoints.map((e) => (
                <tr key={e.path} className="border-t border-(--color-dot-faint)">
                  <td className="py-2 pr-4 align-top font-mono text-[13px]">
                    <a href={e.path.replace("{slug}", "shdr-11").replace("{name}", "shdr-11")} className={linkClass}>
                      {e.path}
                    </a>
                  </td>
                  <td className="py-2 pr-4 align-top">{e.summary}</td>
                  <td className="py-2 align-top font-mono text-[13px] text-fg-dim">{e.operationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-fg-muted">
          The full contract is the{" "}
          <a href="/openapi.json" className={linkClass}>
            OpenAPI document
          </a>
          . Every response is JSON except the markdown files, which are text/markdown.
        </p>
      </DocsSection>

      <DocsSection heading="One orb">
        <p>
          The per-orb document carries everything an agent needs to pass <code>params</code>,{" "}
          <code>colors</code>, <code>statePresets</code> and <code>stateColors</code> correctly:
          each param&apos;s key, range, step, default and whether it is a rate.
        </p>
        <DocsCode lang="bash">{`curl ${absolute("/api/v1/components/shdr-11")}`}</DocsCode>
        <DocsCode lang="jsonc">{`{
  "slug": "shdr-11",
  "name": "Shdr11",
  "install": "npx shadcn@latest add @orbkit/shdr-11",
  "params": [
    { "key": "speed", "label": "…", "min": 0.015, "max": 10, "step": 0.05, "default": 0.5, "integrate": true },
    …
  ],
  "colors": [ { "key": "…", "label": "…", "default": "#…" } ],
  "statePresets": { "idle": { … }, "thinking": { … }, "speaking": { … } },
  "stateColors": { … }
}`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Versioning">
        <p>
          Version 1 lives under <code>/api/v1/</code>. Fields are only ever added; a breaking
          change would ship as <code>/api/v2/</code> with the old version kept alive alongside
          it. The shadcn registry under <code>/r/</code> is independent of the API and follows
          the shadcn registry schema.
        </p>
      </DocsSection>
    </DocsShell>
  );
}
