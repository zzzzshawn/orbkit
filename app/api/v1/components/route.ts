import { getCatalog, summarize } from "@/lib/agent-docs";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { components: getCatalog().map(summarize) },
    { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } }
  );
}
