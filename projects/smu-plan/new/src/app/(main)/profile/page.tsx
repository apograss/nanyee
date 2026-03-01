"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

interface ProfileData {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  stats: { articles: number; messages: number; topics: number };
}

type Tab = "articles" | "posts" | "messages";

interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  viewCount: number;
  createdAt: string;
}

interface PostItem {
  id: string;
  title: string;
  category: string;
  viewCount: number;
  replyCount: number;
  createdAt: string;
}

interface MessageItem {
  id: string;
  content: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Nickname edit
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nickSaving, setNickSaving] = useState(false);

  // Password change
  const [showPassword, setShowPassword] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");

  // Tab content
  const [tab, setTab] = useState<Tab>("articles");
  const [tabItems, setTabItems] = useState<(ArticleItem | PostItem | MessageItem)[]>([]);
  const [tabPagination, setTabPagination] = useState<Pagination | null>(null);
  const [tabPage, setTabPage] = useState(1);
  const [tabLoading, setTabLoading] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/profile");
        const data = await res.json();
        if (data.ok) {
          setProfile(data.data);
          setNickname(data.data.nickname || "");
        } else {
          setError(data.error?.message || "加载失败");
        }
      } catch {
        setError("网络错误");
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    loadTabContent();
  }, [tab, tabPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTabContent = async () => {
    setTabLoading(true);
    try {
      const res = await fetch(`/api/auth/profile/${tab}?page=${tabPage}`);
      const data = await res.json();
      if (data.ok) {
        setTabItems(data.data.items);
        setTabPagination(data.data.pagination);
      }
    } catch {}
    setTabLoading(false);
  };

  const handleNicknameSave = async () => {
    if (!nickname.trim()) return;
    setNickSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setProfile((p) => p ? { ...p, nickname: data.data.nickname } : p);
        setEditingNickname(false);
      } else {
        alert(data.error?.message || "保存失败");
      }
    } catch {
      alert("网络错误");
    }
    setNickSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg("");
    if (newPwd !== confirmPwd) {
      setPwdMsg("两次输入的密码不一致");
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (data.ok) {
        setPwdMsg("密码修改成功");
        setOldPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setShowPassword(false);
      } else {
        setPwdMsg(data.error?.message || "修改失败");
      }
    } catch {
      setPwdMsg("网络错误");
    }
    setPwdSaving(false);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

  if (loading) return <div className={styles.page}><div className={styles.empty}>加载中...</div></div>;
  if (error || !profile) return <div className={styles.page}><div className={styles.empty}>{error || "请先登录"}</div></div>;
  if (!user) return <div className={styles.page}><div className={styles.empty}>请先<Link href="/login">登录</Link></div></div>;

  const STATUS_MAP: Record<string, string> = {
    draft: "草稿",
    pending: "待审",
    published: "已发布",
    rejected: "已退回",
  };

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        {/* Identity card */}
        <div className={styles.card}>
          <div className={styles.avatar}>
            {(profile.nickname || profile.username).charAt(0).toUpperCase()}
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>用户名</span>
            <span className={styles.value}>{profile.username}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>昵称</span>
            {editingNickname ? (
              <div className={styles.editRow}>
                <NeoInput
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
                <NeoButton size="sm" variant="primary" onClick={handleNicknameSave} isLoading={nickSaving}>
                  保存
                </NeoButton>
                <NeoButton size="sm" variant="secondary" onClick={() => { setEditingNickname(false); setNickname(profile.nickname || ""); }}>
                  取消
                </NeoButton>
              </div>
            ) : (
              <span className={styles.value}>
                {profile.nickname || "-"}
                <button className={styles.editBtn} onClick={() => setEditingNickname(true)}>修改</button>
              </span>
            )}
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>邮箱</span>
            <span className={styles.value}>
              {profile.email || "未绑定"}
              {profile.email && (
                <span className={profile.emailVerifiedAt ? styles.badgeOk : styles.badgeWarn}>
                  {profile.emailVerifiedAt ? "已验证" : "未验证"}
                </span>
              )}
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>注册时间</span>
            <span className={styles.value}>{formatDate(profile.createdAt)}</span>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profile.stats.articles}</span>
              <span className={styles.statLabel}>文章</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profile.stats.topics}</span>
              <span className={styles.statLabel}>帖子</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profile.stats.messages}</span>
              <span className={styles.statLabel}>留言</span>
            </div>
          </div>

          {/* Password change */}
          <div className={styles.passwordSection}>
            <button className={styles.togglePassword} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "收起" : "修改密码"}
            </button>
            {showPassword && (
              <form className={styles.pwdForm} onSubmit={handlePasswordChange}>
                <NeoInput label="旧密码" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
                <NeoInput label="新密码" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
                <NeoInput label="确认新密码" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required />
                {pwdMsg && <div className={styles.pwdMsg}>{pwdMsg}</div>}
                <NeoButton type="submit" variant="primary" size="sm" isLoading={pwdSaving}>确认修改</NeoButton>
              </form>
            )}
          </div>
        </div>

        {/* Tabs content */}
        <div className={styles.content}>
          <div className={styles.tabs}>
            {(["articles", "posts", "messages"] as Tab[]).map((t) => (
              <button
                key={t}
                className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ""}`}
                onClick={() => { setTab(t); setTabPage(1); }}
              >
                {{ articles: "我的文章", posts: "我的帖子", messages: "我的留言" }[t]}
              </button>
            ))}
          </div>

          {tabLoading ? (
            <div className={styles.empty}>加载中...</div>
          ) : tabItems.length === 0 ? (
            <div className={styles.empty}>暂无内容</div>
          ) : (
            <div className={styles.itemList}>
              {tab === "articles" && (tabItems as ArticleItem[]).map((item) => (
                <Link key={item.id} href={`/kb/${item.slug}`} className={styles.item}>
                  <div className={styles.itemTitle}>{item.title}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.statusBadge} data-status={item.status}>
                      {STATUS_MAP[item.status] || item.status}
                    </span>
                    <span>{item.viewCount} 浏览</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </Link>
              ))}

              {tab === "posts" && (tabItems as PostItem[]).map((item) => (
                <Link key={item.id} href={`/bbs/${item.id}`} className={styles.item}>
                  <div className={styles.itemTitle}>{item.title}</div>
                  <div className={styles.itemMeta}>
                    <span>{item.category}</span>
                    <span>{item.replyCount} 回复</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </Link>
              ))}

              {tab === "messages" && (tabItems as MessageItem[]).map((item) => (
                <div key={item.id} className={styles.item}>
                  <div className={styles.itemContent}>{item.content}</div>
                  <div className={styles.itemMeta}>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tabPagination && tabPagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <NeoButton size="sm" variant="secondary" onClick={() => setTabPage(tabPage - 1)} disabled={tabPage <= 1}>
                上一页
              </NeoButton>
              <span className={styles.pageInfo}>
                {tabPagination.page} / {tabPagination.totalPages}
              </span>
              <NeoButton size="sm" variant="secondary" onClick={() => setTabPage(tabPage + 1)} disabled={tabPage >= tabPagination.totalPages}>
                下一页
              </NeoButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
