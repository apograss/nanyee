import { getWikiLeaderboard } from "@/lib/wiki/queries";

export async function GET() {
  const leaderboard = await getWikiLeaderboard();

  return Response.json({
    ok: true,
    data: leaderboard,
  });
}
