import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";

/**
 * GET /api/oauth/authorize/request?id=xxx
 *
 * Returns the OAuthAuthorizationRequest details for the consent page.
 * Only accessible by the user who owns the request.
 */
export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("access_token")?.value;
  const payload = accessToken ? await verifyAccessToken(accessToken) : null;

  if (!payload?.sub) {
    return Response.json(
      { error: "unauthorized", error_description: "Not logged in" },
      { status: 401 }
    );
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing id" },
      { status: 400 }
    );
  }

  const authRequest = await prisma.oAuthAuthorizationRequest.findUnique({
    where: { id },
  });

  if (!authRequest || authRequest.userId !== payload.sub) {
    return Response.json(
      { error: "invalid_request", error_description: "Request not found" },
      { status: 404 }
    );
  }

  if (authRequest.consumedAt || authRequest.deniedAt) {
    return Response.json(
      { error: "invalid_request", error_description: "Request already used" },
      { status: 410 }
    );
  }

  if (authRequest.expiresAt < new Date()) {
    return Response.json(
      { error: "invalid_request", error_description: "Request expired" },
      { status: 410 }
    );
  }

  // Look up client name
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: authRequest.clientId },
    select: { name: true },
  });

  return Response.json({
    ok: true,
    data: {
      requestId: authRequest.id,
      clientId: authRequest.clientId,
      clientName: client?.name || authRequest.clientId,
      scope: authRequest.scope,
      redirectUri: authRequest.redirectUri,
      expiresAt: authRequest.expiresAt.toISOString(),
    },
  });
}
