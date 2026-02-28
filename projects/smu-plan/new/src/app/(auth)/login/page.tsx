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
      const data = await res.json();

      if (!data.ok) {
        setError(data.error?.message || "Login failed");
        return;
      }

      const redirect = searchParams.get("redirect") || "/";
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error");
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "2rem" }}>加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
