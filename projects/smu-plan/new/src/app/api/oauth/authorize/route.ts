import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { randomBytes, createHash } from "crypto";
import { resolveOidcAppUrl } from "@/lib/oidc/config";

/**
 * GET /api/oauth/authorize
 *
 * OIDC Authorization Endpoint.
 * Validates the request, checks user login, creates an OAuthAuthorizationRequest,
 * and redirects to the consent page with only request_id in the URL.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const appBaseUrl = resolveOidcAppUrl("/", req.url, req.headers);
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
    const loginUrl = new URL("/login", appBaseUrl);
    const canonicalAuthorizeUrl = new URL(url.pathname, appBaseUrl);
    canonicalAuthorizeUrl.search = url.search;
    loginUrl.searchParams.set("redirect", canonicalAuthorizeUrl.toString());
    return Response.redirect(loginUrl.toString());
  }

  // Generate CSRF token
  const csrfToken = randomBytes(32).toString("hex");
  const csrfTokenHash = createHash("sha256").update(csrfToken).digest("hex");

  // Create OAuthAuthorizationRequest (server-side state)
  const authRequest = await prisma.oAuthAuthorizationRequest.create({
    data: {
      userId: payload.sub,
      clientId,
      redirectUri,
      scope,
      state: state || null,
      nonce: nonce || null,
      codeChallenge: codeChallenge || null,
      codeChallengeMethod: codeChallengeMethod || null,
      csrfTokenHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });

  // Redirect to consent page with only request_id
  const consentUrl = new URL("/oauth/consent", appBaseUrl);
  consentUrl.searchParams.set("request_id", authRequest.id);

  const res = NextResponse.redirect(consentUrl.toString());
  res.cookies.set("oauth_csrf", csrfToken, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 300,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
