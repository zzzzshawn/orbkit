import { buildOpenApi } from "@/lib/agent-docs";

export const dynamic = "force-static";

export function GET() {
  return Response.json(buildOpenApi(), {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" }
  });
}
