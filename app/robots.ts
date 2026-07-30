import type { MetadataRoute } from "next";

import { SITE_HOMEPAGE } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", SITE_HOMEPAGE).href
  };
}
