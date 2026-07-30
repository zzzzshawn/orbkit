"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { HeroInstallCommand } from "@/components/hero-install-command";
import { OrbGalleryGridCard, type OrbCard } from "@/components/orb-gallery-grid-card";
import { orbComponentMap } from "@/lib/orb-component-map";
import { shadcnAddCommand } from "@/lib/site-config";
import { ORB_STATES, type OrbState } from "@/orbs/core/orba-core";

const heroNavLinkClassName =
  "text-fg-dim inline-block outline-offset-2 transition-[color,transform] duration-200 ease-out hover:text-link-hover focus-visible:text-link-hover motion-reduce:transition-colors";

const HERO_NAV_LINKS = [
  { label: "Introduction", href: "/getting-started/introduction" },
  { label: "Usage", href: "/getting-started/usage" },
  { label: "Manual setup", href: "/getting-started/manual" }
];

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking"
};

export function OrbGallery({ items }: { items: OrbCard[] }) {
  // Orbs have no color prop — their equivalent "try it" control is the agent
  // state, so the whole grid switches state together.
  const [state, setState] = useState<OrbState>("idle");

  const firstSlug = items[0]?.slug ?? "orb-hydrogen";
  const installCommand = shadcnAddCommand(firstSlug);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:gap-10 lg:px-8">
      <section>
        <div className="mt-10 grid gap-6 sm:mt-8 lg:grid-cols-[1.4fr_auto] lg:items-end">
          <div className="flex flex-col gap-8">
            <div className="space-y-4">
              <div className="flex w-full justify-between sm:gap-4">
                <h1 className="theme-text-strong text-balance text-3xl tracking-tight sm:text-8xl">
                  <span className="block">
                    Shader{" "}
                    <span
                      className="-mx-0.5 hidden size-[0.95em] translate-y-1 rotate-5 rounded-md bg-[#dfdfdf] p-0.5 sm:-ml-1 sm:-mr-3 sm:inline-block sm:translate-y-3 sm:rounded-[22px] sm:p-1"
                      aria-hidden="true"
                    >
                      <Image
                        src="/icon.svg"
                        alt=""
                        width={200}
                        height={200}
                        className="size-full select-none"
                        draggable={false}
                        priority
                      />
                    </span>{" "}
                    orbs for every agent.
                  </span>
                </h1>

                <div className="flex w-max shrink-0 flex-col items-end gap-1 pt-1.5 text-xs sm:gap-2 sm:pt-4 sm:text-2xl">
                  {HERO_NAV_LINKS.map((link) => (
                    <Link key={link.href} href={link.href} className={heroNavLinkClassName}>
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href={`/playground?orb=${encodeURIComponent(firstSlug)}`}
                    className={heroNavLinkClassName}
                  >
                    Playground
                  </Link>
                </div>
              </div>

              <p className="max-w-[65ch] text-pretty text-sm leading-relaxed tracking-tight sm:text-2xl">
                {items.length} free and open-source WebGL orb
                {items.length === 1 ? "" : "s"}, built with React, TypeScript, and shadcn. Every
                orb reacts to agent state and exposes its shader params. Install one, copy the
                code, and make it yours.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <HeroInstallCommand installCommand={installCommand} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div
          className="flex flex-wrap items-center gap-1"
          role="radiogroup"
          aria-label="Preview agent state"
        >
          {ORB_STATES.map((value) => {
            const active = value === state;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setState(value)}
                className={`rounded-lg px-3 py-2 text-xs tracking-wide transition-colors duration-150 ease-out sm:text-sm ${
                  active
                    ? "bg-preset text-fg-strong"
                    : "text-fg-dim hover:text-link-hover"
                }`}
              >
                {STATE_LABELS[value]}
              </button>
            );
          })}
        </div>
      </section>

      <section
        id="orb-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 xl:grid-cols-5"
      >
        {items.map((item) => {
          const PreviewComponent = orbComponentMap[item.slug];
          if (!PreviewComponent) return null;
          return (
            <OrbGalleryGridCard
              key={item.slug}
              item={item}
              PreviewComponent={PreviewComponent}
              state={state}
            />
          );
        })}
      </section>
    </main>
  );
}
