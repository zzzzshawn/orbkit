import Link from "next/link";
import { Children, type ReactNode } from "react";
import type { BundledLanguage } from "shiki/bundle/web";

import { DocsEnter } from "@/components/docs-entrance";
import { ShikiCodeView } from "@/components/shiki-code-view";

const DOCS_LINKS = [
  { label: "Introduction", href: "/getting-started/introduction" },
  { label: "Usage", href: "/getting-started/usage" },
  { label: "Manual setup", href: "/getting-started/manual" },
  { label: "For agents", href: "/agents" },
  { label: "API", href: "/developers" }
];

/*
  Entrance timing. One uniform step from the title down: the title, the
  lead, then every section, each arriving one STEP after the last, all with
  the same blur-in. Past the cap the rest arrive together — they are below
  the fold, and nobody is waiting on a section two screens down.
*/
const STEP = 0.08;
const STAGGER_CAP = 10;

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
          {/* Static on purpose: the nav is the one thing that stays put as
              you move between these pages, so it never enters. */}
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

          <DocsEnter delay={0}>
            <h1 className="theme-text-strong text-balance text-3xl tracking-tight sm:text-5xl">
              {title}
            </h1>
          </DocsEnter>
          <DocsEnter delay={STEP}>
            <p className="max-w-[70ch] text-pretty text-sm leading-relaxed tracking-tight text-fg-muted sm:text-lg">
              {lead}
            </p>
          </DocsEnter>
        </header>

        <div className="flex flex-col gap-10">
          {Children.toArray(children).map((child, i) => (
            <DocsEnter key={i} delay={Math.min(i + 2, STAGGER_CAP) * STEP}>
              {child}
            </DocsEnter>
          ))}
        </div>
      </div>
    </main>
  );
}

export function DocsSection({
  heading,
  children,
  className
}: {
  heading: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className ?? ""}`}>
      <h2 className="theme-text-strong text-xl tracking-tight sm:text-2xl">{heading}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg sm:text-base">
        {children}
      </div>
    </section>
  );
}

/**
 * A code block. With `lang` it is syntax-highlighted by Shiki in the site's
 * own theme (the same one the playground and the manual-setup page use);
 * without it the text is set plain, which is right for prompts and URL
 * lists that are not code.
 */
export function DocsCode({ children, lang }: { children: string; lang?: BundledLanguage }) {
  if (lang) {
    return (
      <div className="overflow-x-auto rounded-lg bg-code-bg p-4">
        <ShikiCodeView code={children} lang={lang} lineNumbers={false} />
      </div>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-code-bg p-4 text-[12px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}
