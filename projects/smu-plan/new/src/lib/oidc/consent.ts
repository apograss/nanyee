export interface ConsentUser {
  id: string;
  username: string;
  nickname?: string | null;
}

export function extractConsentUser(payload: unknown): ConsentUser | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as {
    data?: unknown;
  };

  const data =
    root.data && typeof root.data === "object" && "user" in (root.data as object)
      ? (root.data as { user?: unknown }).user
      : root.data;

  if (!data || typeof data !== "object") return null;

  const user = data as Partial<ConsentUser>;
  if (!user.id || !user.username) return null;

  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname ?? null,
  };
}

export function getConsentUserDisplay(user: ConsentUser): {
  displayName: string;
  avatarText: string;
} {
  const displayName = user.nickname?.trim() || user.username.trim();
  const avatarText = displayName.charAt(0).toUpperCase() || "?";

  return {
    displayName,
    avatarText,
  };
}
