import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/oauth/userinfo
 *
 * OIDC UserInfo Endpoint.
 * Returns user claims based on the OIDC access token and granted scope.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json(
      { error: "invalid_token", error_description: "Missing Bearer token" },
      { status: 401 }
    );
  }

  const accessToken = authHeader.slice(7);

  // Look up OIDC token
  const oidcToken = await prisma.oidcToken.findUnique({
    where: { accessToken },
  });

  if (!oidcToken) {
    return Response.json(
      { error: "invalid_token", error_description: "Token not found" },
      { status: 401 }
    );
  }

  if (oidcToken.expiresAt < new Date()) {
    return Response.json(
      { error: "invalid_token", error_description: "Token expired" },
      { status: 401 }
    );
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: oidcToken.userId },
  });

  if (!user) {
    return Response.json(
      { error: "invalid_token", error_description: "User not found" },
      { status: 401 }
    );
  }

  // Build claims based on scope
  const scopes = oidcToken.scope.split(" ");
  const claims: Record<string, unknown> = { sub: user.id };

  if (scopes.includes("profile")) {
    claims.username = user.username;
    claims.nickname = user.nickname;
    claims.role = user.role;
  }

  if (scopes.includes("email")) {
    claims.email = user.email;
  }

  return Response.json(claims, {
    headers: { "Cache-Control": "no-store" },
  });
}
