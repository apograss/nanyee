"use client";

import { useMemo } from "react";
import styles from "./DanmakuOverlay.module.css";

interface DanmakuMessage {
  id: string;
  content: string;
  author?: string;
}

interface DanmakuOverlayProps {
  messages: DanmakuMessage[];
  enabled: boolean;
  tracks?: number;
}

const COLORS = [
  "var(--color-brand)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-info)",
  "var(--text-primary)",
];

// Simple deterministic hash for stable color/timing assignment
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const MAX_DANMAKU = 40; // Limit DOM nodes for performance

export default function DanmakuOverlay({
  messages,
  enabled,
  tracks = 4,
}: DanmakuOverlayProps) {
  const lanes = useMemo(() => {
    const capped = messages.slice(0, MAX_DANMAKU);
    const result: DanmakuMessage[][] = Array.from({ length: tracks }, () => []);
    capped.forEach((msg, i) => {
      result[i % tracks].push(msg);
    });
    return result;
  }, [messages, tracks]);

  if (!enabled || messages.length === 0) return null;

  return (
    <div className={styles.overlay} aria-hidden="true">
      {lanes.map((lane, trackIdx) => (
        <div key={trackIdx} className={styles.track}>
          {lane.map((msg, msgIdx) => {
            const h = hashCode(msg.id);
            const color = COLORS[h % COLORS.length];
            const duration = 12 + (h % 8); // 12-20s
            const delay = msgIdx * 3 + (h % 3); // stagger

            return (
              <span
                key={msg.id}
                className={styles.item}
                style={
                  {
                    "--dm-duration": `${duration}s`,
                    "--dm-delay": `${delay}s`,
                    "--dm-color": color,
                  } as React.CSSProperties
                }
              >
                {msg.author && (
                  <span className={styles.author}>{msg.author}</span>
                )}
                <span className={styles.content}>{msg.content}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
