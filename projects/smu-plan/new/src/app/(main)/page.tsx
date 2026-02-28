"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useChat } from "@/hooks/useChat";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import ChatStream from "@/components/organisms/ChatStream";
import styles from "./page.module.css";

const HOT_TAGS = [
  "选课推荐",
  "转专业条件",
  "校园网连接",
  "课表导入",
  "实习流程",
  "快递驿站",
];

const TOOLS = [
  {
    icon: "\u{1F4C5}",
    title: "课表导出",
    desc: "一键导出教务课表到 WakeUp / ICS",
    href: "/tools/schedule",
    gradient: "linear-gradient(135deg, #FF6B35, #FF8F5E)",
  },
  {
    icon: "\u{1F4CA}",
    title: "成绩查询",
    desc: "GPA 计算 + 专业排名 + 趋势分析",
    href: "/tools/grades",
    gradient: "linear-gradient(135deg, #4CAF50, #66BB6A)",
  },
  {
    icon: "\u26A1",
    title: "自动选课",
    desc: "时间校准 + 毫秒级抢课",
    href: "/tools/enroll",
    gradient: "linear-gradient(135deg, #2196F3, #42A5F5)",
  },
];

type ModelOption = "LongCat-Flash-Lite" | "LongCat-Flash-Thinking-2601";

const MODEL_OPTIONS: { id: ModelOption; label: string; desc: string }[] = [
  { id: "LongCat-Flash-Lite", label: "快速", desc: "Flash Lite" },
  { id: "LongCat-Flash-Thinking-2601", label: "深度思考", desc: "Flash Thinking" },
];

export default function HomePage() {
  const { messages, status, send, stop, reset } = useChat();
  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelOption>("LongCat-Flash-Lite");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const isIdle = status === "idle" && messages.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) return;
    addHistory(query);
    setInput("");
    send(query, model);
  };

  const handleTagClick = (tag: string) => {
    addHistory(tag);
    setInput("");
    send(tag, model);
  };

  const handleNewChat = () => {
    reset();
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Auto-focus
  useEffect(() => {
    if (isIdle) {
      inputRef.current?.focus();
    } else {
      chatInputRef.current?.focus();
    }
  }, [isIdle]);

  if (isIdle) {
    return (
      <div className={styles.main}>
        {/* Announcement Banner */}
        <div className={styles.announcement}>
          <span className={styles.announcementDot} />
          <span>Nanyee.de 2.0 — AI Agent 驱动的校园工具平台，现已上线</span>
        </div>

        <div className={styles.center}>
          {/* Logo with SVG */}
          <div className={styles.logoRow}>
            <svg className={styles.logoSvg} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="16" width="60" height="60" rx="8" fill="var(--border-color)" transform="translate(6, 6)" />
              <rect x="16" y="16" width="60" height="60" rx="8" fill="var(--color-brand)" stroke="var(--border-color)" strokeWidth="6" />
              <path d="M 42 32 H 50 V 40 H 58 V 48 H 50 V 56 H 42 V 48 H 34 V 40 H 42 Z" fill="#FFFFFF" stroke="var(--border-color)" strokeWidth="4" strokeLinejoin="round" />
              <rect x="44" y="44" width="60" height="60" rx="8" fill="var(--border-color)" transform="translate(6, 6)" />
              <rect x="44" y="44" width="60" height="60" rx="8" fill="var(--bg-secondary)" stroke="var(--border-color)" strokeWidth="6" />
              <polyline points="56,60 68,70 56,80" fill="none" stroke="var(--border-color)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="74" y1="84" x2="90" y2="84" stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <h1 className={styles.logo}>Nanyee.de</h1>
          </div>
          <p className={styles.tagline}>南医的 AI Agent</p>

          <div className={styles.tags}>
            {HOT_TAGS.map((tag) => (
              <button
                key={tag}
                className={styles.tag}
                type="button"
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <form className={styles.searchWrap} onSubmit={handleSubmit}>
            <div className={styles.searchRow}>
              <div className={styles.searchInputRow}>
                <input
                  ref={inputRef}
                  className={styles.searchInput}
                  type="text"
                  placeholder="问我任何关于南医的问题..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className={styles.searchSendBtn}
                  disabled={!input.trim()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              {/* Model selector */}
              <div className={styles.modelSwitch}>
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.modelBtn} ${model === opt.id ? styles.modelBtnActive : ""}`}
                    onClick={() => setModel(opt.id)}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {history.length > 0 && (
            <div className={styles.historySection}>
              <div className={styles.historyHeader}>
                <span className={styles.historyTitle}>最近搜索</span>
                <button className={styles.historyClear} onClick={clearHistory}>清除</button>
              </div>
              <div className={styles.historyList}>
                {history.slice(0, 8).map((item) => (
                  <button
                    key={item.query}
                    className={styles.historyItem}
                    onClick={() => handleTagClick(item.query)}
                  >
                    <span className={styles.historyText}>{item.query}</span>
                    <span
                      className={styles.historyRemove}
                      onClick={(e) => { e.stopPropagation(); removeHistory(item.query); }}
                    >
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tools Showcase */}
          <div className={styles.toolsSection}>
            <h2 className={styles.toolsSectionTitle}>
              <span className={styles.sparkle}>&#x2728;</span> AI 驱动的校园工具
            </h2>
            <div className={styles.toolsGrid}>
              {TOOLS.map((tool, i) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={styles.toolCard}
                  style={{ animationDelay: `${i * 100}ms`, "--tool-gradient": tool.gradient } as React.CSSProperties}
                >
                  <div className={styles.toolIcon}>{tool.icon}</div>
                  <div className={styles.toolInfo}>
                    <div className={styles.toolTitle}>{tool.title}</div>
                    <div className={styles.toolDesc}>{tool.desc}</div>
                  </div>
                  <div className={styles.toolArrow}>&#x2192;</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat mode
  return (
    <div className={styles.chatLayout}>
      <div className={styles.chatStream}>
        <ChatStream
          messages={messages}
          isLoading={status === "streaming"}
          onStop={stop}
        />
      </div>

      <div className={styles.chatBar}>
        <button
          className={styles.newChatBtn}
          onClick={handleNewChat}
          title="新对话"
        >
          +
        </button>
        <form className={styles.chatForm} onSubmit={handleSubmit}>
          <input
            ref={chatInputRef}
            className={styles.chatInput}
            type="text"
            placeholder="继续提问..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === "streaming"}
          />
          <div className={styles.modelSwitchSmall}>
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.modelBtnSmall} ${model === opt.id ? styles.modelBtnActive : ""}`}
                onClick={() => setModel(opt.id)}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={status === "streaming" || !input.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
