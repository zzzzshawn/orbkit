import { API_VERSION, getCatalog } from "@/lib/agent-docs";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { status: "ok", version: API_VERSION, orbs: getCatalog().length },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
