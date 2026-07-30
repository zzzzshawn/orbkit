import type { MetadataRoute } from "next";

import { orbRegistry } from "@/lib/registry-config";
import { SITE_HOMEPAGE } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, SITE_HOMEPAGE).href;

  return [
    { url: url("/"), priority: 1 },
    { url: url("/playground"), priority: 0.8 },
    { url: url("/getting-started/introduction"), priority: 0.7 },
    { url: url("/getting-started/usage"), priority: 0.7 },
    { url: url("/getting-started/manual"), priority: 0.6 },
    ...orbRegistry.map((orb) => ({
      url: url(`/playground?orb=${orb.slug}`),
      priority: 0.5
    }))
  ];
}
