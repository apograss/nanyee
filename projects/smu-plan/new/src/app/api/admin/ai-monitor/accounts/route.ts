import { NextRequest } from "next/server";

import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { getAdminAiAccounts } from "@/lib/check/queries";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    return Response.json(
      await getAdminAiAccounts({
        provider: url.searchParams.get("provider") || undefined,
        status: url.searchParams.get("status") || undefined,
        page: Number.parseInt(url.searchParams.get("page") || "1", 10),
        limit: Number.parseInt(url.searchParams.get("limit") || "50", 10),
      })
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
