"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "../settings.module.css";
import s from "./sessions.module.css";

interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

function parseUA(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: "未知设备", browser: "" };

  let browser = "未知浏览器";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

  let os = "";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return { device: os || "未知系统", browser };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export default function SessionsSettingsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      const data = await res.json();
      if (data.ok) {
        setSessions(data.data.sessions);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        setMsg({ ok: true, text: "已注销该设备" });
      } else {
        setMsg({ ok: false, text: data.error?.message || "操作失败" });
      }
    } catch {
      setMsg({ ok: false, text: "网络错误" });
    }
    setRevoking(null);
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/sessions/revoke-others", {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setSessions((prev) => prev.filter((s) => s.isCurrent));
        setMsg({ ok: true, text: `已注销其他 ${data.data.revokedCount} 个设备` });
      } else {
        setMsg({ ok: false, text: data.error?.message || "操作失败" });
      }
    } catch {
      setMsg({ ok: false, text: "网络错误" });
    }
    setRevokingAll(false);
  };

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--text-muted)" }}>
        加载中...
      </div>
    );

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>登录设备</h2>

      {msg && (
        <div className={`${styles.msg} ${msg.ok ? styles.msgOk : styles.msgErr}`}>
          {msg.text}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className={s.emptyMsg}>暂无活跃会话</div>
      ) : (
        <div className={s.sessionList}>
          {sessions.map((session) => {
            const { device, browser } = parseUA(session.userAgent);
            return (
              <div
                key={session.id}
                className={`${s.sessionItem} ${session.isCurrent ? s.sessionCurrent : ""}`}
              >
                <div className={s.sessionIcon}>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div className={s.sessionInfo}>
                  <div className={s.sessionDevice}>
                    {device} / {browser}
                    {session.isCurrent && <span className={s.currentBadge}>当前</span>}
                  </div>
                  <div className={s.sessionMeta}>
                    {session.ip && <>{session.ip} &middot; </>}
                    最后活跃 {timeAgo(session.lastSeenAt)}
                  </div>
                </div>
                {!session.isCurrent && (
                  <NeoButton
                    variant="danger"
                    size="sm"
                    className={s.revokeBtn}
                    onClick={() => handleRevoke(session.id)}
                    isLoading={revoking === session.id}
                  >
                    注销
                  </NeoButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      {otherCount > 0 && (
        <div className={s.revokeAllRow}>
          <NeoButton
            variant="danger"
            size="sm"
            onClick={handleRevokeAll}
            isLoading={revokingAll}
          >
            注销其他所有设备 ({otherCount})
          </NeoButton>
        </div>
      )}
    </div>
  );
}
