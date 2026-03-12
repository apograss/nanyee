"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

import styles from "./AnnouncementBell.module.css";

interface AnnouncementItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  priority: number;
}

export default function AnnouncementBell() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAnnouncements = async () => {
      try {
        const response = await fetch("/api/announcements");
        const data = await response.json();
        if (!cancelled && data.ok) {
          setAnnouncements(data.data.announcements || []);
        }
      } catch {
        if (!cancelled) {
          setAnnouncements([]);
        }
      }
    };

    void loadAnnouncements();
    const interval = window.setInterval(loadAnnouncements, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;

    fetch("/api/announcements/read", { method: "PATCH" })
      .then(() => refresh())
      .catch(() => {});
  }, [open, refresh, user]);

  const unreadCount = useMemo(() => {
    if (!user?.lastReadAnnouncementAt || announcements.length === 0) {
      return user ? announcements.length : 0;
    }

    const lastReadAt = new Date(user.lastReadAnnouncementAt).getTime();
    return announcements.filter(
      (announcement) => new Date(announcement.createdAt).getTime() > lastReadAt,
    ).length;
  }, [announcements, user]);

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-label="公告中心"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        🔔
        {user && unreadCount > 0 ? (
          <span className={styles.badge}>{Math.min(unreadCount, 9)}</span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>最新公告</div>
            <div className={styles.hint}>
              {user ? "打开面板后自动标记已读" : "登录后可记录未读状态"}
            </div>
          </div>
          {announcements.length > 0 ? (
            <div className={styles.list}>
              {announcements.map((announcement) => (
                <div key={announcement.id} className={styles.item}>
                  <div className={styles.itemText}>{announcement.content}</div>
                  <div className={styles.itemMeta}>
                    {new Date(announcement.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>当前没有公告。</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
