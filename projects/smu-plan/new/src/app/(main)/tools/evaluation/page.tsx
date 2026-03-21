"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import s from "./evaluation.module.css";

/* ── Types ───────────────────────────────── */

interface EvalTask {
  id: string;
  smuAccount: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunLog: string | null;
  totalRuns: number;
  totalEvaluated: number;
}

interface LogEntry {
  time: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

/* ── Component ───────────────────────────── */

export default function EvaluationPage() {
  const [task, setTask] = useState<EvalTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* form fields */
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);

  /* run logs */
  const [runLogs, setRunLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  /* ── Load task on mount ── */
  useEffect(() => {
    loadTask();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [runLogs]);

  async function loadTask() {
    setLoading(true);
    try {
      const resp = await fetch("/api/tools/evaluation");
      const data = await resp.json();
      if (data.ok && data.task) {
        setTask(data.task);
        setAccount(data.task.smuAccount);
        setEnabled(data.task.enabled);
        if (data.task.lastRunLog) {
          try {
            setRunLogs(JSON.parse(data.task.lastRunLog));
          } catch {}
        }
      }
    } catch {}
    setLoading(false);
  }

  /* ── Save task ── */
  async function handleSave() {
    if (!account || !password) {
      setError("请填写学号和密码");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const resp = await fetch("/api/tools/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smuAccount: account, smuPassword: password, enabled }),
      });
      const data = await resp.json();
      if (data.ok) {
        setTask(data.task);
        setPassword("");
        setSuccess("保存成功！密码已加密存储。");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch (err) {
      setError("网络错误");
    }
    setSaving(false);
  }

  /* ── Trigger evaluation ── */
  async function handleTrigger() {
    setRunning(true);
    setError("");
    setSuccess("");
    setRunLogs([]);

    try {
      const resp = await fetch("/api/tools/evaluation/trigger", {
        method: "POST",
      });
      const data = await resp.json();
      if (data.ok) {
        setRunLogs(data.result.logs || []);
        if (data.result.success) {
          setSuccess(
            data.result.evaluated > 0
              ? `评课完成！已评价 ${data.result.evaluated} 门课程`
              : "没有待评课程"
          );
        } else {
          setError("评课执行失败，请查看日志");
        }
        loadTask(); // Refresh stats
      } else {
        setError(data.error?.message || "触发失败");
      }
    } catch {
      setError("网络错误");
    }
    setRunning(false);
  }

  /* ── Delete task ── */
  async function handleDelete() {
    if (!confirm("确定要删除评课任务？你的教务账号密码将被清除。")) return;
    try {
      await fetch("/api/tools/evaluation", { method: "DELETE" });
      setTask(null);
      setAccount("");
      setPassword("");
      setRunLogs([]);
      setSuccess("已删除");
      setTimeout(() => setSuccess(""), 3000);
    } catch {}
  }

  /* ── Toggle enabled ── */
  async function handleToggle() {
    if (!task) return;
    const newEnabled = !enabled;
    setEnabled(newEnabled);

    try {
      await fetch("/api/tools/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smuAccount: account,
          smuPassword: password || "UNCHANGED",
          enabled: newEnabled,
        }),
      });
    } catch {}
  }

  /* ── Status badge ── */
  function statusBadge(status: string | null) {
    switch (status) {
      case "success":
        return <span className={s.badgeSuccess}>成功</span>;
      case "failed":
        return <span className={s.badgeFailed}>失败</span>;
      case "running":
        return <span className={s.badgeRunning}>运行中</span>;
      default:
        return <span className={s.badgeIdle}>未运行</span>;
    }
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div className={s.evalPage}>
        <div className={s.container}>
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <span className={s.spinner} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.evalPage}>
      <div className={s.container}>
        <Link href="/tools" className={s.backLink}>
          &larr; 返回工具列表
        </Link>

        <div className={s.header}>
          <h1>📝 自动评课</h1>
          <p>自动完成教务系统课程评价，支持后台定时执行</p>
        </div>

        {error && <div className={s.errorBanner}>{error}</div>}
        {success && <div className={s.successBanner}>{success}</div>}

        {/* ── Status Card ── */}
        {task && (
          <div className={s.card}>
            <h2>任务状态</h2>
            <div className={s.statusGrid}>
              <div className={s.statusItem}>
                <span className={s.statusValue}>{statusBadge(task.lastRunStatus)}</span>
                <span className={s.statusLabel}>最近状态</span>
              </div>
              <div className={s.statusItem}>
                <span className={s.statusValue}>
                  {task.lastRunAt
                    ? new Date(task.lastRunAt).toLocaleString("zh-CN")
                    : "—"}
                </span>
                <span className={s.statusLabel}>上次运行</span>
              </div>
              <div className={s.statusItem}>
                <span className={s.statusValue}>{task.totalRuns}</span>
                <span className={s.statusLabel}>总运行次数</span>
              </div>
              <div className={s.statusItem}>
                <span className={s.statusValue}>{task.totalEvaluated}</span>
                <span className={s.statusLabel}>已评课程数</span>
              </div>
            </div>

            {/* Toggle */}
            <div className={s.toggleRow}>
              <div>
                <div className={s.toggleLabel}>定时自动评课</div>
                <div className={s.toggleDesc}>每天 22:00 自动检查并评课</div>
              </div>
              <label className={s.toggle}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={handleToggle}
                />
                <span className={s.toggleTrack} />
              </label>
            </div>

            {/* Manual trigger */}
            <button
              className={s.btnPrimary}
              onClick={handleTrigger}
              disabled={running}
            >
              {running ? (
                <>
                  <span className={s.spinner} />
                  评课执行中...
                </>
              ) : (
                "立即评课"
              )}
            </button>
          </div>
        )}

        {/* ── Setup Card ── */}
        <div className={s.card}>
          <h2>{task ? "更新设置" : "设置教务账号"}</h2>

          <div className={s.infoBanner}>
            <strong>🔒 安全说明</strong>：你的密码将使用 AES-256-GCM 加密后存储，
            仅用于登录教务系统自动评课。管理员无法查看明文密码。
          </div>

          <div className={s.formGroup}>
            <label>教务系统学号</label>
            <input
              type="text"
              placeholder="请输入学号"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className={s.formGroup}>
            <label>{task ? "新密码（留空则不修改）" : "教务系统密码"}</label>
            <input
              type="password"
              placeholder={task ? "不修改请留空" : "请输入密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={saving || !account || (!task && !password)}
          >
            {saving ? (
              <>
                <span className={s.spinner} />
                保存中...
              </>
            ) : task ? (
              "更新设置"
            ) : (
              "保存并启用"
            )}
          </button>

          {task && (
            <button className={s.btnDanger} onClick={handleDelete}>
              删除任务
            </button>
          )}
        </div>

        {/* ── Log Card ── */}
        {runLogs.length > 0 && (
          <div className={s.card}>
            <h2>运行日志</h2>
            <div className={s.logConsole} ref={logRef}>
              {runLogs.map((log, i) => (
                <div key={i} className={`${s.logLine} ${s[log.level]}`}>
                  <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>
                    {new Date(log.time).toLocaleTimeString("zh-CN")}
                  </span>
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
