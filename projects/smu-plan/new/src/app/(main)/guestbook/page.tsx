"use client";

import { useState, useEffect } from "react";
import MessageItem from "@/components/molecules/MessageItem";
import DanmakuOverlay from "@/components/organisms/DanmakuOverlay";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface GuestMessage {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function GuestbookPage() {
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [danmakuOn, setDanmakuOn] = useState(true);

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
          <MessageItem
            key={msg.id}
            author={msg.author}
            content={msg.content}
            time={msg.createdAt}
          />
        ))}
        {messages.length === 0 && (
          <p className={styles.empty}>还没有留言，来第一个吧</p>
        )}
      </div>
    </div>
  );
}
