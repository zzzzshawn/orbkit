import type { Metadata } from "next";

import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import {
  PropsTable,
  PropsTableIcons,
  renderDefault,
  renderNumber,
  renderType
} from "@/components/props-table";
import { orbRegistry } from "@/lib/registry-config";
import { orbVariantMap } from "@/lib/orb-component-map";
import type { OrbWrapper } from "@/orbs/core/orba-core";
import { shadcnAddCommand } from "@/lib/site-config";

/*
  The wrapper names, restated rather than imported.

  This page is a server component and orba-core is a "use client" module, so
  its runtime exports arrive here as client references — `ORB_WRAPPERS` would
  be a proxy, not the array. Typed as an exhaustive Record over the union so
  the build breaks if a wrapper is ever added to the core without being listed
  here; Object.keys preserves this insertion order.
*/
const WRAPPER_NAMES: Record<OrbWrapper, true> = {
  none: true,
  glass: true,
  ring: true,
  dotted: true,
  ticks: true,
  reticle: true,
  grid: true,
  halftone: true,
  scanlines: true
};

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
        <DocsCode lang="tsx">{`import { ${first.componentName} } from "@/components/ui/${first.fileName.replace(".tsx", "")}";

export function AgentAvatar() {
  return <${first.componentName} size={280} state="idle" />;
}`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Driving it from your agent">
        <p>
          Map your own connection state onto the orb&apos;s three states. The orb handles the
          transition — params glide, and the animation phase stays continuous.
        </p>
        <DocsCode lang="tsx">{`const orbState =
  status === "connecting" ? "thinking"
  : isAgentSpeaking ? "speaking"
  : "idle";

return <${first.componentName} size={320} state={orbState} />;`}</DocsCode>
      </DocsSection>

      <DocsSection heading="Props">
        <PropsTable
          columns={[
            { label: "Prop", width: "18%", icon: PropsTableIcons.key, mono: true },
            { label: "Type", width: "26%", icon: PropsTableIcons.type, mono: true, wrap: true },
            { label: "Default", width: "14%", icon: PropsTableIcons.value, mono: true },
            { label: "Notes", width: "42%", icon: PropsTableIcons.text, wrap: true }
          ]}
          rows={([
                ["size", "number", "280", "Rendered diameter in CSS pixels."],
                [
                  "state",
                  `"idle" | "thinking" | "speaking"`,
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
                [
                  "wrapper",
                  "OrbWrapper",
                  `"none"`,
                  `Decoration drawn around the orb: ${Object.keys(WRAPPER_NAMES).join(", ")}.`
                ],
                [
                  "wrapperColor",
                  "string",
                  `"currentColor"`,
                  "What the wrapper draws its lines in. Glass ignores it."
                ],
                ["className", "string", "—", "Applied to the outermost element."],
                [
                  "style",
                  "CSSProperties",
                  "—",
                  "Merged onto the outermost element's style."
                ],
                [
                  "ariaLabel",
                  "string",
                  "—",
                  "When set the orb is role=img; otherwise it is aria-hidden."
                ]
              ] as ReadonlyArray<readonly [string, string, string, string]>).map(
            ([prop, type, dflt, notes]) => ({
              key: prop,
              cells: [
                <span key="p" className="font-medium text-fg-strong">
                  {prop}
                </span>,
                renderType(type),
                renderDefault(dflt),
                notes
              ]
            })
          )}
        />
      </DocsSection>

      <DocsSection heading="Sizing">
        <p>
          <code>size</code> sets both width and height. To size from CSS instead, drop{" "}
          <code>size</code> and give the canvas a class — the runtime tracks the element box with
          a <code>ResizeObserver</code> and re-renders at the new resolution.
        </p>
        <DocsCode lang="tsx">{`<${first.componentName} className="size-full" state="speaking" />`}</DocsCode>
      </DocsSection>

      {/* One table per orb, generated from its param schema — the same data the
          playground builds its sliders from, so these can never drift. */}
      {orbRegistry.map((orb) => {
        const variant = orbVariantMap[orb.slug];
        if (!variant) return null;
        return (
          <DocsSection
            key={orb.slug}
            className="mt-8"
            heading={`Shader parameters — ${variant.label}`}
          >
            <p>
              {variant.note}. Pass any subset through <code>params</code>; anything you leave out
              follows the active state&apos;s preset.
            </p>
            <PropsTable
              columns={[
                { label: "Key", width: "24%", icon: PropsTableIcons.key, mono: true },
                { label: "Label", width: "32%", icon: PropsTableIcons.text, wrap: true },
                { label: "Range", width: "26%", icon: PropsTableIcons.range, mono: true },
                { label: "Default", width: "18%", icon: PropsTableIcons.value, mono: true }
              ]}
              rows={variant.params.map((p) => ({
                key: p.key,
                cells: [
                  <span key="k" className="font-medium text-fg-strong">
                    {p.key}
                  </span>,
                  p.label,
                  <span key="r">
                    {renderNumber(p.min)}
                    <span className="text-fg-dim"> – </span>
                    {renderNumber(p.max)}
                  </span>,
                  <span key="d">{renderNumber(p.default)}</span>
                ]
              }))}
            />
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
        <DocsCode lang="bash">{shadcnAddCommand("all")}</DocsCode>
      </DocsSection>
    </DocsShell>
  );
}
