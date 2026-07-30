import type { Metadata } from "next";

import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import { orbRegistry } from "@/lib/registry-config";
import { orbVariantMap } from "@/lib/orb-component-map";
import { shadcnAddCommand } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Usage",
  description: "Props, agent states, and shader parameters for Orba orbs."
};

export default function UsagePage() {
  const first = orbRegistry[0];

  return (
    <DocsShell
      title="Usage"
      lead="Every orb takes the same small prop surface. Shader parameters are optional — leave them out and the orb follows the preset for its current state."
      active="/getting-started/usage"
    >
      <DocsSection heading="Basic">
        <DocsCode>{`import { ${first.componentName} } from "@/components/ui/${first.fileName.replace(".tsx", "")}";

export function AgentAvatar() {
  return <${first.componentName} size={280} state="idle" />;
}`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Driving it from your agent">
        <p>
          Map your own connection state onto the orb&apos;s four states. The orb handles the
          transition — params glide, and the animation phase stays continuous.
        </p>
        <DocsCode>{`const orbState =
  status === "connecting" ? "thinking"
  : isUserSpeaking ? "listening"
  : isAgentSpeaking ? "speaking"
  : "idle";

return <${first.componentName} size={320} state={orbState} />;`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Props">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse text-left text-sm">
            <thead className="text-fg-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">Prop</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Default</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="text-fg-muted">
              {[
                ["size", "number", "280", "Rendered diameter in CSS pixels."],
                [
                  "state",
                  `"idle" | "listening" | "thinking" | "speaking"`,
                  `"idle"`,
                  "Drives the synthesized volume signals."
                ],
                [
                  "params",
                  "Partial<Record<string, number>>",
                  "—",
                  "Any key here overrides the state preset for that param."
                ],
                ["colors", "Partial<Record<string, string>>", "—", "Hex overrides, where the orb declares colors."],
                ["paused", "boolean", "false", "Freeze on the current frame."],
                [
                  "pauseOffscreen",
                  "boolean",
                  "true",
                  "Stop rendering while scrolled out of view."
                ],
                ["maxDpr", "number", "2", "Device-pixel-ratio ceiling."],
                ["className", "string", "—", "Applied to the canvas."],
                ["style", "CSSProperties", "—", "Merged onto the canvas style."],
                [
                  "ariaLabel",
                  "string",
                  "—",
                  "When set the canvas is role=img; otherwise it is aria-hidden."
                ]
              ].map(([prop, type, dflt, notes]) => (
                <tr key={prop} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-4 font-mono text-xs text-fg-strong">{prop}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{type}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{dflt}</td>
                  <td className="py-2">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocsSection>

      <DocsSection heading="Sizing">
        <p>
          <code>size</code> sets both width and height. To size from CSS instead, drop{" "}
          <code>size</code> and give the canvas a class — the runtime tracks the element box with
          a <code>ResizeObserver</code> and re-renders at the new resolution.
        </p>
        <DocsCode>{`<${first.componentName} className="size-full" state="speaking" />`}</DocsCode>
      </DocsSection>

      {/* One table per orb, generated from its param schema — the same data the
          playground builds its sliders from, so these can never drift. */}
      {orbRegistry.map((orb) => {
        const variant = orbVariantMap[orb.slug];
        if (!variant) return null;
        return (
          <DocsSection key={orb.slug} heading={`Shader parameters — ${variant.label}`}>
            <p>
              {variant.note}. Pass any subset through <code>params</code>; anything you leave out
              follows the active state&apos;s preset.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead className="text-fg-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-medium">Key</th>
                    <th className="py-2 pr-4 font-medium">Label</th>
                    <th className="py-2 pr-4 font-medium">Range</th>
                    <th className="py-2 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody className="text-fg-muted">
                  {variant.params.map((p) => (
                    <tr key={p.key} className="border-b border-border-soft">
                      <td className="py-2 pr-4 font-mono text-xs text-fg-strong">{p.key}</td>
                      <td className="py-2 pr-4">{p.label}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {p.min} – {p.max}
                      </td>
                      <td className="py-2 font-mono text-xs">{p.default}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocsSection>
        );
      })}

      <DocsSection heading="Performance">
        <p>
          Each orb owns one WebGL context, and browsers cap the number of live contexts (commonly
          around 16). A page with many orbs is fine because they pause offscreen, but if you need
          dozens visible at once, render them at a smaller <code>size</code> and consider lowering{" "}
          <code>maxDpr</code> to 1.
        </p>
        <DocsCode>{shadcnAddCommand("all")}</DocsCode>
      </DocsSection>
    </DocsShell>
  );
}
