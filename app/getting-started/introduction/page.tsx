import type { Metadata } from "next";
import Link from "next/link";

import { DocsCode, DocsSection, DocsShell } from "@/components/docs-shell";
import { orbRegistry } from "@/lib/registry-config";
import { SITE_DESCRIPTION, SITE_NAME, shadcnAddCommand } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Introduction",
  description: SITE_DESCRIPTION
};

export default function IntroductionPage() {
  const firstSlug = orbRegistry[0]?.slug ?? "orb-hydrogen";

  return (
    <DocsShell
      title={`${SITE_NAME} — shader orbs you own`}
      lead={SITE_DESCRIPTION}
      active="/getting-started/introduction"
    >
      <DocsSection heading="What you get">
        <p>
          Each orb is a fragment shader rendered into a transparent canvas by a small
          dependency-free WebGL runtime. There is no three.js, no scene graph, and no npm package
          to depend on — you install the source into your project and edit it like any other
          component.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          <li>Two files per install: the shared runtime and the orb itself.</li>
          <li>
            Zero runtime dependencies. The orb renders on a canvas and needs no CSS beyond your
            own layout.
          </li>
          <li>
            Every shader uniform is a documented, range-checked parameter you can tune in the{" "}
            <Link href="/playground" className="theme-link underline underline-offset-4">
              playground
            </Link>
            .
          </li>
        </ul>
      </DocsSection>

      <DocsSection heading="Install">
        <p>Add an orb through the shadcn CLI. The shared runtime comes along automatically.</p>
        <DocsCode>{shadcnAddCommand(firstSlug)}</DocsCode>
        <p className="text-fg-muted">Or install every orb at once:</p>
        <DocsCode>{shadcnAddCommand("all")}</DocsCode>
      </DocsSection>

      <DocsSection heading="Agent states">
        <p>
          Orbs are built for voice and agent UIs, so they take a <code>state</code> rather than a
          pile of animation props. Each state synthesizes two volume signals — input (user speech
          energy) and output (agent speech energy) — which the shader reads as uniforms.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          <li>
            <code>idle</code> — calm, slow drift.
          </li>
          <li>
            <code>listening</code> — restless, wide chroma, pulsing with the user&apos;s voice.
          </li>
          <li>
            <code>thinking</code> — the same restless motion with a slower wander.
          </li>
          <li>
            <code>speaking</code> — fast, bright, strongly precessing.
          </li>
        </ul>
        <p>
          Params glide between states rather than snapping, and rate params are integrated into a
          clock, so a state change never jumps the animation phase.
        </p>
      </DocsSection>

      <DocsSection heading="Requirements">
        <p>
          React 18 or later and a browser with WebGL 1. The runtime is a client component
          (<code>&quot;use client&quot;</code>) and renders nothing on the server. It respects{" "}
          <code>prefers-reduced-motion</code> by drawing a single static frame, and pauses itself
          when scrolled out of view.
        </p>
      </DocsSection>
    </DocsShell>
  );
}
