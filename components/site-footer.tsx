import Link from "next/link";

import { OrbMark } from "@/components/orb-mark";

import { CREATOR_URL, REGISTRY_NAMESPACE } from "@/lib/site-config";

const REPO_URL = "https://github.com/zzzzshawn/orba";
const SPONSOR_URL = "https://github.com/sponsors/zzzzshawn";
const VERSION = "v0.1.0";

const footerActionClass =
  "text-fg-dim md:text-lg tracking-wide outline-offset-2 transition-[color,transform] duration-200 ease-out hover:text-link-hover focus-visible:text-link-hover motion-reduce:transition-colors";

export function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      className="relative mx-auto mb-8 mt-20 h-[85dvh] w-full max-w-[1350px] rounded-3xl bg-surface md:mt-40 md:h-[70dvh]"
    >
      <span
        className="pointer-events-none absolute right-1/2 flex translate-x-1/2 -rotate-6 items-center justify-center max-md:bottom-28! md:top-1/2 md:-translate-y-1/2"
        aria-hidden="true"
      >
        <OrbMark size={340} className="text-foreground max-md:scale-[0.824]" />
      </span>

      <div className="pointer-events-auto absolute left-8 top-8 z-10 flex flex-col gap-2.5 text-xl italic md:text-3xl">
        <span>
          <span className="text-3xl font-semibold md:text-5xl">@{REGISTRY_NAMESPACE}</span> —{" "}
          {VERSION}
        </span>
        <nav
          aria-label="Documentation"
          className="flex flex-col gap-2 pt-10 text-lg font-normal not-italic tracking-normal md:text-xl"
        >
          <Link href="/getting-started/introduction" className={footerActionClass}>
            Introduction
          </Link>
          <Link href="/getting-started/usage" className={footerActionClass}>
            Usage
          </Link>
          <Link href="/getting-started/manual" className={footerActionClass}>
            Manual setup
          </Link>
          <Link href="/agents" className={footerActionClass}>
            For agents
          </Link>
          <a
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={footerActionClass}
          >
            Sponsor creator
          </a>
        </nav>
      </div>

      <span className="absolute bottom-4 left-6 z-10 inline-flex flex-col items-end gap-2.5 italic md:right-8 md:top-6 md:text-3xl">
        <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer" className="text-base">
          x.com
        </a>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-base">
          github
        </a>
      </span>

      <span className="absolute bottom-4 right-8 z-10 inline-flex items-center gap-2.5 text-3xl">
        <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer">
          by shawn.
        </a>
      </span>
    </footer>
  );
}
