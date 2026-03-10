import { NextRequest } from "next/server";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/audit — RETIRED (audit review workflow replaced by wiki-style editing)
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return Response.json({
      ok: true,
      data: { articles: [] },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
