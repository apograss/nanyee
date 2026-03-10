export function parseOAuthTokenParams(
  rawBody: string,
  contentType: string | null | undefined,
): Record<string, string> {
  const normalizedContentType = (contentType || "").toLowerCase();
  const trimmedBody = rawBody.trim();

  if (!trimmedBody) {
    return {};
  }

  if (
    normalizedContentType.includes("application/x-www-form-urlencoded") ||
    (!trimmedBody.startsWith("{") && trimmedBody.includes("="))
  ) {
    return Object.fromEntries(new URLSearchParams(trimmedBody));
  }

  try {
    const parsed = JSON.parse(trimmedBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    }
  } catch {
    return Object.fromEntries(new URLSearchParams(trimmedBody));
  }

  return {};
}
