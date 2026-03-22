"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SkeletonBlock from "@/components/atoms/SkeletonBlock";
import ConversationSidebar from "@/components/organisms/ConversationSidebar/ConversationSidebar";
import ChatStream from "@/components/organisms/ChatStream";
import AIDemoCard from "@/components/molecules/AIDemoCard";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import {
  CHAT_MODEL_LABELS as MODEL_LABELS,
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  type ChatModelOption as ModelOption,
} from "@/lib/ai/models";
import type { HomePreview } from "@/lib/wiki/queries";
import { relativeTime } from "@/lib/relative-time";
import styles from "./page.module.css";

// ─── Static data ────────────────────────────────────────────

const SEARCH_MODES = [
  { id: "ai" as const, label: "AI 问答", placeholder: "问我任何关于南医的问题…" },
  { id: "kb" as const, label: "知识库", placeholder: "搜索 Wiki 知识库文章…" },
  { id: "bbs" as const, label: "论坛", placeholder: "搜索论坛帖子…" },
];

const AI_PILLAR_ITEMS = [
  { emoji: "💬", title: "开始 AI 对话", sub: "多轮追问，引用知识库回答", href: "/" },
  { emoji: "📅", title: "帮我导出课表", sub: "WakeUp / ICS 双格式", href: "/tools/schedule" },
  { emoji: "📊", title: "查成绩和排名", sub: "GPA · 排名 · 学期对比", href: "/tools/grades" },
  { emoji: "⚡", title: "自动选课 / 抢课", sub: "毫秒级定时抢课", href: "/tools/enroll" },
] as const;

const TOOLS = [
  { icon: "📅", title: "课表导出", desc: "WakeUp / ICS 双格式，3 秒完成", href: "/tools/schedule" },
  { icon: "📊", title: "成绩查询", desc: "GPA 计算 + 排名 + 趋势图", href: "/tools/grades" },
  { icon: "⚡", title: "自动选课", desc: "毫秒级定时抢课，多志愿优先级", href: "/tools/enroll" },
] as const;

const DEFAULT_PROMPT_EXAMPLES = [
  { icon: "📮", text: "图书馆几点开门" },
  { icon: "📳", text: "帮我算个 GPA" },
  { icon: "🏫", text: "转专业要求" },
  { icon: "🍪", text: "选课宝典" },
] as const;

type SearchMode = "ai" | "kb" | "bbs";

// ─── Component ──────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { messages, status, send, stop, reset, conversationId, hydrateConversation } = useChat();
  const {
    history,
    add: addHistory,
    remove: removeHistory,
    clear: clearHistory,
  } = useSearchHistory();

  const [input, setInput] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("ai");
  const [model, setModel] = useState<ModelOption>(DEFAULT_CHAT_MODEL);
  const [focused, setFocused] = useState(false);
  const [sections, setSections] = useState({ searchHistory: true, tools: true });
  const [promptExamples, setPromptExamples] = useState([...DEFAULT_PROMPT_EXAMPLES]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [preview, setPreview] = useState<HomePreview | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [imageAttachment, setImageAttachment] = useState<{
    name: string;
    dataUrl: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLFormElement>(null);
  const hasMountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isIdle = status === "idle" && messages.length === 0;

  // Load settings + home preview
  useEffect(() => {
    const timeout = setTimeout(() => setSettingsLoaded(true), 1500);

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.settings.homeSections) {
          try {
            const parsed = JSON.parse(data.data.settings.homeSections);
            setSections({
              searchHistory: parsed.searchHistory ?? true,
              tools: parsed.tools ?? true,
            });
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
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        setSettingsLoaded(true);
      });

    fetch("/api/home/preview")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPreview(data.data);
      })
      .catch(() => {});

    fetch("/api/ai/capabilities")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setVisionEnabled(Boolean(data.data.visionEnabled));
      })
      .catch(() => {});

    return () => clearTimeout(timeout);
  }, []);

  // Click-outside for search dropdown
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(event.target as Node)
      ) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-focus chat input when entering chat mode
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!isIdle) chatInputRef.current?.focus();
  }, [isIdle]);

  useEffect(() => {
    if (searchMode !== "ai" && imageAttachment) {
      setImageAttachment(null);
    }
  }, [imageAttachment, searchMode]);

  const readImageFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Unsupported file reader result"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const attachImageFile = async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const dataUrl = await readImageFile(file);
    setImageAttachment({
      name: file.name,
      dataUrl,
    });
  };

  const handlePasteImage = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (!visionEnabled || searchMode !== "ai") {
      return;
    }

    const imageFile = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();

    if (!imageFile) {
      return;
    }

    event.preventDefault();
    await attachImageFile(imageFile);
  };

  const handleDropImage = async (event: React.DragEvent<HTMLFormElement>) => {
    if (!visionEnabled || searchMode !== "ai") {
      return;
    }

    event.preventDefault();
    const imageFile = Array.from(event.dataTransfer.files).find((file) =>
      file.type.startsWith("image/"),
    );
    await attachImageFile(imageFile);
  };

  const submitQuery = (query: string) => {
    const trimmed = query.trim();
    const finalQuery = trimmed || (imageAttachment ? "请帮我分析这张图片。" : "");
    if (!finalQuery) return;

    if (searchMode === "kb") {
      router.push(`/kb?q=${encodeURIComponent(finalQuery)}`);
      return;
    }
    if (searchMode === "bbs") {
      router.push(`/bbs?q=${encodeURIComponent(finalQuery)}`);
      return;
    }

    addHistory(finalQuery);
    setInput("");
    setFocused(false);
    send(finalQuery, model, imageAttachment?.dataUrl);
    setImageAttachment(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitQuery(input);
  };

  const handleNewChat = () => {
    reset();
    setMobileHistoryOpen(false);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelectConversation = (id: string, nextMessages: typeof messages) => {
    hydrateConversation(id, nextMessages);
    setMobileHistoryOpen(false);
  };

  const currentPlaceholder = SEARCH_MODES.find((m) => m.id === searchMode)?.placeholder ?? "";

  // ═══ Idle (Landing) State ═══
  if (isIdle) {
    const showHistory =
      sections.searchHistory && focused && history.length > 0;

    return (
      <div className={styles.idle}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.heroBadge}>
              <span className={styles.pulse} />
              AI 驱动 · 社区共建 · 南医专属
            </div>

            <h1 className={styles.greeting}>
              你的<span className={styles.highlight}>南医</span>
              <br />
              校园百事通
            </h1>

            <p className={styles.subtitle}>
              AI 秒答校园问题、一键导课表查成绩、Wiki 共建学科攻略、论坛讨论校园生活——一个入口全搞定。
            </p>

            {/* Search Box */}
            <form
              className={styles.searchWrap}
              onSubmit={handleSubmit}
              ref={searchBoxRef}
              onDragOver={(event) => {
                if (visionEnabled && searchMode === "ai") {
                  event.preventDefault();
                }
              }}
              onDrop={handleDropImage}
            >
              <div className={styles.searchBox}>
                <input
                  ref={inputRef}
                  className={styles.searchInput}
                  type="text"
                  placeholder={currentPlaceholder}
                  aria-label={currentPlaceholder}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onFocus={() => setFocused(true)}
                  onPaste={handlePasteImage}
                />
                <div className={styles.searchModes}>
                  {SEARCH_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`${styles.searchMode} ${searchMode === mode.id ? styles.searchModeActive : ""}`}
                      onClick={() => {
                        setSearchMode(mode.id);
                        inputRef.current?.focus();
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {visionEnabled && searchMode === "ai" ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (event) => {
                        await attachImageFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className={styles.attachBtn}
                      aria-label="上传图片"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      图片
                    </button>
                  </>
                ) : null}
                <button
                  type="submit"
                  className={styles.searchGo}
                  disabled={!input.trim() && !imageAttachment}
                  aria-label="发送"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>

              {imageAttachment && searchMode === "ai" ? (
                <div className={styles.attachmentChip}>
                  <span>图片：{imageAttachment.name}</span>
                  <button
                    type="button"
                    className={styles.attachmentRemove}
                    onClick={() => setImageAttachment(null)}
                  >
                    ×
                  </button>
                </div>
              ) : null}

              {showHistory && (
                <div className={styles.historyDropdown}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>最近搜索</span>
                    <button
                      type="button"
                      className={styles.historyClear}
                      onClick={clearHistory}
                    >
                      清除
                    </button>
                  </div>
                  <div className={styles.historyList}>
                    {history.slice(0, 6).map((item) => (
                      <button
                        key={item.query}
                        type="button"
                        className={styles.historyItem}
                        onClick={() => submitQuery(item.query)}
                      >
                        <span className={styles.historyText}>{item.query}</span>
                        <span
                          className={styles.historyRemove}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeHistory(item.query);
                          }}
                        >
                          &times;
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>

            {/* Chips */}
            {!settingsLoaded && searchMode === "ai" && (
              <div className={styles.chips} aria-hidden="true">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock
                    key={index}
                    width={index % 2 === 0 ? "124px" : "96px"}
                    height="42px"
                    radius="999px"
                  />
                ))}
              </div>
            )}

            {settingsLoaded && searchMode === "ai" && (
              <div className={styles.chips}>
                {promptExamples.map((example) => (
                  <button
                    key={example.text}
                    className={styles.chip}
                    onClick={() => submitQuery(example.text)}
                  >
                    <span className={styles.chipIcon}>{example.icon}</span>
                    {example.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hero right — AI demo card */}
          <div className={styles.heroRight}>
            <AIDemoCard />
          </div>
        </section>

        {/* ── Three Pillars ── */}
        <section className={styles.pillarsSection}>
          <div className={styles.sectionLabel}>三大核心板块</div>
          <div className={styles.pillars}>

            {/* AI Pillar */}
            <div className={`${styles.pillar} ${styles.pillarAi}`}>
              <div className={styles.pillarHead}>
                <div className={`${styles.pillarIcon} ${styles.pillarIconAi}`}>🤖</div>
                <div className={styles.pillarTitleWrap}>
                  <div className={styles.pillarTitle}>AI 智能助手</div>
                  <div className={styles.pillarDesc}>问什么都能答</div>
                </div>
                <span className={`${styles.pillarBadge} ${styles.pillarBadgeAi}`}>实时</span>
              </div>
              <div className={styles.pItems}>
                {AI_PILLAR_ITEMS.map((item) => (
                  <Link key={item.title} href={item.href} className={styles.pItem}>
                    <span className={styles.pEmoji}>{item.emoji}</span>
                    <div className={styles.pInfo}>
                      <div className={styles.pTitle}>{item.title}</div>
                      <div className={styles.pSub}>{item.sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className={styles.pillarFooter}>
                <Link href="/tools" className={styles.pillarFooterLink}>探索全部能力 →</Link>
              </div>
            </div>

            {/* Wiki Pillar */}
            <div className={`${styles.pillar} ${styles.pillarWiki}`}>
              <div className={styles.pillarHead}>
                <div className={`${styles.pillarIcon} ${styles.pillarIconWiki}`}>📚</div>
                <div className={styles.pillarTitleWrap}>
                  <div className={styles.pillarTitle}>知识库 Wiki</div>
                  <div className={styles.pillarDesc}>校园经验共建</div>
                </div>
                <span className={`${styles.pillarBadge} ${styles.pillarBadgeWiki}`}>
                  {preview?.kbStats?.totalArticles ?? "…"} 篇
                </span>
              </div>
              <div className={styles.pItems}>
                {preview && preview.latestArticles.length > 0
                  ? preview.latestArticles.map((a) => (
                    <Link key={a.slug} href={`/kb/${a.slug}`} className={styles.pItem}>
                      <div className={styles.pInfo}>
                        <div className={styles.pTitle}>{a.title}</div>
                        <div className={styles.wMeta}>
                          <span className={styles.miniAv} style={{ background: "#E8652B" }}>
                            {(a.authorName ?? "?")[0]}
                          </span>
                          <span>{a.authorName}</span>
                        </div>
                      </div>
                    </Link>
                  ))
                  : [
                    { t: "本科学习指南", v: 61, a: "田", c: "#E8652B" },
                    { t: "高等数学 · 八大专题梳理", v: 35, a: "X", c: "#457B9D" },
                    { t: "军事理论速记指南", v: 49, a: "田", c: "#E8652B" },
                    { t: "细胞生物学 · 英译中速记", v: 28, a: "T", c: "#27ae60" },
                  ].map((item) => (
                    <div key={item.t} className={styles.pItem}>
                      <div className={styles.pInfo}>
                        <div className={styles.pTitle}>{item.t}</div>
                        <div className={styles.wMeta}>
                          <span className={styles.miniAv} style={{ background: item.c }}>{item.a}</span>
                          <span>{item.v} 浏览</span>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
              <div className={styles.pillarFooter}>
                <Link href="/kb" className={styles.pillarFooterLink}>浏览全部知识库 →</Link>
              </div>
            </div>

            {/* Forum Pillar */}
            <div className={`${styles.pillar} ${styles.pillarForum}`}>
              <div className={styles.pillarHead}>
                <div className={`${styles.pillarIcon} ${styles.pillarIconForum}`}>💬</div>
                <div className={styles.pillarTitleWrap}>
                  <div className={styles.pillarTitle}>校园论坛</div>
                  <div className={styles.pillarDesc}>讨论 · 提问 · 分享</div>
                </div>
                <span className={`${styles.pillarBadge} ${styles.pillarBadgeForum}`}>活跃</span>
              </div>
              <div className={styles.pItems}>
                {preview?.latestForumPosts && preview.latestForumPosts.length > 0
                  ? preview.latestForumPosts.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={styles.pItem}
                      target="_self"
                    >
                      <div className={styles.pInfo}>
                        <div className={styles.pTitle}>{item.title}</div>
                        <div className={styles.fMeta}>
                          <span className={styles.miniAv} style={{ background: item.authorColor }}>
                            {item.authorInitial}
                          </span>
                          <span>{item.lastPostedAt ? relativeTime(item.lastPostedAt) : "刚刚"}</span>
                          <span className={styles.fCount}>💬 {item.replyCount}</span>
                        </div>
                      </div>
                    </Link>
                  ))
                  : (
                    <div className={styles.pItem}>
                      <div className={styles.pInfo}>
                        <div className={styles.pTitle}>论坛刚开张，来发第一帖吧</div>
                        <div className={styles.fMeta}>
                          <span className={styles.miniAv} style={{ background: "#457B9D" }}>坛</span>
                          <span>等待新帖</span>
                          <span className={styles.fCount}>💬 0</span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
              <div className={styles.pillarFooter}>
                <Link href="/bbs" className={styles.pillarFooterLink}>去论坛逛逛 →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Tools ── */}
        {sections.tools && (
          <section className={styles.toolsSection}>
            <div className={styles.toolsHead}>
              <span className={styles.toolsLabel}>⚡ 校园工具</span>
              <span className={styles.toolsLine} />
            </div>
            <div className={styles.toolsGrid}>
              {TOOLS.map((tool) => (
                <Link key={tool.href} href={tool.href} className={styles.toolCard}>
                  <div className={styles.toolIco}>{tool.icon}</div>
                  <div className={styles.toolInfo}>
                    <div className={styles.toolName}>{tool.title}</div>
                    <div className={styles.toolDesc}>{tool.desc}</div>
                  </div>
                  <span className={styles.toolArrow}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ═══ Chat Mode ═══
  return (
    <div className={styles.chatLayout}>
      {user ? (
        <>
          <ConversationSidebar
            className={styles.desktopConversationSidebar}
            activeConversationId={conversationId}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleNewChat}
          />
          {mobileHistoryOpen ? (
            <div
              className={styles.mobileConversationOverlay}
              onClick={() => setMobileHistoryOpen(false)}
            >
              <div
                className={styles.mobileConversationPanel}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.mobileConversationHeader}>
                  <div>
                    <strong className={styles.mobileConversationTitle}>对话历史</strong>
                    <p className={styles.mobileConversationHint}>从手机上也能快速切换旧对话。</p>
                  </div>
                  <button
                    type="button"
                    className={styles.mobileConversationClose}
                    onClick={() => setMobileHistoryOpen(false)}
                    aria-label="关闭对话历史"
                  >
                    ×
                  </button>
                </div>
                <ConversationSidebar
                  className={styles.mobileConversationSidebar}
                  activeConversationId={conversationId}
                  onSelectConversation={handleSelectConversation}
                  onCreateConversation={handleNewChat}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className={styles.chatMain}>
        <div className={styles.chatStream}>
          <ChatStream
            messages={messages}
            isLoading={status === "streaming"}
            onStop={stop}
          />
        </div>

        <div className={styles.chatBar}>
          <div className={styles.chatBarTools}>
            {user ? (
              <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setMobileHistoryOpen(true)}
              >
                历史
              </button>
            ) : null}
          <button
            className={styles.newChatBtn}
            onClick={handleNewChat}
            title="新对话"
            aria-label="开始新对话"
          >
            +
          </button>
          </div>
          <form
            className={styles.chatForm}
            onSubmit={handleSubmit}
            onDragOver={(event) => {
              if (visionEnabled) {
                event.preventDefault();
              }
            }}
            onDrop={handleDropImage}
          >
            <input
              ref={chatInputRef}
              className={styles.chatInput}
              type="text"
              placeholder="继续提问..."
              aria-label="继续追问"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={status === "streaming"}
              onPaste={handlePasteImage}
            />
            {visionEnabled ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (event) => {
                    await attachImageFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  className={styles.attachBtn}
                  aria-label="上传图片"
                  onClick={() => fileInputRef.current?.click()}
                >
                  图片
                </button>
              </>
            ) : null}
            <div className={styles.modelSwitchSmall}>
              {CHAT_MODEL_OPTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.modelBtnSmall} ${model === id ? styles.modelBtnActive : ""}`}
                  onClick={() => setModel(id)}
                  title={MODEL_LABELS[id].desc}
                >
                  {MODEL_LABELS[id].label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={status === "streaming" || (!input.trim() && !imageAttachment)}
              aria-label="发送消息"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
          {imageAttachment ? (
            <div className={styles.attachmentChip}>
              <span>图片：{imageAttachment.name}</span>
              <button
                type="button"
                className={styles.attachmentRemove}
                onClick={() => setImageAttachment(null)}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
