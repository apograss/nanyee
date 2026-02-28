"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "../login/page.module.css";

type RegMethod = "email" | "quiz";

interface QuizQ {
  id: string;
  question: string;
  options: string[];
}

export default function RegisterPage() {
  const router = useRouter();
  const [method, setMethod] = useState<RegMethod>("email");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Email method
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  // Quiz method
  const [questions, setQuestions] = useState<QuizQ[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);

  const sendCode = async () => {
    if (!email) return;
    setCodeCooldown(60);
    const interval = setInterval(() => {
      setCodeCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch("/api/auth/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "register" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Failed to send code");
        return;
      }
      setCodeSent(true);
    } catch {
      setError("Network error");
    }
  };

  const loadQuiz = async () => {
    setQuizLoading(true);
    try {
      const res = await fetch("/api/auth/quiz/attempt");
      const data = await res.json();
      if (data.ok) {
        setQuestions(data.data.questions);
        setQuizAnswers(new Array(data.data.questions.length).fill(-1));
      } else {
        setError(data.error?.message || "Failed to load quiz");
      }
    } catch {
      setError("Network error");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleMethodChange = (m: RegMethod) => {
    setMethod(m);
    setError("");
    if (m === "quiz" && questions.length === 0) {
      loadQuiz();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        username,
        password,
        nickname: nickname || undefined,
        method,
      };

      if (method === "email") {
        payload.email = email;
        payload.emailCode = emailCode;
      } else {
        payload.quizAnswers = quizAnswers;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error?.message || "Registration failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>注册</h1>
      <p className={styles.subtitle}>
        加入 <strong>nanyee.de</strong> 南医校园平台
      </p>

      {/* Method tabs */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${method === "email" ? styles.tabActive : ""}`}
          onClick={() => handleMethodChange("email")}
        >
          邮箱验证
        </button>
        <button
          type="button"
          className={`${styles.tab} ${method === "quiz" ? styles.tabActive : ""}`}
          onClick={() => handleMethodChange("quiz")}
        >
          校园答题
        </button>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <NeoInput
          label="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="2-20位，字母数字下划线"
          autoComplete="username"
          required
        />
        <NeoInput
          label="昵称（可选）"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="显示名称"
        />
        <NeoInput
          label="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少6位"
          autoComplete="new-password"
          required
        />

        {method === "email" && (
          <>
            <NeoInput
              label="邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className={styles.codeRow}>
              <NeoInput
                label="验证码"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="6位数字"
                maxLength={6}
                required
              />
              <NeoButton
                type="button"
                variant="outline"
                size="sm"
                onClick={sendCode}
                disabled={codeCooldown > 0 || !email}
                style={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}
              >
                {codeCooldown > 0 ? `${codeCooldown}s` : codeSent ? "重发" : "发送"}
              </NeoButton>
            </div>
          </>
        )}

        {method === "quiz" && (
          <>
            {quizLoading && <p>加载题目中...</p>}
            {questions.map((q, qi) => (
              <div key={q.id} className={styles.quizBlock}>
                <p className={styles.question}>
                  {qi + 1}. {q.question}
                </p>
                <div className={styles.options}>
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={styles.option}>
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={quizAnswers[qi] === oi}
                        onChange={() => {
                          const next = [...quizAnswers];
                          next[qi] = oi;
                          setQuizAnswers(next);
                        }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <NeoButton type="submit" isLoading={loading} className={styles.submitBtn}>
          注册
        </NeoButton>
      </form>

      <p className={styles.footer}>
        已有账号？{" "}
        <Link href="/login" className={styles.link}>
          登录
        </Link>
      </p>
    </>
  );
}
