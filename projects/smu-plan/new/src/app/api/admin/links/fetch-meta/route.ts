import { NextRequest } from "next/server";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { fetchUrlMeta } from "@/lib/metadata/fetch-meta";
import { z } from "zod";

export const runtime = "nodejs";

const fetchMetaSchema = z.object({
  url: z.string().url().max(2000),
});

// POST /api/admin/links/fetch-meta — fetch URL metadata
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const { url } = fetchMetaSchema.parse(body);
    const meta = await fetchUrlMeta(url);

    return Response.json({ ok: true, data: meta });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
