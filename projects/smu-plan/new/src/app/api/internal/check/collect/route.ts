import { NextRequest } from "next/server";

import { collectAiMonitoring } from "@/lib/check/collector";
import { getCheckConfig } from "@/lib/check/config";

export async function POST(req: NextRequest) {
  const config = getCheckConfig();
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const isLocalhost = ["127.0.0.1", "localhost"].includes(req.nextUrl.hostname);
  const hasSecret = config.cronSecret && bearerToken === config.cronSecret;

  if (!isLocalhost && !hasSecret) {
    return Response.json(
      { ok: false, error: { code: 401, message: "Unauthorized" } },
      { status: 401 }
    );
  }

  try {
    const result = await collectAiMonitoring();
    return Response.json({ ok: true, data: result });
  } catch (error) {
    console.error("Collect ai monitoring error:", error);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
