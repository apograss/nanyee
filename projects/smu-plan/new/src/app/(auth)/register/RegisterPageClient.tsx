"use client";

import { useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import NeoSteps from "@/components/atoms/NeoSteps";
import NeoRadioGroup from "@/components/atoms/NeoRadioGroup";

import styles from "../login/page.module.css";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

interface RegisterState {
  step: number;
  method: "email" | "quiz" | "";
  challengeId: string;
  email: string;
  emailCode: string;
  questions: QuizQuestion[];
  quizAnswers: number[];
  username: string;
  password: string;
  confirmPassword: string;
  nickname: string;
  status: "idle" | "loading" | "error";
  errorMessage: string;
  quizScore: number | null;
  quizTotal: number;
}

type Action =
  | { type: "SET_METHOD"; method: "email" | "quiz" }
  | { type: "UPDATE"; payload: Partial<RegisterState> }
  | { type: "SET_STATUS"; status: RegisterState["status"]; error?: string }
  | { type: "CHALLENGE_CREATED"; challengeId: string; questions?: QuizQuestion[] }
  | { type: "VERIFIED"; score?: number; total?: number }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SUCCESS" };

const initialState: RegisterState = {
  step: 0,
  method: "",
  challengeId: "",
  email: "",
  emailCode: "",
  questions: [],
  quizAnswers: [],
  username: "",
  password: "",
  confirmPassword: "",
  nickname: "",
  status: "idle",
  errorMessage: "",
  quizScore: null,
  quizTotal: 20,
};

function reducer(state: RegisterState, action: Action): RegisterState {
  switch (action.type) {
    case "SET_METHOD":
      return { ...state, method: action.method, errorMessage: "" };
    case "UPDATE":
      return { ...state, ...action.payload, errorMessage: "" };
    case "SET_STATUS":
      return { ...state, status: action.status, errorMessage: action.error || "" };
    case "CHALLENGE_CREATED":
      return {
        ...state,
        challengeId: action.challengeId,
        questions: action.questions || [],
        quizAnswers: action.questions ? new Array(action.questions.length).fill(-1) : [],
        step: 1,
        status: "idle",
        errorMessage: "",
      };
    case "VERIFIED":
      return {
        ...state,
        step: 2,
        status: "idle",
        errorMessage: "",
        quizScore: action.score ?? null,
        quizTotal: action.total ?? state.quizTotal,
      };
    case "NEXT_STEP":
      return { ...state, step: state.step + 1, errorMessage: "" };
    case "PREV_STEP":
      return { ...state, step: Math.max(0, state.step - 1), errorMessage: "" };
    case "SUCCESS":
      return { ...state, step: 3, status: "idle" };
    default:
      return state;
  }
}

const STEPS_EMAIL = [
  { id: "method", label: "选择方式" },
  { id: "verify", label: "邮箱验证" },
  { id: "account", label: "创建账号" },
  { id: "done", label: "完成" },
];

const STEPS_QUIZ = [
  { id: "method", label: "选择方式" },
  { id: "verify", label: "社区答题" },
  { id: "account", label: "创建账号" },
  { id: "done", label: "完成" },
];

export default function RegisterPageClient() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [resendTimer, setResendTimer] = useState(0);

  const steps = state.method === "quiz" ? STEPS_QUIZ : STEPS_EMAIL;

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const handleCreateChallenge = async () => {
    if (!state.method) return;

    if (state.method === "email") {
      if (!state.email) {
        dispatch({ type: "SET_STATUS", status: "error", error: "请输入邮箱" });
        return;
      }
      if (!state.email.endsWith(".edu.cn")) {
        dispatch({ type: "SET_STATUS", status: "error", error: "仅支持 .edu.cn 教育邮箱注册" });
        return;
      }
    }

    dispatch({ type: "SET_STATUS", status: "loading" });

    try {
      const body: Record<string, string> = { method: state.method };
      if (state.method === "email") {
        body.email = state.email;
      }

      const res = await fetch("/api/auth/register/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        dispatch({ type: "SET_STATUS", status: "error", error: data.error?.message || "Failed" });
        return;
      }

      dispatch({
        type: "CHALLENGE_CREATED",
        challengeId: data.data.challengeId,
        questions: data.data.questions,
      });

      if (state.method === "email") {
        startResendTimer();
      }
    } catch {
      dispatch({ type: "SET_STATUS", status: "error", error: "网络错误" });
    }
  };

  const handleVerify = async () => {
    dispatch({ type: "SET_STATUS", status: "loading" });

    try {
      const body: Record<string, unknown> = {};
      if (state.method === "email") {
        body.code = state.emailCode;
      } else {
        body.answers = state.quizAnswers;
      }

      const res = await fetch(`/api/auth/register/challenges/${state.challengeId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        dispatch({ type: "SET_STATUS", status: "error", error: data.error?.message || "验证失败" });
        return;
      }

      dispatch({
        type: "VERIFIED",
        score: data.data.score,
        total: data.data.total,
      });
    } catch {
      dispatch({ type: "SET_STATUS", status: "error", error: "网络错误" });
    }
  };

  const handleRegister = async () => {
    if (state.password !== state.confirmPassword) {
      dispatch({ type: "SET_STATUS", status: "error", error: "两次输入的密码不一致" });
      return;
    }
    if (state.password.length < 6) {
      dispatch({ type: "SET_STATUS", status: "error", error: "密码至少 6 个字符" });
      return;
    }
    if (state.username.length < 2) {
      dispatch({ type: "SET_STATUS", status: "error", error: "用户名至少 2 个字符" });
      return;
    }

    dispatch({ type: "SET_STATUS", status: "loading" });

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: state.challengeId,
          username: state.username,
          password: state.password,
          nickname: state.nickname || undefined,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        dispatch({ type: "SET_STATUS", status: "error", error: data.error?.message || "注册失败" });
        return;
      }

      dispatch({ type: "SUCCESS" });
    } catch {
      dispatch({ type: "SET_STATUS", status: "error", error: "网络错误" });
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    dispatch({ type: "SET_STATUS", status: "loading" });

    try {
      const res = await fetch("/api/auth/register/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "email", email: state.email }),
      });
      const data = await res.json();

      if (data.ok) {
        dispatch({ type: "UPDATE", payload: { challengeId: data.data.challengeId } });
        dispatch({ type: "SET_STATUS", status: "idle" });
        startResendTimer();
      } else {
        dispatch({ type: "SET_STATUS", status: "error", error: data.error?.message || "Failed" });
      }
    } catch {
      dispatch({ type: "SET_STATUS", status: "error", error: "网络错误" });
    }
  };

  return (
    <>
      <h1 className={styles.title}>注册</h1>
      <p className={styles.subtitle}>
        加入 <strong>nanyee.de</strong> 社区
      </p>

      <NeoSteps steps={steps} currentStepIndex={state.step} />

      {state.errorMessage && <p className={styles.error}>{state.errorMessage}</p>}

      {state.step === 0 && (
        <div className={styles.form}>
          <NeoRadioGroup
            name="method"
            value={state.method}
            onChange={(v) => dispatch({ type: "SET_METHOD", method: v as "email" | "quiz" })}
            options={[
              { value: "email", label: "教育邮箱验证", description: "使用 .edu.cn 教育邮箱接收验证码" },
              { value: "quiz", label: "社区答题验证", description: "回答 20 道社区相关问题（需答对 90%）" },
            ]}
          />

          {state.method === "email" && (
            <NeoInput
              label="教育邮箱"
              type="email"
              value={state.email}
              onChange={(e) => dispatch({ type: "UPDATE", payload: { email: e.target.value } })}
              autoComplete="email"
              placeholder="yourname@xxx.edu.cn"
              required
            />
          )}

          <NeoButton
            className={styles.submitBtn}
            onClick={handleCreateChallenge}
            isLoading={state.status === "loading"}
            disabled={!state.method || (state.method === "email" && !state.email)}
          >
            {state.method === "email" ? "发送验证码" : state.method === "quiz" ? "开始答题" : "下一步"}
          </NeoButton>
        </div>
      )}

      {state.step === 1 && state.method === "email" && (
        <div className={styles.form}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            验证码已发送至 <strong>{state.email}</strong>
          </p>
          <NeoInput
            label="验证码"
            value={state.emailCode}
            onChange={(e) => dispatch({ type: "UPDATE", payload: { emailCode: e.target.value } })}
            maxLength={6}
            placeholder="6 位数字验证码"
            autoComplete="one-time-code"
            required
          />
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <NeoButton
              variant="secondary"
              onClick={() => dispatch({ type: "PREV_STEP" })}
            >
              返回
            </NeoButton>
            <NeoButton
              className={styles.submitBtn}
              onClick={handleVerify}
              isLoading={state.status === "loading"}
              disabled={state.emailCode.length !== 6}
            >
              验证
            </NeoButton>
          </div>
          <button
            onClick={handleResend}
            disabled={resendTimer > 0}
            style={{
              background: "none",
              border: "none",
              color: resendTimer > 0 ? "var(--text-muted)" : "var(--color-brand)",
              cursor: resendTimer > 0 ? "default" : "pointer",
              fontSize: "var(--text-xs)",
              padding: 0,
            }}
          >
            {resendTimer > 0 ? `${resendTimer}s 后可重发` : "重新发送验证码"}
          </button>
        </div>
      )}

      {state.step === 1 && state.method === "quiz" && (
        <div className={styles.form}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>
            共 {state.questions.length} 题，需答对 {Math.ceil(state.questions.length * 0.9)} 题（90%）
          </p>
          {state.questions.map((q, qi) => (
            <div key={q.id} className={styles.quizBlock}>
              <div className={styles.question}>
                {qi + 1}. {q.question}
              </div>
              <NeoRadioGroup
                name={`quiz-${q.id}`}
                value={state.quizAnswers[qi] >= 0 ? String(state.quizAnswers[qi]) : ""}
                onChange={(v) => {
                  const newAnswers = [...state.quizAnswers];
                  newAnswers[qi] = parseInt(v);
                  dispatch({ type: "UPDATE", payload: { quizAnswers: newAnswers } });
                }}
                options={q.options.map((opt, oi) => ({
                  value: String(oi),
                  label: opt,
                }))}
              />
            </div>
          ))}
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
            已回答 {state.quizAnswers.filter((a) => a >= 0).length} / {state.questions.length}
          </p>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <NeoButton
              variant="secondary"
              onClick={() => dispatch({ type: "PREV_STEP" })}
            >
              返回
            </NeoButton>
            <NeoButton
              className={styles.submitBtn}
              onClick={handleVerify}
              isLoading={state.status === "loading"}
              disabled={state.quizAnswers.some((a) => a < 0)}
            >
              提交答案
            </NeoButton>
          </div>
        </div>
      )}

      {state.step === 2 && (
        <div className={styles.form}>
          {state.quizScore !== null && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-success, #2e7d32)", textAlign: "center" }}>
              答题通过！得分：{state.quizScore}/{state.quizTotal}
            </p>
          )}
          <NeoInput
            label="用户名"
            value={state.username}
            onChange={(e) => dispatch({ type: "UPDATE", payload: { username: e.target.value } })}
            autoComplete="username"
            placeholder="2-20 位字母、数字、下划线"
            required
          />
          <NeoInput
            label="密码"
            type="password"
            value={state.password}
            onChange={(e) => dispatch({ type: "UPDATE", payload: { password: e.target.value } })}
            autoComplete="new-password"
            placeholder="至少 6 个字符"
            required
          />
          <NeoInput
            label="确认密码"
            type="password"
            value={state.confirmPassword}
            onChange={(e) => dispatch({ type: "UPDATE", payload: { confirmPassword: e.target.value } })}
            autoComplete="new-password"
            required
          />
          <NeoInput
            label="昵称（可选）"
            value={state.nickname}
            onChange={(e) => dispatch({ type: "UPDATE", payload: { nickname: e.target.value } })}
            placeholder="不填则使用用户名"
          />
          <NeoButton
            className={styles.submitBtn}
            onClick={handleRegister}
            isLoading={state.status === "loading"}
          >
            注册
          </NeoButton>
        </div>
      )}

      {state.step === 3 && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "var(--space-md)" }}>&#10003;</div>
          <h2 style={{ marginBottom: "var(--space-sm)" }}>注册成功！</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
            欢迎加入 nanyee.de 社区
          </p>
          <NeoButton onClick={() => { router.push("/"); router.refresh(); }}>
            进入首页
          </NeoButton>
        </div>
      )}

      {state.step < 3 && (
        <p className={styles.footer}>
          已有账号？{" "}
          <Link href="/login" className={styles.link}>
            去登录
          </Link>
        </p>
      )}
    </>
  );
}
