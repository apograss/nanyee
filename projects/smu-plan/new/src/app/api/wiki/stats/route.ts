import { getKBStats } from "@/lib/wiki/queries";

export async function GET() {
  const stats = await getKBStats();

  return Response.json(
    { ok: true, data: stats },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
