import { getHomePreview } from "@/lib/wiki/queries";

export async function GET() {
  const preview = await getHomePreview();

  return Response.json(
    { ok: true, data: preview },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
  );
}
