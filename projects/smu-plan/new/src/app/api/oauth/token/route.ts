import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOidcEmailClaim } from "@/lib/oidc/claims";
import { signIdToken } from "@/lib/oidc/keys";
import { resolveOAuthClientCredentials } from "@/lib/oidc/client-auth";
import { parseOAuthTokenParams } from "@/lib/oidc/token-params";
import { compare } from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

const ISSUER = "https://nanyee.de";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
};

/**
 * POST /api/oauth/token
 *
 * OIDC Token Endpoint.
 * Exchange authorization code for access_token + id_token.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const rawBody = await req.text();
  const params = parseOAuthTokenParams(rawBody, contentType);

  const { clientId, clientSecret } = resolveOAuthClientCredentials(
    params,
    req.headers.get("authorization"),
  );

  const {
    grant_type: grantType,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  } = params;

  // Validate grant type
  if (grantType !== "authorization_code") {
    return Response.json(
      { error: "unsupported_grant_type", error_description: "Only authorization_code is supported" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!code || !redirectUri || !clientId) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // [C1 FIX] Atomic consume: find + mark consumed in one operation to prevent TOCTOU race.
  // Use a transaction: read, validate consumed/expired, then atomically update.
  const oidcCode = await prisma.$transaction(async (tx) => {
    const row = await tx.oidcCode.findUnique({ where: { code } });
    if (!row) return null;

    // If already consumed, this is a code replay attack — revoke tokens [W3 FIX]
    if (row.consumedAt) {
      await tx.oidcToken.deleteMany({
        where: { clientId: row.clientId, userId: row.userId },
      });
      return { ...row, _replayDetected: true as const };
    }

    if (row.expiresAt < new Date()) {
      // Opportunistically delete expired code [W4 FIX]
      await tx.oidcCode.delete({ where: { id: row.id } });
      return { ...row, _expired: true as const };
    }

    // Atomically mark as consumed
    await tx.oidcCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    return row;
  });

  if (!oidcCode) {
    return Response.json(
      { error: "invalid_grant", error_description: "Invalid authorization code" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if ("_replayDetected" in oidcCode) {
    return Response.json(
      { error: "invalid_grant", error_description: "Authorization code already used — tokens revoked" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if ("_expired" in oidcCode) {
    return Response.json(
      { error: "invalid_grant", error_description: "Authorization code expired" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Verify client_id matches
  if (oidcCode.clientId !== clientId) {
    return Response.json(
      { error: "invalid_grant", error_description: "client_id mismatch" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Verify redirect_uri matches
  if (oidcCode.redirectUri !== redirectUri) {
    return Response.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Authenticate client
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // [W5 FIX] Validate scope against client's registered scopes
  const allowedScopes: string[] = JSON.parse(client.scopes);
  const requestedScopes = oidcCode.scope.split(" ");
  const invalidScopes = requestedScopes.filter((s) => !allowedScopes.includes(s));
  if (invalidScopes.length > 0) {
    return Response.json(
      { error: "invalid_scope", error_description: `Scope not allowed: ${invalidScopes.join(", ")}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // If client has a secret, verify it
  if (client.clientSecret) {
    if (!clientSecret) {
      return Response.json(
        { error: "invalid_client", error_description: "client_secret required" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    const secretMatch = await compare(clientSecret, client.clientSecret);
    if (!secretMatch) {
      return Response.json(
        { error: "invalid_client", error_description: "Invalid client_secret" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  // [C3 FIX] Verify PKCE with timing-safe comparison
  if (oidcCode.codeChallenge) {
    if (!codeVerifier) {
      return Response.json(
        { error: "invalid_grant", error_description: "code_verifier required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const expectedChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const expected = Buffer.from(expectedChallenge, "utf8");
    const actual = Buffer.from(oidcCode.codeChallenge, "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return Response.json(
        { error: "invalid_grant", error_description: "code_verifier mismatch" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  // Generate OIDC access token
  const accessToken = randomBytes(32).toString("hex");
  const expiresIn = 3600; // 1 hour
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.oidcToken.create({
    data: {
      accessToken,
      clientId,
      userId: oidcCode.userId,
      scope: oidcCode.scope,
      expiresAt,
    },
  });

  // Sign id_token
  const idTokenPayload: Record<string, unknown> = {
    iss: ISSUER,
    sub: oidcCode.userId,
    aud: clientId,
  };
  if (oidcCode.nonce) {
    idTokenPayload.nonce = oidcCode.nonce;
  }

  // Add claims based on scope
  const scopes = oidcCode.scope.split(" ");
  if (scopes.includes("profile") || scopes.includes("email")) {
    const user = await prisma.user.findUnique({ where: { id: oidcCode.userId } });
    if (user) {
      if (scopes.includes("profile")) {
        idTokenPayload.username = user.username;
        idTokenPayload.nickname = user.nickname;
        idTokenPayload.preferred_username = user.username;
        idTokenPayload.name = user.nickname || user.username;
        idTokenPayload.role = user.role;
      }
      if (scopes.includes("email")) {
        const emailClaim = getOidcEmailClaim(user);
        idTokenPayload.email = emailClaim.email;
        idTokenPayload.email_verified = emailClaim.emailVerified;
      }
    }
  }

  const idToken = await signIdToken(idTokenPayload);

  // [C4 FIX] Include Cache-Control: no-store per RFC 6749 Section 5.1
  return Response.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    id_token: idToken,
    scope: oidcCode.scope,
  }, {
    headers: NO_STORE_HEADERS,
  });
}
