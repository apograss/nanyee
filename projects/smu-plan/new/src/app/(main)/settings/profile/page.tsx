"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import Avatar from "@/components/atoms/Avatar/Avatar";
import styles from "../settings.module.css";

interface ProfileData {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  stats: { articles: number; messages: number; topics: number };
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfileSettingsPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Nickname edit
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nickSaving, setNickSaving] = useState(false);
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    // Frontend validation
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarMsg({ ok: false, text: "头像文件大小不能超过 2MB" });
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarMsg({ ok: false, text: "仅支持 JPG、PNG、WebP 格式" });
      return;
    }

    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        setProfile((p) => (p ? { ...p, avatarUrl: data.data.avatarUrl } : p));
        setAvatarMsg({ ok: true, text: "头像已更新" });
        refreshAuth();
      } else {
        setAvatarMsg({ ok: false, text: data.error?.message || "上传失败" });
      }
    } catch {
      setAvatarMsg({ ok: false, text: "网络错误" });
    }
    setAvatarUploading(false);
  };

  const handleNicknameSave = async () => {
    if (!nickname.trim()) return;
    setNickSaving(true);
    setNickMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setProfile((p) => (p ? { ...p, nickname: data.data.nickname } : p));
        setEditingNickname(false);
        setNickMsg({ ok: true, text: "昵称已更新" });
      } else {
        setNickMsg({ ok: false, text: data.error?.message || "保存失败" });
      }
    } catch {
      setNickMsg({ ok: false, text: "网络错误" });
    }
    setNickSaving(false);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--text-muted)" }}>
        加载中...
      </div>
    );
  if (error || !profile || !user)
    return (
      <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--text-muted)" }}>
        {error || "请先登录"}
      </div>
    );

  return (
    <>
      {/* Avatar & Basic info */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>基本信息</h2>

        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper}>
            <Avatar
              src={profile.avatarUrl}
              fallback={profile.nickname || profile.username}
              size="lg"
              onClick={handleAvatarClick}
            />
            {avatarUploading && <div className={styles.avatarOverlay}>上传中...</div>}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            hidden
          />
          <div className={styles.avatarInfo}>
            <div style={{ fontWeight: "var(--font-bold)" as string }}>
              {profile.nickname || profile.username}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              @{profile.username}
            </div>
            <button className={styles.editBtn} onClick={handleAvatarClick} disabled={avatarUploading}>
              {avatarUploading ? "上传中..." : "更换头像"}
            </button>
          </div>
        </div>

        {avatarMsg && (
          <div className={`${styles.msg} ${avatarMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {avatarMsg.text}
          </div>
        )}

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>用户名</span>
          <span className={styles.fieldValue}>{profile.username}</span>
        </div>

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>昵称</span>
          {editingNickname ? (
            <div className={styles.editRow}>
              <NeoInput
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入新昵称"
              />
              <NeoButton
                size="sm"
                variant="primary"
                onClick={handleNicknameSave}
                isLoading={nickSaving}
              >
                保存
              </NeoButton>
              <NeoButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingNickname(false);
                  setNickname(profile.nickname || "");
                  setNickMsg(null);
                }}
              >
                取消
              </NeoButton>
            </div>
          ) : (
            <span className={styles.fieldValue}>
              {profile.nickname || "-"}
              <button
                className={styles.editBtn}
                onClick={() => setEditingNickname(true)}
              >
                修改
              </button>
            </span>
          )}
        </div>

        {nickMsg && (
          <div className={`${styles.msg} ${nickMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {nickMsg.text}
          </div>
        )}

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>邮箱</span>
          <span className={styles.fieldValue}>
            {profile.email || "未绑定"}
            {profile.email && (
              <span className={profile.emailVerifiedAt ? styles.badgeOk : styles.badgeWarn}>
                {profile.emailVerifiedAt ? "已验证" : "未验证"}
              </span>
            )}
          </span>
        </div>

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>角色</span>
          <span className={styles.fieldValue}>
            {profile.role === "admin" ? "管理员" : "用户"}
          </span>
        </div>

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>注册时间</span>
          <span className={styles.fieldValue}>{formatDate(profile.createdAt)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>数据统计</h2>
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
      </div>
    </>
  );
}
