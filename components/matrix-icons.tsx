/* ----------------------------------------------------------------------------
   Dot-matrix UI icons — 11×11 dots on a 24×24 viewBox, every dot drawn faintly
   with the silhouette's dots at full opacity. Same construction across all
   icons so the header chrome reads as one set.
---------------------------------------------------------------------------- */

const ICON_DOT_GRID: Array<[number, number]> = [];
for (let y = 2; y <= 22; y += 2) {
  for (let x = 2; x <= 22; x += 2) {
    ICON_DOT_GRID.push([x, y]);
  }
}

const k = (x: number, y: number) => `${x},${y}`;

export type MatrixDotIconProps = {
  className?: string;
  /** SVG width/height in CSS pixels. Default 18. */
  size?: number;
};

function MatrixDotIcon({
  active,
  className,
  size = 18
}: MatrixDotIconProps & { active: Set<string> }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {ICON_DOT_GRID.map(([x, y]) => (
        <circle key={k(x, y)} cx={x} cy={y} r="0.7" fill="currentColor" opacity={0.1} />
      ))}
      {ICON_DOT_GRID.filter(([x, y]) => active.has(k(x, y))).map(([x, y]) => (
        <circle key={`on-${k(x, y)}`} cx={x} cy={y} r="0.8" fill="currentColor" />
      ))}
    </svg>
  );
}

const CLIPBOARD_SHELL = [
  k(10, 2), k(12, 2), k(14, 2),
  k(8, 4), k(10, 4), k(12, 4), k(14, 4), k(16, 4),
  k(8, 6), k(10, 6), k(12, 6), k(14, 6), k(16, 6),
  k(4, 6), k(4, 8), k(4, 10), k(4, 12), k(4, 14), k(4, 16), k(4, 18), k(4, 20),
  k(20, 6), k(20, 8), k(20, 10), k(20, 12), k(20, 14), k(20, 16), k(20, 18), k(20, 20),
  k(6, 22), k(8, 22), k(10, 22), k(12, 22), k(14, 22), k(16, 22), k(18, 22)
];

const COPY_DOTS = new Set(CLIPBOARD_SHELL);

const CHECK_DOTS = new Set([
  ...CLIPBOARD_SHELL,
  k(8, 16), k(10, 18), k(12, 16), k(14, 14), k(16, 12)
]);

const THEME_DOTS = new Set([
  k(2, 8), k(2, 10), k(2, 12), k(2, 14), k(2, 16),
  k(4, 6), k(4, 8), k(4, 10), k(4, 12), k(4, 14), k(4, 16), k(4, 18),
  k(6, 4), k(6, 6), k(6, 8), k(6, 14), k(6, 16), k(6, 18), k(6, 20),
  k(8, 2), k(8, 4), k(8, 6), k(8, 16), k(8, 18), k(8, 20), k(8, 22),
  k(10, 2), k(10, 4), k(10, 18), k(10, 20), k(10, 22),
  k(12, 2), k(12, 6), k(12, 8), k(12, 10), k(12, 12), k(12, 14), k(12, 16), k(12, 18), k(12, 22),
  k(14, 2), k(14, 6), k(14, 8), k(14, 10), k(14, 12), k(14, 14), k(14, 16), k(14, 18), k(14, 22),
  k(16, 2), k(16, 8), k(16, 10), k(16, 12), k(16, 14), k(16, 16), k(16, 22),
  k(18, 4), k(18, 10), k(18, 12), k(18, 14), k(18, 20),
  k(20, 6), k(20, 18),
  k(22, 8), k(22, 10), k(22, 12), k(22, 14), k(22, 16)
]);

const HOME_DOTS = new Set([
  k(16, 2), k(16, 4), k(12, 4),
  k(10, 6), k(12, 6), k(14, 6),
  k(8, 8), k(10, 8), k(12, 8), k(14, 8), k(16, 8),
  k(6, 10), k(8, 10), k(10, 10), k(12, 10), k(14, 10), k(16, 10), k(18, 10),
  k(6, 12), k(8, 12), k(16, 12), k(18, 12),
  k(6, 14), k(8, 14), k(16, 14), k(18, 14),
  k(6, 16), k(8, 16), k(16, 16), k(18, 16),
  k(6, 18), k(8, 18), k(16, 18), k(18, 18),
  k(6, 20), k(8, 20), k(10, 20), k(12, 20), k(14, 20), k(16, 20), k(18, 20)
]);

export function CopyClipboardIcon(props: MatrixDotIconProps) {
  return <MatrixDotIcon {...props} active={COPY_DOTS} />;
}

export function CheckIcon(props: MatrixDotIconProps) {
  return <MatrixDotIcon {...props} active={CHECK_DOTS} />;
}

export function ThemeMatrixIcon(props: MatrixDotIconProps) {
  return <MatrixDotIcon {...props} active={THEME_DOTS} />;
}

export function HomeMatrixIcon(props: MatrixDotIconProps) {
  return <MatrixDotIcon {...props} active={HOME_DOTS} />;
}

export type ShadcnPackageManager = "npm" | "yarn" | "bun" | "pnpm";

export const SHADCN_PACKAGE_MANAGERS: ShadcnPackageManager[] = ["npm", "yarn", "bun", "pnpm"];

export function shadcnRegistryAddCommand(pm: ShadcnPackageManager, scopedItemName: string) {
  switch (pm) {
    case "yarn":
      return `yarn dlx shadcn@latest add ${scopedItemName}`;
    case "bun":
      return `bunx shadcn@latest add ${scopedItemName}`;
    case "pnpm":
      return `pnpm dlx shadcn@latest add ${scopedItemName}`;
    default:
      return `npx shadcn@latest add ${scopedItemName}`;
  }
}
