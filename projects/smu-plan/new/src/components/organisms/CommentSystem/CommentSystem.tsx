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

const PARAGRAPH_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote";

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments`);
      const data = await res.json();
      if (data.ok) {
        setGroups(data.data.groups);
      }
    } catch {}
  }, [articleSlug]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Index paragraphs + inject persistent icon buttons (once on mount)
  useEffect(() => {
    const body = document.querySelector("[data-article-body]");
    if (!body) return;
    containerRef.current = body as HTMLDivElement;

    const paragraphs = body.querySelectorAll(PARAGRAPH_SELECTOR);
    paragraphs.forEach((p, idx) => {
      p.setAttribute("data-pi", String(idx));
      (p as HTMLElement).style.position = "relative";

      const icon = document.createElement("button");
      icon.setAttribute("data-comment-icon", "true");
      icon.className = styles.commentIcon;
      icon.setAttribute("aria-label", "添加评论");

      const emoji = document.createElement("span");
      emoji.textContent = "💬";
      emoji.setAttribute("aria-hidden", "true");
      icon.appendChild(emoji);

      icon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveParagraph(idx);
      };

      p.appendChild(icon);
    });

    return () => {
      body.querySelectorAll("[data-comment-icon]").forEach((el) => el.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update icon badges when comment groups change
  useEffect(() => {
    const body = containerRef.current;
    if (!body) return;

    body.querySelectorAll("[data-comment-icon]").forEach((icon) => {
      const p = icon.parentElement;
      if (!p) return;
      const idx = Number(p.getAttribute("data-pi"));
      const group = groups.find((g) => g.paragraphIndex === idx);

      // Remove old badge
      icon.querySelector("[data-comment-badge]")?.remove();

      if (group && group.count > 0) {
        const badge = document.createElement("span");
        badge.setAttribute("data-comment-badge", "true");
        badge.className = styles.commentBadge;
        badge.textContent = String(group.count);
        icon.appendChild(badge);
        icon.classList.add(styles.commentIconHasComments);
        (icon as HTMLElement).setAttribute("aria-label", `${group.count} 条评论`);
      } else {
        icon.classList.remove(styles.commentIconHasComments);
        (icon as HTMLElement).setAttribute("aria-label", "添加评论");
      }
    });
  }, [groups]);

  const getGroupForParagraph = useCallback(
    (idx: number) => groups.find((g) => g.paragraphIndex === idx),
    [groups]
  );

  const activeGroup = activeParagraph !== null ? getGroupForParagraph(activeParagraph) : null;

  const handleSubmit = async () => {
    if (!inputValue.trim() || activeParagraph === null || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paragraphIndex: activeParagraph,
          content: inputValue.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setInputValue("");
        await loadComments();
      }
    } catch {}
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    try {
      const res = await fetch(`/api/wiki/${articleSlug}/comments/${commentId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        await loadComments();
      }
    } catch {}
  };

  if (activeParagraph === null) return null;

  return (
    <>
      <div className={styles.panelOverlay} onClick={() => setActiveParagraph(null)} />
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            评论 {activeGroup ? `(${activeGroup.count})` : ""}
          </span>
          <button
            className={styles.panelClose}
            onClick={() => setActiveParagraph(null)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className={styles.panelBody}>
          {!activeGroup || activeGroup.items.length === 0 ? (
            <div className={styles.panelEmpty}>暂无评论，成为第一个评论的人</div>
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
                    {(comment.author.id === currentUserId || isAdmin) && (
                      <button
                        className={styles.commentDelete}
                        onClick={() => handleDelete(comment.id)}
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <div className={styles.commentContent}>{comment.content}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.panelFooter}>
          {isLoggedIn ? (
            <div className={styles.inputWrap}>
              <textarea
                className={styles.inputField}
                placeholder="写下你的评论..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                rows={1}
              />
              <NeoButton
                size="sm"
                variant="primary"
                onClick={handleSubmit}
                isLoading={submitting}
                disabled={!inputValue.trim()}
              >
                发送
              </NeoButton>
            </div>
          ) : (
            <div className={styles.loginHint}>登录后即可评论</div>
          )}
        </div>
      </div>
    </>
  );
}
