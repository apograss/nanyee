"use client";

import { useState, useEffect } from "react";
import MessageItem from "@/components/molecules/MessageItem";
import DanmakuOverlay from "@/components/organisms/DanmakuOverlay";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface GuestMessage {
  id: string;
  content: string;
  authorId: string;
  author: string;
  createdAt: string;
}

export default function GuestbookPage() {
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [danmakuOn, setDanmakuOn] = useState(true);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data?.user) setUser({ id: data.data.user.id, role: data.data.user.role });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/board")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setMessages(data.data.messages);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessages((prev) => [data.data, ...prev]);
        setInput("");
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const danmakuMessages = messages.map((m) => ({
    id: m.id,
    content: m.content,
    author: m.author,
  }));

  const startEdit = (msg: GuestMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleEditSave = async (msgId: string) => {
    if (!editContent.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/board/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, content: editContent.trim() } : m))
        );
        cancelEdit();
      }
    } catch {}
    setSavingEdit(false);
  };

  const canEditMsg = (msg: GuestMessage) =>
    user && (user.id === msg.authorId || user.role === "admin");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>留言板</h1>
            <p className={styles.desc}>说点什么吧</p>
          </div>
          <button
            className={`${styles.toggle} ${danmakuOn ? styles.toggleOn : ""}`}
            onClick={() => setDanmakuOn((v) => !v)}
            title={danmakuOn ? "关闭弹幕" : "开启弹幕"}
            aria-label={danmakuOn ? "关闭弹幕" : "开启弹幕"}
          >
            弹幕 {danmakuOn ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className={styles.danmakuArea}>
        <DanmakuOverlay messages={danmakuMessages} enabled={danmakuOn} />
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="写下你的留言... (登录后可发布)"
          rows={3}
          maxLength={500}
        />
        <NeoButton type="submit" isLoading={loading} disabled={!input.trim()}>
          发布
        </NeoButton>
      </form>

      <div className={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id}>
            {editingId === msg.id ? (
              <div className={styles.editRow}>
                <textarea
                  className={styles.textarea}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <NeoButton size="sm" variant="primary" onClick={() => handleEditSave(msg.id)} isLoading={savingEdit}>
                    保存
                  </NeoButton>
                  <NeoButton size="sm" variant="secondary" onClick={cancelEdit}>
                    取消
                  </NeoButton>
                </div>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <MessageItem
                  author={msg.author}
                  content={msg.content}
                  time={msg.createdAt}
                />
                {canEditMsg(msg) && (
                  <button
                    onClick={() => startEdit(msg)}
                    style={{
                      position: "absolute",
                      top: "0.5rem",
                      right: "0.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-brand)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    编辑
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className={styles.empty}>还没有留言，来第一个吧</p>
        )}
      </div>
    </div>
  );
}
