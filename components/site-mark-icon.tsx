import { useId } from "react";

export type SiteMarkIconProps = {
  className?: string;
};

/** Inline SVG of the Orba site mark (same artwork as `app/icon.svg`). */
export function SiteMarkIcon({ className }: SiteMarkIconProps) {
  const uid = useId().replace(/:/g, "");
  const plate = `${uid}-plate`;
  const sphere = `${uid}-sphere`;
  const sheen = `${uid}-sheen`;
  const rim = `${uid}-rim`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 190 190"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect width="190" height="190" rx="44" fill={`url(#${plate})`} />

      {/* dashed orbital guides, echoing the shader's precession axes */}
      <ellipse
        cx="95"
        cy="95"
        rx="62"
        ry="62"
        stroke="black"
        strokeOpacity="0.12"
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />
      <ellipse
        cx="95"
        cy="95"
        rx="62"
        ry="24"
        stroke="black"
        strokeOpacity="0.14"
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />
      <ellipse
        cx="95"
        cy="95"
        rx="24"
        ry="62"
        stroke="black"
        strokeOpacity="0.14"
        strokeWidth="0.8"
        strokeDasharray="2 2"
      />

      <circle cx="95" cy="95" r="46" fill={`url(#${sphere})`} />
      <circle cx="95" cy="95" r="46" fill={`url(#${rim})`} />
      <ellipse cx="79" cy="75" rx="20" ry="14" fill={`url(#${sheen})`} opacity="0.75" />

      <defs>
        <linearGradient id={plate} x1="0" y1="190" x2="343.583" y2="-147.25" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="#808080" />
        </linearGradient>

        <radialGradient id={sphere} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#f4f4f5" />
          <stop offset="0.42" stopColor="#7c6bd6" />
          <stop offset="0.72" stopColor="#2b3f8c" />
          <stop offset="1" stopColor="#0b0b12" />
        </radialGradient>

        {/* fresnel: bright at the silhouette edge, clear through the middle */}
        <radialGradient id={rim} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="white" stopOpacity="0" />
          <stop offset="0.94" stopColor="#a5b4fc" stopOpacity="0.55" />
          <stop offset="1" stopColor="white" stopOpacity="0.9" />
        </radialGradient>

        <radialGradient id={sheen} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="white" stopOpacity="0.95" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
