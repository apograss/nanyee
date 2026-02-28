"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface Author {
  id: string;
  username: string;
  nickname: string | null;
}

interface Topic {
  id: string;
  title: string;
  content: string;
  category: string;
  pinned: boolean;
  locked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  author: Author;
}

interface Reply {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string; nickname: string; role: string } | null>(null);

  const [replyContent, setReplyContent] = useState("");
  const [replying, setReplying] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.user) setUser(data.data.user);
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/bbs/topics/${id}`).then((r) => r.json()),
      fetch(`/api/bbs/topics/${id}/replies?page=${page}&limit=20`).then((r) => r.json()),
    ])
      .then(([topicData, repliesData]) => {
        if (topicData.ok) {
          setTopic(topicData.data.topic);
          setEditTitle(topicData.data.topic.title);
          setEditContent(topicData.data.topic.content);
        }
        if (repliesData.ok) {
          setReplies(repliesData.data.items);
          setTotalPages(repliesData.data.pagination.totalPages);
        }
      })
      .finally(() => setLoading(false));
  }, [id, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || replying) return;

    setReplying(true);
    try {
      const res = await fetch(`/api/bbs/topics/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setReplyContent("");
        loadData();
      } else {
        alert(data.error?.message || "回复失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setReplying(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editContent.trim() || savingEdit) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/bbs/topics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsEditing(false);
        setTopic((prev) => prev ? { ...prev, title: editTitle, content: editContent } : prev);
      } else {
        alert(data.error?.message || "更新失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确定要删除这个帖子吗？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/bbs/topics/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        router.push("/bbs");
      } else {
        alert(data.error?.message || "删除失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  if (loading && !topic) {
    return <div className={styles.container}><div className={styles.empty}>加载中...</div></div>;
  }
  if (!topic) {
    return <div className={styles.container}><div className={styles.empty}>帖子不存在或已被删除</div></div>;
  }

  const canEdit = user && (user.id === topic.author.id || user.role === "admin");

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={() => router.push("/bbs")}>
        &larr; 返回列表
      </button>

      <div className={styles.topicCard}>
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className={styles.editForm}>
            <label htmlFor="edit-title" className="sr-only">标题</label>
            <input
              id="edit-title"
              className={styles.editInput}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="帖子标题"
              required
            />
            <label htmlFor="edit-content" className="sr-only">内容</label>
            <textarea
              id="edit-content"
              className={styles.textarea}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="帖子内容..."
              required
              rows={10}
            />
            <div className={styles.editActions}>
              <NeoButton type="submit" variant="primary" isLoading={savingEdit}>保存修改</NeoButton>
              <NeoButton type="button" variant="secondary" onClick={() => setIsEditing(false)}>取消</NeoButton>
            </div>
          </form>
        ) : (
          <>
            <header className={styles.topicHeader}>
              <h1 className={styles.topicTitle}>{topic.title}</h1>
              <div className={styles.topicMeta}>
                <span className={styles.authorBadge}>{topic.author.nickname || topic.author.username}</span>
                <span>发表于 {new Date(topic.createdAt).toLocaleString()}</span>
                <span>阅读 {topic.viewCount}</span>
                <span>回复 {topic.replyCount}</span>
              </div>
            </header>
            <div className={styles.topicContent}>{topic.content}</div>
            {canEdit && (
              <div className={styles.topicActions}>
                <NeoButton size="sm" variant="secondary" onClick={() => setIsEditing(true)}>编辑</NeoButton>
                <NeoButton size="sm" variant="danger" onClick={handleDelete}>删除</NeoButton>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.repliesSection}>
        <h2 className={styles.repliesTitle}>回复 ({topic.replyCount})</h2>

        <div className={styles.replyList}>
          {replies.length === 0 ? (
            <div className={styles.emptyReplies}>暂无回复，来抢沙发吧</div>
          ) : (
            replies.map((reply, idx) => (
              <div key={reply.id} className={styles.replyCard}>
                <div className={styles.replySidebar}>
                  <div className={styles.avatar}>
                    {(reply.author.nickname || reply.author.username)[0]}
                  </div>
                  <div className={styles.floor}>#{(page - 1) * 20 + idx + 1}</div>
                </div>
                <div className={styles.replyMain}>
                  <div className={styles.replyMeta}>
                    <span className={styles.replyAuthor}>{reply.author.nickname || reply.author.username}</span>
                    <span className={styles.replyTime}>{new Date(reply.createdAt).toLocaleString()}</span>
                  </div>
                  <div className={styles.replyContent}>{reply.content}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <NeoButton variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              上一页
            </NeoButton>
            <span className={styles.pageInfo}>{page} / {totalPages}</span>
            <NeoButton variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              下一页
            </NeoButton>
          </div>
        )}

        <div className={styles.replyFormContainer}>
          {topic.locked ? (
            <div className={styles.lockedMessage}>此帖已被锁定，无法回复</div>
          ) : user ? (
            <form onSubmit={handleReplySubmit} className={styles.replyForm}>
              <label htmlFor="reply-content" className="sr-only">回复内容</label>
              <textarea
                id="reply-content"
                className={styles.textarea}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="友善发言，共同维护社区环境..."
                rows={4}
                required
              />
              <div className={styles.formActions}>
                <NeoButton type="submit" variant="primary" isLoading={replying}>
                  发表回复
                </NeoButton>
              </div>
            </form>
          ) : (
            <div className={styles.loginPrompt}>
              <p>登录后参与讨论</p>
              <NeoButton variant="primary" onClick={() => router.push(`/login?redirect=/bbs/${id}`)}>
                去登录
              </NeoButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
