"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./AnnouncementBar.module.css";

interface AnnouncementData {
  id: string;
  content: string;
}

export default function AnnouncementBar() {
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.announcement) {
          const ann: AnnouncementData = data.data.announcement;
          const dismissed = localStorage.getItem(`ann-dismissed-${ann.id}`);
          if (!dismissed) {
            setAnnouncement(ann);
            setVisible(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    setHiding(true);
    setTimeout(() => {
      setVisible(false);
      setHiding(false);
      if (announcement) {
        localStorage.setItem(`ann-dismissed-${announcement.id}`, "1");
      }
    }, 300);
  }, [announcement]);

  if (!visible || !announcement) return null;

  return (
    <div className={`${styles.bar} ${hiding ? styles.hiding : ""}`}>
      <div className={styles.inner}>
        <span className={styles.dot} />
        <span className={styles.badge}>NEW</span>
        <span className={styles.content}>{announcement.content}</span>
        <button className={styles.close} onClick={dismiss} aria-label="关闭公告">
          &times;
        </button>
      </div>
    </div>
  );
}
