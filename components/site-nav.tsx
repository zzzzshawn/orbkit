"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "Playground", href: "/playground", match: "/playground" },
  { label: "Docs", href: "/getting-started/introduction", match: "/getting-started" },
  { label: "Agents", href: "/agents", match: "/agents" },
  { label: "API", href: "/developers", match: "/developers" }
];

/**
 * The site's text navigation, shown in the fixed header on every page
 * including home. Sits in the same pill style as the icon buttons beside it.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Site"
      className="hidden h-9 items-center gap-0.5 rounded-xl bg-preset p-1 sm:flex"
    >
      {LINKS.map((link) => {
        const active = pathname === link.match || pathname.startsWith(`${link.match}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1 text-sm tracking-tight transition-colors duration-150 ease-out focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) ${
              active ? "text-fg-strong" : "text-fg-dim hover:text-link-hover"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
