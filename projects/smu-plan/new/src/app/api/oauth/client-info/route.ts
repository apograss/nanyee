import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/oauth/client-info?client_id=xxx
 *
 * Returns public info about an OAuth client (name only).
 * Used by the consent page to display the app name.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return Response.json(
      { ok: false, error: { message: "Missing client_id" } },
      { status: 400 }
    );
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { name: true },
  });

  if (!client) {
    return Response.json(
      { ok: false, error: { message: "Client not found" } },
      { status: 404 }
    );
  }

  return Response.json({ ok: true, data: { name: client.name } });
}
