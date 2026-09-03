import { absolute, getCatalog, getCatalogEntry } from "@/lib/agent-docs";

export const dynamic = "force-static";

/** Prerender every orb; an unknown slug is a 404 at build and at runtime. */
export function generateStaticParams() {
  return getCatalog().map((entry) => ({ slug: entry.slug }));
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const entry = getCatalogEntry(slug);
  if (!entry) {
    return Response.json(
      {
        type: "about:blank",
        title: "Not found",
        status: 404,
        detail: `No orb named "${slug}". List them at ${absolute("/api/v1/components")}.`
      },
      { status: 404, headers: { "content-type": "application/problem+json" } }
    );
  }
  return Response.json(entry, {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" }
  });
}
