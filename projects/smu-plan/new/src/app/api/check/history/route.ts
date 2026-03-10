import { NextRequest } from "next/server";

import { getPublicCheckHistory } from "@/lib/check/queries";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get("days") || "7", 10) || 7));
    return Response.json(await getPublicCheckHistory(days));
  } catch (error) {
    console.error("Public check history error:", error);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
