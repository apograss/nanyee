"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string;
}

interface ClientInfo {
  name: string;
}

const SCOPE_LABELS: Record<string, { icon: string; label: string }> = {
  openid: { icon: "\u{1F511}", label: "确认你的身份" },
  profile: { icon: "\u{1F464}", label: "查看你的用户名和昵称" },
  email: { icon: "\u{1F4E7}", label: "查看你的邮箱地址" },
};

function ConsentForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const scope = searchParams.get("scope") || "openid";
  const state = searchParams.get("state");
  const nonce = searchParams.get("nonce");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const csrfToken = searchParams.get("csrf_token");

  const scopes = scope.split(" ").filter(Boolean);

  useEffect(() => {
    (async () => {
      try {
        const userRes = await fetch("/api/auth/me");
        const userData = await userRes.json();
        if (!userData.ok) {
          const loginUrl = new URL("/login", window.location.origin);
          loginUrl.searchParams.set("redirect", window.location.href);
          window.location.href = loginUrl.toString();
          return;
        }
        setUser(userData.data);

        const clientRes = await fetch(
          `/api/oauth/client-info?client_id=${encodeURIComponent(clientId)}`
        );
        const clientData = await clientRes.json();
        if (clientData.ok) {
          setClientInfo(clientData.data);
        } else {
          setError(clientData.error?.message || "无效的应用");
        }
      } catch {
        setError("网络错误");
      }
      setLoading(false);
    })();
  }, [clientId]);

  const handleAllow = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/authorize/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          csrf_token: csrfToken,
        }),
      });
      const data = await res.json();
      if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        setError(data.error_description || "授权失败");
      }
    } catch {
      setError("网络错误");
    }
    setSubmitting(false);
  };

  const handleDeny = () => {
    if (redirectUri) {
      const denyUrl = new URL(redirectUri);
      denyUrl.searchParams.set("error", "access_denied");
      denyUrl.searchParams.set("error_description", "User denied the request");
      if (state) denyUrl.searchParams.set("state", state);
      window.location.href = denyUrl.toString();
    } else {
      router.push("/");
    }
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.loading}>加载中...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.loading}>跳转登录中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>授权登录</h1>
        <p className={styles.subtitle}>
          <span className={styles.appName}>{clientInfo?.name || clientId}</span>{" "}
          想要访问你的 nanyee.de 账户
        </p>

        <div className={styles.userInfo}>
          <div className={styles.avatar}>
            {(user.nickname || user.username).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className={styles.username}>{user.nickname || user.username}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              @{user.username}
            </div>
          </div>
        </div>

        <div className={styles.scopeList}>
          <div className={styles.scopeTitle}>请求的权限：</div>
          {scopes.map((s) => {
            const info = SCOPE_LABELS[s];
            if (!info) return null;
            return (
              <div key={s} className={styles.scopeItem}>
                <span className={styles.scopeIcon}>{info.icon}</span>
                <span>{info.label}</span>
              </div>
            );
          })}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <NeoButton variant="secondary" onClick={handleDeny} disabled={submitting}>
            拒绝
          </NeoButton>
          <NeoButton variant="primary" onClick={handleAllow} isLoading={submitting}>
            允许
          </NeoButton>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <div className={styles.loading}>加载中...</div>
          </div>
        </div>
      }
    >
      <ConsentForm />
    </Suspense>
  );
}
