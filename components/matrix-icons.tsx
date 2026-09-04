/* ----------------------------------------------------------------------------
   UI icons for the header chrome and copy affordances. All line art on an
   18x18 viewBox, drawn in currentColor — the supplied artwork hardcoded
   #1c1f21, which would have gone invisible against the dark theme.
---------------------------------------------------------------------------- */

export type MatrixDotIconProps = {
  className?: string;
  /** SVG width/height in CSS pixels. Default 18. */
  size?: number;
};

/** Shared frame so every icon in this file lines up on the same grid. */
function IconFrame({
  className,
  size = 18,
  children
}: MatrixDotIconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** The clipboard body plus its tab — the shape both copy states share. */
const clipboard = (
  <>
    <path d="M6.25,2.75h-1c-1.105,0-2,.895-2,2V14.25c0,1.105,.895,2,2,2h7.5c1.105,0,2-.895,2-2V4.75c0-1.105-.895-2-2-2h-1" />
    <rect x="6.25" y="1.25" width="5.5" height="3" rx="1" ry="1" />
  </>
);

export function CopyClipboardIcon(props: MatrixDotIconProps) {
  return <IconFrame {...props}>{clipboard}</IconFrame>;
}

/**
 * The copied state: the same clipboard with a tick struck through it, so the
 * outline holds still and only the check arrives.
 */
export function CheckIcon(props: MatrixDotIconProps) {
  return (
    <IconFrame {...props}>
      {clipboard}
      <polyline points="6.25 10.25 8 12.25 11.75 7.25" />
    </IconFrame>
  );
}

/* ----------------------------------------------------------------------------
   The two header-chrome icons are line art rather than dot matrices. They keep
   the MatrixDotIconProps signature so the call sites are unchanged, and draw in
   currentColor — the supplied artwork hardcoded #1c1f21, which would have gone
   invisible against the dark theme.
---------------------------------------------------------------------------- */

export function ThemeMatrixIcon({ className, size = 18 }: MatrixDotIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M9,6v6c1.657,0,3-1.343,3-3s-1.343-3-3-3Z" fill="currentColor" />
      <path
        d="M9,12c-1.657,0-3-1.343-3-3s1.343-3,3-3V1.75C4.996,1.75,1.75,4.996,1.75,9s3.246,7.25,7.25,7.25v-4.25Z"
        fill="currentColor"
      />
      <circle
        cx="9"
        cy="9"
        r="7.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeMatrixIcon({ className, size = 18 }: MatrixDotIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9 16V12.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.145 5.95L8.395 1.96C8.753 1.688 9.248 1.688 9.605 1.96L14.855 5.95C15.104 6.139 15.25 6.434 15.25 6.746V14.25C15.25 15.355 14.355 16.25 13.25 16.25H4.75C3.645 16.25 2.75 15.355 2.75 14.25V6.746C2.75 6.433 2.896 6.139 3.145 5.95Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Brand marks for the header's external links. Filled glyphs rather than line
   art, since the marks are not ours to redraw, scaled onto the same 18x18 grid
   so they sit at the optical size of the icons above.
---------------------------------------------------------------------------- */

export function XIcon({ className, size = 18 }: MatrixDotIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
        transform="translate(1.8 1.8) scale(0.6)"
      />
    </svg>
  );
}

export function GitHubIcon({ className, size = 18 }: MatrixDotIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        fill="currentColor"
        transform="translate(1.75 1.75) scale(0.90625)"
      />
    </svg>
  );
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
