import Image from "next/image";
import Link from "next/link";

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
        className="pointer-events-none absolute right-1/2 size-[280px] translate-x-1/2 -rotate-6 rounded-[76px] bg-background p-1.5 max-md:bottom-28! sm:p-3 md:top-1/2 md:size-[340px] md:-translate-y-1/2 md:rounded-[86px] [html[data-theme='dark']_&]:bg-[#d0d0d0] [html[data-theme='dark']_&]:shadow-[0_3px_4px_0px_rgba(255,255,255,1)_inset]"
        aria-hidden="true"
      >
        <Image
          src="/icon.svg"
          alt=""
          width={200}
          height={200}
          className="size-full select-none rounded-[74px] shadow-[0_40px_80px_-21px_rgba(0,0,0,0.5)] [html[data-theme='dark']_&]:shadow-[0_40px_80px_-21px_rgba(0,0,0,1)]"
          draggable={false}
          priority
        />
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
