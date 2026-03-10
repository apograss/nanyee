"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";

import styles from "./page.module.css";

function CheckAdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await response.json();

      if (!json.ok) {
        setError(json.error?.message || "登录失败");
        return;
      }

      const redirect = searchParams.get("redirect") || "/admin";
      router.push(redirect);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h2 className={styles.title}>管理员登录</h2>
        <p className={styles.subtitle}>使用现有 nanyee.de 管理员账号登录。</p>

        <form onSubmit={handleSubmit} className={styles.form}>
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
          <NeoButton type="submit" isLoading={loading}>
            登录
          </NeoButton>
        </form>
      </div>
    </div>
  );
}

export default function CheckAdminLoginPage() {
  return (
    <Suspense fallback={<div className={styles.wrapper}>加载中…</div>}>
      <CheckAdminLoginForm />
    </Suspense>
  );
}