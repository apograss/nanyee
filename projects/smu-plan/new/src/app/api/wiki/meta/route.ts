import { NextRequest } from "next/server";
import { getArticleMeta } from "@/lib/wiki/queries";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const topTags = Math.min(100, Math.max(1, Number(url.searchParams.get("topTags") || "30")));
  const topContributors = Math.min(50, Math.max(1, Number(url.searchParams.get("topContributors") || "8")));

  const meta = await getArticleMeta(topTags, topContributors);

  return Response.json(
    { ok: true, data: meta },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
