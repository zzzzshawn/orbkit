import { Fragment, type ReactNode, type SVGProps } from "react";

import "./props-table.css";

/*
  Shared tinting, so the reference tables agree with the Shiki blocks beside
  them — and with each other. `--color-code-literal` is pure white, which is
  right for a string in a code block but leaves an all-numeric table looking
  flat, so numbers get the keyword blue: they are language constants like
  `true`/`false`, and it keeps them distinct from the cyan of type names.
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

export function renderType(type: string): ReactNode {
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

export function renderDefault(value: string): ReactNode {
  if (value === "—") return <span className="text-fg-dim">{value}</span>;
  if (value === "true" || value === "false")
    return <span className="text-code-keyword">{value}</span>;
  if (/^-?\d/.test(value)) return <span className="text-code-keyword">{value}</span>;
  return <span className="text-code-literal">{value}</span>;
}

/** A bare numeric value — param defaults, range bounds. */
export function renderNumber(value: number): ReactNode {
  return <span className="text-code-keyword">{value}</span>;
}

export interface PropsTableColumn {
  label: string;
  /** Column width as a percentage string, e.g. "18%". */
  width: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  /** Cells in this column are code — mono, and never wrapped. */
  mono?: boolean;
  /** Long prose: allow wrapping. */
  wrap?: boolean;
}

/** One 20x20 stroke icon, drawn at the weight the column heads use. */
function icon(path: string) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        width={20}
        height={20}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        <path d={path} />
      </svg>
    );
  };
}

export const PropsTableIcons = {
  /** `< >` — an identifier. */
  key: icon("M7 5 3 10l4 5M13 5l4 5-4 5"),
  /** A type mark. */
  type: icon("M4 6h12M10 6v9"),
  /** A boxed value. */
  value: icon("M10 3.5 16 7v6l-6 3.5L4 13V7z"),
  /** Ruled lines — prose. */
  text: icon("M5 5h10M5 9h10M5 13h6"),
  /** A span between two bounds. */
  range: icon("M4 10h12M4 7v6M16 7v6")
};

function DividerRow({ span }: { span: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={span} className="orbkit-props-table-divider-cell">
        <div className="orbkit-props-table-rule" />
      </td>
    </tr>
  );
}

/**
 * The reference table used for props, shader params and colors.
 *
 * Rows are `ReactNode[]` rather than strings so callers keep control of their
 * own tinting — the type/default cells arrive already coloured by the same
 * rules the code blocks use.
 */
export function PropsTable({
  columns,
  rows
}: {
  columns: readonly PropsTableColumn[];
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
}) {
  return (
    <div className="orbkit-props-table w-full overflow-x-auto p-1 rounded-lg">
      <table className="min-w-[520px] text-xs leading-[1.4]">
        <colgroup>
          {columns.map((c) => (
            <col key={c.label} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map(({ label, icon: Icon }) => (
              <th
                key={label}
                className="h-auto px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-fg-muted"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 text-fg-dim" />
                  <span className="truncate">{label}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <DividerRow span={columns.length} />
          {rows.map((row, index) => (
            <Fragment key={row.key}>
              {index > 0 ? <DividerRow span={columns.length} /> : null}
              <tr>
                {row.cells.map((cell, i) => {
                  const col = columns[i];
                  return (
                    <td
                      key={col?.label ?? i}
                      className={[
                        "px-3 py-3 align-top text-xs tracking-tight",
                        col?.mono ? "font-mono" : "",
                        col?.wrap ? "whitespace-normal" : "whitespace-nowrap"
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
