import Link from "next/link";
import type { ReactNode } from "react";

const DOCS_LINKS = [
  { label: "Introduction", href: "/getting-started/introduction" },
  { label: "Usage", href: "/getting-started/usage" },
  { label: "Manual setup", href: "/getting-started/manual" }
];

export function DocsShell({
  title,
  lead,
  active,
  children
}: {
  title: string;
  lead: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <main className="relative mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mt-16 flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <nav aria-label="Getting started" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {DOCS_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === active ? "page" : undefined}
                className={
                  link.href === active
                    ? "theme-text-strong"
                    : "text-fg-dim transition-colors duration-150 ease-out hover:text-link-hover"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <h1 className="theme-text-strong text-balance text-3xl tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-[70ch] text-pretty text-sm leading-relaxed tracking-tight text-fg-muted sm:text-lg">
            {lead}
          </p>
        </header>

        <div className="flex flex-col gap-10">{children}</div>
      </div>
    </main>
  );
}

export function DocsSection({
  heading,
  children
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="theme-text-strong text-xl tracking-tight sm:text-2xl">{heading}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg sm:text-base">
        {children}
      </div>
    </section>
  );
}

export function DocsCode({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-code-bg p-4 text-[12px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}
