"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import { extractConsentUser, getConsentUserDisplay } from "@/lib/oidc/consent";
import styles from "./page.module.css";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string | null;
}

interface RequestInfo {
  requestId: string;
  clientId: string;
  clientName: string;
  scope: string;
  redirectUri: string;
  expiresAt: string;
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
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const requestId = searchParams.get("request_id") || "";

  useEffect(() => {
    if (!requestId) {
      setError("缺少 request_id 参数");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Fetch user info
        const userRes = await fetch("/api/auth/me");
        const userData = await userRes.json();
        if (!userData.ok) {
          const loginUrl = new URL("/login", window.location.origin);
          loginUrl.searchParams.set("redirect", window.location.href);
          window.location.href = loginUrl.toString();
          return;
        }
        setUser(extractConsentUser(userData));

        // Fetch request info (includes client name)
        const reqRes = await fetch(
          `/api/oauth/authorize/request?id=${encodeURIComponent(requestId)}`
        );
        const reqData = await reqRes.json();
        if (reqData.ok) {
          setRequestInfo(reqData.data);
        } else {
          setError(reqData.error_description || reqData.error?.message || "无效的授权请求");
        }
      } catch {
        setError("网络错误");
      }
      setLoading(false);
    })();
  }, [requestId]);

  const handleDecision = async (decision: "allow" | "deny") => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/authorize/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          decision,
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

  if (!requestInfo) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          {error && <div className={styles.error}>{error}</div>}
          <NeoButton variant="secondary" onClick={() => router.push("/")}>
            返回首页
          </NeoButton>
        </div>
      </div>
    );
  }

  const scopes = requestInfo.scope.split(" ").filter(Boolean);
  const { avatarText, displayName } = getConsentUserDisplay(user);

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>授权登录</h1>
        <p className={styles.subtitle}>
          <span className={styles.appName}>{requestInfo.clientName}</span>{" "}
          想要访问你的 nanyee.de 账户
        </p>

        <div className={styles.userInfo}>
          <div className={styles.avatar}>
            {avatarText}
          </div>
          <div>
            <div className={styles.username}>{displayName}</div>
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
          <NeoButton
            variant="secondary"
            onClick={() => handleDecision("deny")}
            disabled={submitting}
          >
            拒绝
          </NeoButton>
          <NeoButton
            variant="primary"
            onClick={() => handleDecision("allow")}
            isLoading={submitting}
          >
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
