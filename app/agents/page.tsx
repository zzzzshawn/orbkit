import type { Metadata } from "next";
import Link from "next/link";

import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import {
  CHOOSER,
  REPO_URL,
  SHARED_PROPS,
  STATES,
  absolute,
  getCatalog,
  shadcnAddUrlCommand
} from "@/lib/agent-docs";
import { orbRegistry } from "@/lib/registry-config";
import { SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "For agents",
  description: `How an AI agent installs, wires and tunes ${SITE_NAME} orbs: a skill file, a chooser, llms.txt and a JSON catalog.`
};

const MACHINE_LINKS: ReadonlyArray<[string, string, string]> = [
  ["llms.txt", "/llms.txt", "Overview, chooser, props, every orb"],
  ["agents.md", "/agents.md", "This page as markdown"],
  ["skill.md", "/skill.md", "Agent skill with frontmatter"],
  ["skill/recipes.md", "/skill/recipes.md", "JSX recipes the skill loads"],
  ["api/v1/components", "/api/v1/components", "JSON catalog"],
  ["api/v1/components/{slug}", "/api/v1/components/shdr-11", "One orb: params, colours, presets"],
  ["openapi.json", "/openapi.json", "OpenAPI 3.1"],
  ["r/{slug}.json", "/r/shdr-11.json", "shadcn registry item"]
];

const linkClass = "theme-link underline underline-offset-4";

export default function AgentsPage() {
  const first = orbRegistry.find((o) => o.slug === "shdr-11") ?? orbRegistry[0];
  const catalog = getCatalog();
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));

  return (
    <DocsShell
      title="For agents"
      lead="A skill file, a chooser, and a JSON catalog. An agent installs an orb, maps the app's status onto its state, and can read every parameter back."
      active="/agents"
    >
      <DocsSection heading="What an agent does with it">
        <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
          <li>Picks an orb from the chooser, or the full catalog in llms.txt.</li>
          <li>Installs it with the shadcn CLI. The runtime file comes with it.</li>
          <li>
            Maps the app&apos;s status onto <code>state</code> — idle, thinking, speaking. That is
            the whole integration.
          </li>
          <li>
            When asked to tune the look, reads the orb&apos;s params from the API and passes{" "}
            <code>params</code>, or retunes one state with <code>statePresets</code>.
          </li>
        </ol>
      </DocsSection>

      <DocsSection heading="How to call it">
        <p>
          Put the skill in the folder the agent already reads, install an orb, and ask for the
          UI.
        </p>
        <DocsCode>{`${absolute("/skill.md")}\n${absolute("/skill/recipes.md")}`}</DocsCode>
        <DocsCode lang="bash">{shadcnAddUrlCommand(first.slug)}</DocsCode>
        <DocsCode lang="tsx">{`import { ${first.componentName} } from "@/components/ui/${first.slug}";

const orbState =
  status === "connecting" ? "thinking"
  : isAgentSpeaking ? "speaking"
  : "idle";

<${first.componentName} size={320} state={orbState} />`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Machine-readable">
        <ul className="space-y-1 text-fg-muted">
          {MACHINE_LINKS.map(([label, href, what]) => (
            <li key={href}>
              <a href={href} className={`${linkClass} font-mono text-[13px]`}>
                {label}
              </a>{" "}
              — {what}
            </li>
          ))}
        </ul>
      </DocsSection>

      <DocsSection heading="States">
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          {STATES.map((s) => (
            <li key={s.name}>
              <code>{s.name}</code> — {s.meaning}
            </li>
          ))}
        </ul>
        <p>
          Each state synthesizes two volume signals, input (user speech energy) and output (agent
          speech energy), which the shader reads. Pass real levels through <code>volumes</code>{" "}
          when you have them.
        </p>
      </DocsSection>

      <DocsSection heading="Chooser">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-fg-dim">
              <tr>
                <th className="py-1 pr-4 font-normal">The ask</th>
                <th className="py-1 font-normal">Try first</th>
              </tr>
            </thead>
            <tbody>
              {CHOOSER.map((row) => (
                <tr key={row.ask} className="border-t border-(--color-dot-faint)">
                  <td className="py-2 pr-4 align-top">{row.ask}</td>
                  <td className="py-2 align-top">
                    {row.picks.map((slug, i) => (
                      <span key={slug}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/playground?orb=${slug}`} className={`${linkClass} font-mono`}>
                          {slug}
                        </Link>
                        {bySlug.get(slug)?.note ? (
                          <span className="text-fg-dim"> ({bySlug.get(slug)?.note})</span>
                        ) : null}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-fg-muted">
          Every orb with its one-line look is in{" "}
          <a href="/llms.txt" className={linkClass}>
            llms.txt
          </a>
          ; every prop is on the{" "}
          <Link href="/getting-started/usage" className={linkClass}>
            usage
          </Link>{" "}
          page ({SHARED_PROPS.length} shared props, then per-orb params).
        </p>
      </DocsSection>

      <DocsSection heading="Rules">
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          <li>One orb per agent, driven by state. Do not animate it yourself.</li>
          <li>Override only params the orb declares; read them from the API. Do not invent keys.</li>
          <li>Retune a state with statePresets, not by forking the orb file.</li>
          <li>Install through the shadcn CLI, never npm. Two files land; they import nothing but React.</li>
          <li>Keep mounted orbs under about a dozen per page — each is a WebGL context.</li>
          <li>Use the wrapper prop for a bezel; never add a border that changes the footprint.</li>
        </ul>
      </DocsSection>

      <DocsSection heading="Try it">
        <p className="text-fg-muted">Prompts that exercise the skill.</p>
        <DocsCode>{`Build the call screen for our voice agent. It has connecting, listening, and speaking states from the SDK.

Use an ${SITE_NAME} orb as the avatar. Map connecting to thinking, listening to idle, speaking to speaking. Feed the mic level into volumes.input. Don't animate it yourself.`}</DocsCode>
        <DocsCode>{`The thinking state on our orb is too busy for the dashboard.

Read the orb's params from the API and pass a statePresets override for thinking only. Keep idle and speaking as shipped.`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Links">
        <ul className="space-y-1 text-fg-muted">
          <li>
            <Link href="/developers" className={linkClass}>
              Developer API
            </Link>
          </li>
          <li>
            <a href={REPO_URL} className={linkClass} target="_blank" rel="noopener noreferrer">
              Source on GitHub
            </a>
          </li>
        </ul>
      </DocsSection>
    </DocsShell>
  );
}
