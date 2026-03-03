import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { randomBytes, timingSafeEqual } from "crypto";

/**
 * POST /api/oauth/authorize/confirm
 *
 * User has consented — generate authorization code and redirect back to client.
 * Protected by CSRF token (set as cookie by /api/oauth/authorize, validated here).
 */
export async function POST(req: NextRequest) {
  // Verify user is logged in
  const accessToken = req.cookies.get("access_token")?.value;
  const payload = accessToken ? await verifyAccessToken(accessToken) : null;

  if (!payload?.sub) {
    return Response.json(
      { error: "unauthorized", error_description: "Not logged in" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    scope = "openid",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    csrf_token: csrfToken,
  } = body;

  // [C2 FIX] Validate CSRF token
  const csrfCookie = req.cookies.get("oauth_csrf")?.value;
  if (!csrfCookie || !csrfToken) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing CSRF token" },
      { status: 403 }
    );
  }
  const csrfExpected = Buffer.from(csrfCookie, "utf8");
  const csrfActual = Buffer.from(csrfToken, "utf8");
  if (csrfExpected.length !== csrfActual.length || !timingSafeEqual(csrfExpected, csrfActual)) {
    return Response.json(
      { error: "invalid_request", error_description: "CSRF token mismatch" },
      { status: 403 }
    );
  }

  if (!clientId || !redirectUri) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400 }
    );
  }

  // Re-validate client + redirect_uri
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  const registeredUris: string[] = JSON.parse(client.redirectUris);
  if (!registeredUris.includes(redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "redirect_uri not registered" },
      { status: 400 }
    );
  }

  // Generate authorization code
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

  await prisma.oidcCode.create({
    data: {
      code,
      clientId,
      userId: payload.sub,
      redirectUri,
      scope,
      nonce: nonce || null,
      codeChallenge: codeChallenge || null,
      codeChallengeMethod: codeChallengeMethod || null,
      expiresAt,
    },
  });

  // Build redirect URL
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  // Clear the CSRF cookie
  const res = NextResponse.json({ redirect: callbackUrl.toString() });
  res.cookies.set("oauth_csrf", "", { maxAge: 0, path: "/" });
  return res;
}
