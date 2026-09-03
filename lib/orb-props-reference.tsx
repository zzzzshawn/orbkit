import type { ReactNode } from "react";

import { HIDE_CODE_SCROLLBARS } from "@/lib/hide-code-scrollbar-class";
import { PropsTable, PropsTableIcons, renderNumber } from "@/components/props-table";
import { orbVariantMap } from "@/lib/orb-component-map";
import { ORB_STATES, ORB_WRAPPERS } from "@/orbs/core/orba-core";

/*
  Props reference for the details drawer.

  Same table design as the Props and Shader parameters sections in
  /getting-started/usage, down to the column classes, so the drawer and the
  docs read as one surface. The rows are generated rather than hand-kept:
  the shared props are fixed by `ShaderOrbProps`, and the params / colors
  rows come from the same `OrbVariant` the playground builds its sliders
  from — so adding an orb or renaming a param updates both places at once.

  Types and defaults are tinted with the code tokens (--color-code-literal /
  -keyword / -type), which mirror lib/orba-code-theme.ts — the theme this site
  highlights with. So `"idle"` in the Default column is the same white as
  `state="idle"` in the snippet above it, `false` the same blue, and `number`
  the same teal. The colour carries the same meaning in both places rather
  than being decoration; punctuation and prose stay muted so the tint marks
  the value, not the whole cell.
*/

const TYPE_KEYWORDS = new Set([
  "number",
  "string",
  "boolean",
  "Partial",
  "Record",
  "CSSProperties",
  "OrbWrapper"
]);

/** Tints a type signature the way Shiki would: literals mint, names peach. */
function renderType(type: string): ReactNode {
  // Split into quoted literals and everything else, then split the rest into
  // identifiers vs punctuation so `Partial<Record<string, number>>` keeps its
  // angle brackets and commas quiet.
  return type.split(/("[^"]*")/g).map((chunk, i) => {
    if (!chunk) return null;
    if (chunk.startsWith('"')) {
      return (
        <span key={i} className="text-code-literal">
          {chunk}
        </span>
      );
    }
    return chunk.split(/([A-Za-z]+)/g).map((word, j) =>
      TYPE_KEYWORDS.has(word) ? (
        <span key={`${i}-${j}`} className="text-code-type">
          {word}
        </span>
      ) : (
        <span key={`${i}-${j}`}>{word}</span>
      )
    );
  });
}

/** Tints a default the way the theme would: literals white, language
    constants blue. */
function renderDefault(value: string): ReactNode {
  if (value === "—") return <span className="text-fg-dim">{value}</span>;
  if (value === "true" || value === "false")
    return <span className="text-code-keyword">{value}</span>;
  return <span className="text-code-literal">{value}</span>;
}

const STATE_UNION = ORB_STATES.map((s) => `"${s}"`).join(" | ");

/*
  Spelled out in the Notes column rather than the Type column: eleven quoted
  members is a wider union than this table's Type cell can carry without
  wrapping every other row's type onto two lines.
*/
const WRAPPER_VALUES = ORB_WRAPPERS.join(", ");

const SHARED_PROP_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["size", "number", "280", "Rendered diameter in CSS pixels."],
  ["state", STATE_UNION, `"idle"`, "Drives the synthesized volume signals."],
  [
    "params",
    "Partial<Record<string, number>>",
    "—",
    "Any key here overrides the state preset for that param."
  ],
  [
    "colors",
    "Partial<Record<string, string>>",
    "—",
    "Hex overrides, where the orb declares colors."
  ],
  ["paused", "boolean", "false", "Freeze on the current frame."],
  ["pauseOffscreen", "boolean", "true", "Stop rendering while scrolled out of view."],
  ["maxDpr", "number", "2", "Device-pixel-ratio ceiling."],
  ["wrapper", "OrbWrapper", `"none"`, `Decoration drawn around the orb: ${WRAPPER_VALUES}.`],
  [
    "wrapperColor",
    "string",
    `"currentColor"`,
    "What the wrapper draws its lines in. Glass ignores it."
  ],
  ["className", "string", "—", "Applied to the outermost element."],
  ["style", "CSSProperties", "—", "Merged onto the outermost element's style."],
  [
    "ariaLabel",
    "string",
    "—",
    "When set the orb is role=img; otherwise it is aria-hidden."
  ]
];

const dotRail = (
  <div className="flex items-center gap-1 overflow-hidden">
    {Array.from({ length: 150 }).map((_, i) => (
      <div key={i} className="size-0.5 shrink-0 rounded-full bg-(--color-dot-faint)" />
    ))}
  </div>
);

function Section({
  heading,
  intro,
  children
}: {
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {/* {dotRail} */}
      {/* pt-6: these sections stack directly on one another, and pt-1 left
          the next heading sitting on the previous table. */}
      <div className="grid gap-3 pt-6">
        <div className="grid gap-1.5">
          <p className="theme-text-strong text-base font-semibold tracking-tight">{heading}</p>
          {intro ? <p className="theme-text-muted text-[13px] leading-relaxed">{intro}</p> : null}
        </div>
        <div className={`overflow-x-auto ${HIDE_CODE_SCROLLBARS}`}>{children}</div>
      </div>
    </>
  );
}

export function OrbPropsReference({ slug }: { slug: string }) {
  const variant = orbVariantMap[slug];

  return (
    <>
      <Section heading="Component props">
        <PropsTable
          columns={[
            { label: "Prop", width: "18%", icon: PropsTableIcons.key, mono: true },
            { label: "Type", width: "26%", icon: PropsTableIcons.type, mono: true, wrap: true },
            { label: "Default", width: "14%", icon: PropsTableIcons.value, mono: true },
            { label: "Notes", width: "42%", icon: PropsTableIcons.text, wrap: true }
          ]}
          rows={SHARED_PROP_ROWS.map(([prop, type, dflt, notes]) => ({
            key: prop,
            cells: [
              <span key="p" className="font-medium text-fg-strong">
                {prop}
              </span>,
              renderType(type),
              renderDefault(dflt),
              notes
            ]
          }))}
        />
      </Section>

      {variant && variant.params.length > 0 ? (
        <Section
          heading="Shader parameters"
          intro={
            <>
              Pass any subset through <code className="font-mono">params</code>; anything you
              leave out follows the active state&apos;s preset.
            </>
          }
        >
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
        </Section>
      ) : null}

      {variant && variant.colors.length > 0 ? (
        <Section
          heading="Colors"
          intro={
            <>
              Pass any subset through <code className="font-mono">colors</code> as hex strings.
            </>
          }
        >
          <PropsTable
            columns={[
              { label: "Key", width: "28%", icon: PropsTableIcons.key, mono: true },
              { label: "Label", width: "40%", icon: PropsTableIcons.text, wrap: true },
              { label: "Default", width: "32%", icon: PropsTableIcons.value, mono: true }
            ]}
            rows={variant.colors.map((c) => ({
              key: c.key,
              cells: [
                <span key="k" className="font-medium text-fg-strong">
                  {c.key}
                </span>,
                c.label,
                <span key="d" className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 shrink-0 rounded-full border border-border-soft"
                    style={{ backgroundColor: c.default }}
                  />
                  <span className="text-code-literal">{c.default}</span>
                </span>
              ]
            }))}
          />
        </Section>
      ) : null}
    </>
  );
}
