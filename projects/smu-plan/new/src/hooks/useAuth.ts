"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

export interface UserInfo {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  lastReadAnnouncementAt?: string | null;
}

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const attemptRefresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/refresh", { method: "POST" });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    async function loadCurrentUser() {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (!data?.ok) {
        return null;
      }
      return data.data.user as UserInfo | null;
    }

    try {
      let nextUser = await loadCurrentUser();

      if (!nextUser) {
        const refreshed = await attemptRefresh();
        if (refreshed) {
          nextUser = await loadCurrentUser();
        }
      }

      setUser(nextUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [attemptRefresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let running = false;

    const refreshOnResume = async () => {
      if (running || document.visibilityState === "hidden") {
        return;
      }
      running = true;
      try {
        await refresh();
      } finally {
        running = false;
      }
    };

    window.addEventListener("focus", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);

    refreshTimer = setInterval(() => {
      void refresh();
    }, 10 * 60 * 1000);

    return () => {
      window.removeEventListener("focus", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [loading, refresh, user]);

  return { user, loading, refresh, logout };
}

export { AuthContext };

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
