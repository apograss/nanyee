const ISSUER = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://nanyee.de";

export async function GET() {
  return Response.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    userinfo_endpoint: `${ISSUER}/api/oauth/userinfo`,
    jwks_uri: `${ISSUER}/api/oauth/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    claims_supported: ["sub", "username", "email", "nickname", "role"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
  });
}
