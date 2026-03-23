"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";

import styles from "./page.module.css";

type TwoFactorState = {
  challengeId: string;
  username: string;
  label: string;
} | null;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorState, setTwoFactorState] = useState<TwoFactorState>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const completeLogin = () => {
    const redirect = searchParams.get("redirect") || "/";
    router.push(redirect);
    router.refresh();
  };

  async function readJsonResponse(response: Response) {
    const text = await response.text();
    try {
      return JSON.parse(text) as { ok?: boolean; data?: any; error?: { message?: string } };
    } catch {
      return null;
    }
  }

  const handlePasswordStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        setError(data?.error?.message || "登录服务暂时不可用");
        return;
      }

      if (data?.data?.requiresTwoFactor && data.data.challengeId) {
        setTwoFactorState({
          challengeId: data.data.challengeId,
          username: data.data.user?.username || username,
          label: data.data.user?.nickname || data.data.user?.username || username,
        });
        setTwoFactorCode("");
        return;
      }

      if (!data?.ok) {
        setError(data?.error?.message || "登录失败");
        return;
      }

      completeLogin();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorState) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: twoFactorState.challengeId,
          code: twoFactorCode,
        }),
      });
      const data = await readJsonResponse(response);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || "二次验证失败");
        return;
      }

      completeLogin();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const resetTwoFactor = () => {
    setTwoFactorState(null);
    setTwoFactorCode("");
    setError("");
  };

  return (
    <>
      <h1 className={styles.title}>登录</h1>
      <p className={styles.subtitle}>
        欢迎回到 <strong>nanyee.de</strong>
      </p>

      {twoFactorState ? (
        <form onSubmit={handleTwoFactorStep} className={styles.form}>
          <NeoInput
            label="验证码 / 恢复码"
            value={twoFactorCode}
            onChange={(event) => setTwoFactorCode(event.target.value)}
            autoComplete="one-time-code"
            placeholder="输入 6 位验证码或恢复码"
            required
          />
          <p className={styles.twoFactorHint}>
            账号 <strong>{twoFactorState.label}</strong> 已开启双重验证。请输入验证器 App 中的 6 位验证码，
            或输入一枚备用恢复码继续登录。
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <NeoButton
            type="submit"
            isLoading={loading}
            className={styles.submitBtn}
            disabled={!twoFactorCode.trim()}
          >
            完成登录
          </NeoButton>
          <NeoButton type="button" variant="secondary" onClick={resetTwoFactor}>
            返回账号密码
          </NeoButton>
        </form>
      ) : (
        <form onSubmit={handlePasswordStep} className={styles.form}>
          <NeoInput
            label="用户名 / 邮箱"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
          <NeoInput
            label="密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error ? <p className={styles.error}>{error}</p> : null}

          <NeoButton type="submit" isLoading={loading} className={styles.submitBtn}>
            登录
          </NeoButton>
        </form>
      )}

      <p className={styles.footer}>
        还没有账号？{" "}
        <Link href="/register" className={styles.link}>
          注册
        </Link>
      </p>
    </>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "2rem" }}>加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
