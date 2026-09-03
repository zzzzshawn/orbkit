import { buildApiIndex } from "@/lib/agent-docs";

export const dynamic = "force-static";

export function GET() {
  return Response.json(buildApiIndex(), {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" }
  });
}
