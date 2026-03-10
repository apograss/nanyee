import { NextRequest } from "next/server";

import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { getAdminAiMonitorOverview } from "@/lib/check/queries";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return Response.json(await getAdminAiMonitorOverview());
  } catch (error) {
    return handleAuthError(error);
  }
}
