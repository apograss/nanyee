"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";

import styles from "./page.module.css";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: { message?: string } } | null = null;

      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.error?.message || "登录服务暂时不可用");
        return;
      }

      if (!data?.ok) {
        setError(data?.error?.message || "登录失败");
        return;
      }

      const redirect = searchParams.get("redirect") || "/";
      router.push(redirect);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>登录</h1>
      <p className={styles.subtitle}>
        欢迎回到 <strong>nanyee.de</strong>
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <NeoInput
          label="用户名 / 邮箱"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <NeoInput
          label="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <p className={styles.error}>{error}</p>}

        <NeoButton type="submit" isLoading={loading} className={styles.submitBtn}>
          登录
        </NeoButton>
      </form>

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
