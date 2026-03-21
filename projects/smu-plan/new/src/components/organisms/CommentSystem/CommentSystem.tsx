"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import Avatar from "@/components/atoms/Avatar/Avatar";
import NeoButton from "@/components/atoms/NeoButton";
import { relativeTime } from "@/lib/relative-time";

import styles from "./CommentSystem.module.css";

interface CommentAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
}

interface CommentGroup {
  paragraphIndex: number;
  count: number;
  items: CommentData[];
}

interface CommentSystemProps {
  articleSlug: string;
  isLoggedIn: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}

const PARAGRAPH_SELECTOR = "p, h2, h3, blockquote, pre, table";

export default function CommentSystem({
  articleSlug,
  isLoggedIn,
  currentUserId,
  isAdmin,
}: CommentSystemProps) {
  const [groups, setGroups] = useState<CommentGroup[]>([]);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const readApiPayload = useCallback(async (response: Response) => {
    const raw = await response.text();

    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {
        ok: false,
        error: {
          message: raw.trim() || `请求失败，状态码 ${response.status}`,
        },
      };
    }
  }, []);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments`);
      const data = await readApiPayload(res);
      if (res.ok && data.ok) {
        setGroups(data.data.groups);
        setRequestError(null);
      } else {
        setRequestError(data.error?.message || "评论加载失败，请稍后重试。");
      }
    } catch {
      setRequestError("评论加载失败，请检查网络后重试。");
    }
  }, [articleSlug, readApiPayload]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    if (activeParagraph !== null) {
      setRequestError(null);
    }
  }, [activeParagraph]);

  const injectedIconsRef = useRef<HTMLButtonElement[]>([]);

  useEffect(() => {
    const body = document.querySelector("[data-article-body]");
    if (!body) return;
    containerRef.current = body as HTMLDivElement;

    // Clean up any previously injected icons (defensive against React strict mode double-invoke)
    injectedIconsRef.current.forEach((node) => node.remove());
    injectedIconsRef.current = [];
    body.querySelectorAll("[data-comment-icon]").forEach((node) => node.remove());

    const commentableBlocks = Array.from(body.querySelectorAll(PARAGRAPH_SELECTOR)).filter((node) => {
      const element = node as HTMLElement;
      if (element.closest("table") && element.tagName !== "TABLE") {
        return false;
      }
      return true;
    });

    commentableBlocks.forEach((block, idx) => {
      block.setAttribute("data-pi", String(idx));
      (block as HTMLElement).style.position = "relative";

      const icon = document.createElement("button");
      icon.setAttribute("data-comment-icon", "true");
      icon.className = styles.commentIcon;
      icon.setAttribute("aria-label", "添加段落评论");
      icon.type = "button";

      const emoji = document.createElement("span");
      emoji.textContent = "\uD83D\uDCAC";
      emoji.setAttribute("aria-hidden", "true");
      icon.appendChild(emoji);

      icon.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRequestError(null);
        setActiveParagraph(idx);
      };

      block.appendChild(icon);
      injectedIconsRef.current.push(icon);
    });

    return () => {
      injectedIconsRef.current.forEach((node) => node.remove());
      injectedIconsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const body = containerRef.current;
    if (!body) return;

    body.querySelectorAll("[data-comment-icon]").forEach((icon) => {
      const parent = icon.parentElement;
      if (!parent) return;
      const idx = Number(parent.getAttribute("data-pi"));
      const group = groups.find((item) => item.paragraphIndex === idx);

      icon.querySelector("[data-comment-badge]")?.remove();

      if (group && group.count > 0) {
        const badge = document.createElement("span");
        badge.setAttribute("data-comment-badge", "true");
        badge.className = styles.commentBadge;
        badge.textContent = String(group.count);
        icon.appendChild(badge);
        icon.classList.add(styles.commentIconHasComments);
        (icon as HTMLElement).setAttribute("aria-label", `${group.count} 条段落评论`);
      } else {
        icon.classList.remove(styles.commentIconHasComments);
        (icon as HTMLElement).setAttribute("aria-label", "添加段落评论");
      }
    });
  }, [groups]);

  const activeGroup = activeParagraph !== null
    ? groups.find((group) => group.paragraphIndex === activeParagraph)
    : null;

  const handleSubmit = async () => {
    if (!inputValue.trim() || activeParagraph === null || submitting) return;

    setSubmitting(true);
    setRequestError(null);

    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paragraphIndex: activeParagraph,
          content: inputValue.trim(),
        }),
      });
      const data = await readApiPayload(res);
      if (res.ok && data.ok) {
        setInputValue("");
        await loadComments();
      } else {
        setRequestError(data.error?.message || "评论发布失败，请稍后再试。");
      }
    } catch {
      setRequestError("评论发布失败，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("确定要删除这条评论吗？")) return;

    setRequestError(null);
    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments/${commentId}`, {
        method: "DELETE",
      });
      const data = await readApiPayload(res);
      if (res.ok && data.ok) {
        await loadComments();
      } else {
        setRequestError(data.error?.message || "删除评论失败，请稍后再试。");
      }
    } catch {
      setRequestError("删除评论失败，请检查网络后重试。");
    }
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>段落评论</div>
          <div className={styles.panelSubtitle}>
            {activeParagraph === null
              ? "点击正文里的评论按钮后，这里会显示对应段落的讨论。"
              : `当前段落：第 ${activeParagraph + 1} 段`}
          </div>
        </div>
        {activeParagraph !== null ? (
          <button
            className={styles.panelClose}
            onClick={() => setActiveParagraph(null)}
            aria-label="关闭评论面板"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className={styles.panelBody}>
        {requestError ? (
          <div className={styles.requestError} role="alert">
            {requestError}
          </div>
        ) : null}

        {activeParagraph === null ? (
          <div className={styles.panelEmpty}>
            选中文章里的评论按钮后，这里会显示对应段落的评论和输入框。
          </div>
        ) : !activeGroup || activeGroup.items.length === 0 ? (
          <div className={styles.panelEmpty}>这个段落还没有评论，来写第一条吧。</div>
        ) : (
          activeGroup.items.map((comment) => (
            <div key={comment.id} className={styles.commentItem}>
              <Avatar
                src={comment.author.avatarUrl}
                fallback={comment.author.displayName}
                size="sm"
              />
              <div className={styles.commentBody}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{comment.author.displayName}</span>
                  <span className={styles.commentTime}>{relativeTime(comment.createdAt)}</span>
                  {(comment.author.id === currentUserId || isAdmin) ? (
                    <button
                      className={styles.commentDelete}
                      onClick={() => handleDelete(comment.id)}
                    >
                      删除
                    </button>
                  ) : null}
                </div>
                <div className={styles.commentContent}>{comment.content}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.panelFooter}>
        {activeParagraph === null ? (
          <div className={styles.loginHint}>先点选一个段落，再开始讨论。</div>
        ) : isLoggedIn ? (
          <div className={styles.inputWrap}>
            <textarea
              className={styles.inputField}
              placeholder="写下你的评论..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              rows={2}
            />
            <NeoButton
              size="sm"
              variant="primary"
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={!inputValue.trim()}
            >
              发布
            </NeoButton>
          </div>
        ) : (
          <div className={styles.loginHint}>登录后即可评论。</div>
        )}
      </div>
    </aside>
  );
}
