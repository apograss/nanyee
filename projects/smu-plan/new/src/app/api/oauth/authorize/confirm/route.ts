import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * POST /api/oauth/authorize/confirm
 *
 * User has consented — consume the OAuthAuthorizationRequest,
 * generate authorization code, and redirect back to client.
 * Protected by CSRF token stored hashed in the request record.
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
  const { request_id: requestId, decision } = body;

  if (!requestId) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing request_id" },
      { status: 400 }
    );
  }

  // Validate CSRF token from cookie against the stored hash
  const csrfCookie = req.cookies.get("oauth_csrf")?.value;
  if (!csrfCookie) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing CSRF token" },
      { status: 403 }
    );
  }

  // Load the authorization request
  const authRequest = await prisma.oAuthAuthorizationRequest.findUnique({
    where: { id: requestId },
  });

  if (!authRequest) {
    return Response.json(
      { error: "invalid_request", error_description: "Request not found" },
      { status: 404 }
    );
  }

  // Verify this request belongs to the current user
  if (authRequest.userId !== payload.sub) {
    return Response.json(
      { error: "invalid_request", error_description: "Request does not belong to current user" },
      { status: 403 }
    );
  }

  // Verify not already consumed or denied
  if (authRequest.consumedAt || authRequest.deniedAt) {
    return Response.json(
      { error: "invalid_request", error_description: "Request already used" },
      { status: 410 }
    );
  }

  // Verify not expired
  if (authRequest.expiresAt < new Date()) {
    return Response.json(
      { error: "invalid_request", error_description: "Request expired" },
      { status: 410 }
    );
  }

  // Verify CSRF token (timing-safe comparison of hashes)
  const csrfHash = createHash("sha256").update(csrfCookie).digest("hex");
  const expected = Buffer.from(authRequest.csrfTokenHash, "utf8");
  const actual = Buffer.from(csrfHash, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.json(
      { error: "invalid_request", error_description: "CSRF token mismatch" },
      { status: 403 }
    );
  }

  // Handle deny
  if (decision === "deny") {
    await prisma.oAuthAuthorizationRequest.update({
      where: { id: requestId },
      data: { deniedAt: new Date() },
    });

    const denyUrl = new URL(authRequest.redirectUri);
    denyUrl.searchParams.set("error", "access_denied");
    denyUrl.searchParams.set("error_description", "User denied the request");
    if (authRequest.state) denyUrl.searchParams.set("state", authRequest.state);

    const res = NextResponse.json({ redirect: denyUrl.toString() });
    res.cookies.set("oauth_csrf", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Handle allow: generate authorization code
  const code = randomBytes(32).toString("hex");
  const codeExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

  await prisma.$transaction([
    prisma.oAuthAuthorizationRequest.update({
      where: { id: requestId },
      data: { consumedAt: new Date() },
    }),
    prisma.oidcCode.create({
      data: {
        code,
        clientId: authRequest.clientId,
        userId: payload.sub,
        redirectUri: authRequest.redirectUri,
        scope: authRequest.scope,
        nonce: authRequest.nonce,
        codeChallenge: authRequest.codeChallenge,
        codeChallengeMethod: authRequest.codeChallengeMethod,
        expiresAt: codeExpiresAt,
      },
    }),
  ]);

  // Build redirect URL
  const callbackUrl = new URL(authRequest.redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (authRequest.state) callbackUrl.searchParams.set("state", authRequest.state);

  // Clear the CSRF cookie
  const res = NextResponse.json({ redirect: callbackUrl.toString() });
  res.cookies.set("oauth_csrf", "", { maxAge: 0, path: "/" });
  return res;
}
