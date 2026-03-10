export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  claims_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveOidcIssuer(
  requestUrl?: string,
  headers?: Headers,
  env: Partial<Record<string, string | undefined>> = process.env,
): string {
  if (env.OIDC_ISSUER?.trim()) {
    return trimTrailingSlash(env.OIDC_ISSUER.trim());
  }

  if (headers) {
    const host = headers.get("x-forwarded-host") || headers.get("host");
    const proto = headers.get("x-forwarded-proto");
    if (host) {
      return trimTrailingSlash(`${proto || "https"}://${host}`);
    }
  }

  if (requestUrl) {
    return trimTrailingSlash(new URL(requestUrl).origin);
  }

  return "https://nanyee.de";
}

export function buildOidcDiscoveryDocument(
  issuer: string,
): OidcDiscoveryDocument {
  const normalizedIssuer = trimTrailingSlash(issuer);

  return {
    issuer: normalizedIssuer,
    authorization_endpoint: `${normalizedIssuer}/api/oauth/authorize`,
    token_endpoint: `${normalizedIssuer}/api/oauth/token`,
    userinfo_endpoint: `${normalizedIssuer}/api/oauth/userinfo`,
    jwks_uri: `${normalizedIssuer}/api/oauth/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    claims_supported: [
      "sub",
      "username",
      "nickname",
      "role",
      "email",
      "preferred_username",
      "name",
    ],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
  };
}

export function resolveOidcAppUrl(
  path: string,
  requestUrl?: string,
  headers?: Headers,
  env: Partial<Record<string, string | undefined>> = process.env,
): URL {
  const issuer = resolveOidcIssuer(requestUrl, headers, env);
  return new URL(path, issuer);
}
