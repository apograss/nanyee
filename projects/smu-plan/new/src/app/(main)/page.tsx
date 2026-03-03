"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useChat } from "@/hooks/useChat";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import ChatStream from "@/components/organisms/ChatStream";
import styles from "./page.module.css";

/* ── Static Data ── */

const TOOLS = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: "课表导出",
    desc: "导出到 WakeUp / ICS",
    href: "/tools/schedule",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "成绩查询",
    desc: "GPA + 排名 + 趋势",
    href: "/tools/grades",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "自动选课",
    desc: "毫秒级抢课",
    href: "/tools/enroll",
  },
];

const DEFAULT_PROMPT_EXAMPLES = [
  { icon: "📅", text: "今天有什么课" },
  { icon: "📊", text: "帮我算一下 GPA" },
  { icon: "🏫", text: "南医大有哪些社团" },
  { icon: "🍜", text: "二食堂几点开门" },
];

type ModelOption = "LongCat-Flash-Lite" | "LongCat-Flash-Thinking-2601";

const MODEL_OPTIONS: { id: ModelOption; label: string; desc: string }[] = [
  { id: "LongCat-Flash-Lite", label: "快速", desc: "Flash Lite" },
  { id: "LongCat-Flash-Thinking-2601", label: "深度思考", desc: "Flash Thinking" },
];

/* ── Component ── */

export default function HomePage() {
  const { messages, status, send, stop, reset } = useChat();
  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelOption>("LongCat-Flash-Lite");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLFormElement>(null);

  const [focused, setFocused] = useState(false);

  const isIdle = status === "idle" && messages.length === 0;

  // Home sections visibility (from admin settings)
  const [sections, setSections] = useState({ searchHistory: true, tools: true });
  const [promptExamples, setPromptExamples] = useState(DEFAULT_PROMPT_EXAMPLES);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.settings.homeSections) {
          try {
            const parsed = JSON.parse(data.data.settings.homeSections);
            setSections({ searchHistory: parsed.searchHistory ?? true, tools: parsed.tools ?? true });
          } catch {}
        }
        if (data.ok && data.data.settings.promptExamples) {
          try {
            const parsed = JSON.parse(data.data.settings.promptExamples);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPromptExamples(parsed);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Click outside to close history dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) return;
    addHistory(query);
    setInput("");
    setFocused(false);
    send(query, model);
  };

  const handleQuickSend = (query: string) => {
    addHistory(query);
    setInput("");
    setFocused(false);
    send(query, model);
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

  /* ── Idle State ── */
  if (isIdle) {
    const showHistory = sections.searchHistory && focused && history.length > 0;

    return (
      <div className={styles.idle}>
        <div className={styles.hero}>
          {/* Greeting */}
          <h1 className={styles.greeting}>有什么可以帮你？</h1>

          {/* Unified Search Box */}
          <form className={styles.searchBox} onSubmit={handleSubmit} ref={searchBoxRef}>
            <div className={styles.searchContainer}>
              <input
                ref={inputRef}
                className={styles.searchInput}
                type="text"
                placeholder="问我任何关于南医的问题..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setFocused(true)}
                autoFocus
              />
              <div className={styles.searchActions}>
                {/* Inline Model Switch */}
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
                {/* Submit */}
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={!input.trim()}
                  aria-label="发送"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* History Dropdown */}
            {showHistory && (
              <div className={styles.historyDropdown}>
                <div className={styles.historyHeader}>
                  <span className={styles.historyTitle}>最近搜索</span>
                  <button className={styles.historyClear} onClick={clearHistory}>清除</button>
                </div>
                <div className={styles.historyList}>
                  {history.slice(0, 6).map((item) => (
                    <button
                      key={item.query}
                      type="button"
                      className={styles.historyItem}
                      onClick={() => handleQuickSend(item.query)}
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
          </form>

          {/* Prompt Chips */}
          <div className={styles.promptChips}>
            {promptExamples.map((example) => (
              <button
                key={example.text}
                className={styles.chip}
                onClick={() => handleQuickSend(example.text)}
              >
                <span className={styles.chipIcon}>{example.icon}</span>
                {example.text}
              </button>
            ))}
          </div>

          {/* Tool Strip */}
          {sections.tools && (
            <div className={styles.toolStrip}>
              {TOOLS.map((tool) => (
                <Link key={tool.href} href={tool.href} className={styles.toolMini}>
                  <span className={styles.toolMiniIcon}>{tool.icon}</span>
                  <span className={styles.toolMiniLabel}>{tool.title}</span>
                  <span className={styles.toolMiniDesc}>{tool.desc}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Chat Mode ── */
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
