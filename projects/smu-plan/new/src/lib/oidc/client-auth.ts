export interface OAuthClientCredentials {
  clientId?: string;
  clientSecret?: string;
}

export function decodeBasicClientCredentials(
  authorizationHeader: string | null | undefined,
): OAuthClientCredentials | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, encoded] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const clientId = decoded.slice(0, separatorIndex).trim();
  const clientSecret = decoded.slice(separatorIndex + 1).trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function resolveOAuthClientCredentials(
  params: Record<string, string>,
  authorizationHeader: string | null | undefined,
): OAuthClientCredentials {
  const basic = decodeBasicClientCredentials(authorizationHeader);

  return {
    clientId: params.client_id || basic?.clientId,
    clientSecret: params.client_secret || basic?.clientSecret,
  };
}
