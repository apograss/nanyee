import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { randomBytes } from "crypto";

/**
 * GET /api/oauth/authorize
 *
 * OIDC Authorization Endpoint.
 * Validates the request, checks user login, redirects to consent page.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const scope = url.searchParams.get("scope") || "openid";
  const state = url.searchParams.get("state");
  const nonce = url.searchParams.get("nonce");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  // Validate required params
  if (!clientId || !redirectUri || !responseType) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400 }
    );
  }

  if (responseType !== "code") {
    return Response.json(
      { error: "unsupported_response_type", error_description: "Only 'code' is supported" },
      { status: 400 }
    );
  }

  // Validate client
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  // Validate redirect_uri
  const registeredUris: string[] = JSON.parse(client.redirectUris);
  if (!registeredUris.includes(redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "redirect_uri not registered" },
      { status: 400 }
    );
  }

  // Validate PKCE
  if (codeChallenge && codeChallengeMethod !== "S256") {
    return Response.json(
      { error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" },
      { status: 400 }
    );
  }

  // Check if user is logged in
  const accessToken = req.cookies.get("access_token")?.value;
  const payload = accessToken ? await verifyAccessToken(accessToken) : null;

  if (!payload) {
    // Not logged in — redirect to login with return URL
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("redirect", req.url);
    return Response.redirect(loginUrl.toString());
  }

  // User is logged in — redirect to consent page
  const consentUrl = new URL("/oauth/consent", url.origin);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);
  if (nonce) consentUrl.searchParams.set("nonce", nonce);
  if (codeChallenge) consentUrl.searchParams.set("code_challenge", codeChallenge);
  if (codeChallengeMethod) consentUrl.searchParams.set("code_challenge_method", codeChallengeMethod);

  // [C2 FIX] Generate CSRF token and set as httpOnly cookie
  const csrfToken = randomBytes(32).toString("hex");
  consentUrl.searchParams.set("csrf_token", csrfToken);

  const res = NextResponse.redirect(consentUrl.toString());
  res.cookies.set("oauth_csrf", csrfToken, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 300, // 5 minutes — enough for consent flow
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
