interface UserLike {
  id: string;
  username: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  status: string;
}

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export function presentPublicUser(user: UserLike): PublicUser {
  if (user.status === "deleted") {
    return { id: user.id, displayName: "已注销用户", avatarUrl: null };
  }
  return {
    id: user.id,
    displayName: user.nickname?.trim() || user.username,
    avatarUrl: user.avatarUrl ?? null,
  };
}
