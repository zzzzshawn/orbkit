import type { Metadata } from "next";

import { PlaygroundClient } from "@/app/playground/playground-client";
import { orbRegistry } from "@/lib/registry-config";

export const metadata: Metadata = {
  title: "Playground",
  description: "Tune every shader parameter live and copy the resulting orb code."
};

export default async function PlaygroundPage({
  searchParams
}: {
  searchParams: Promise<{ orb?: string; state?: string }>;
}) {
  const { orb, state } = await searchParams;

  return (
    <PlaygroundClient
      initialSlug={orb}
      initialState={state}
      orbs={orbRegistry.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        componentName: entry.componentName
      }))}
    />
  );
}
