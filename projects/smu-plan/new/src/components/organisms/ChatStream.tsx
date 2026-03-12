"use client";

import { useRef, useEffect } from "react";
import ChatBubble from "@/components/molecules/ChatBubble";
import SourceCard from "@/components/molecules/SourceCard";
import ToolCard from "@/components/molecules/ToolCard";
import styles from "./ChatStream.module.css";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  references?: { title: string; source: string; url?: string }[];
  toolCards?: { title: string; desc: string; icon: string; href: string }[];
}

interface ChatStreamProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onStop?: () => void;
}

export default function ChatStream({ messages, isLoading, onStop }: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip scroll on the very first render — ChatStream mounts after
    // the user sends their first message and we don't want to jump.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className={styles.stream}>
      {messages.map((msg, i) => (
        <div key={msg.id} className={styles.messageBlock}>
          <ChatBubble
            role={msg.role}
            content={msg.content}
            references={msg.references}
            isStreaming={isLoading && i === messages.length - 1 && msg.role === "ai"}
          />

          {/* References */}
          {msg.references && msg.references.length > 0 && (
            <div className={styles.refs}>
              {msg.references.map((ref, ri) => (
                <SourceCard key={ri} index={ri + 1} {...ref} />
              ))}
            </div>
          )}

          {/* Tool cards */}
          {msg.toolCards && msg.toolCards.length > 0 && (
            <div className={styles.tools}>
              {msg.toolCards.map((tool, ti) => (
                <ToolCard
                  key={ti}
                  title={tool.title}
                  desc={tool.desc}
                  icon={<span>{tool.icon}</span>}
                  href={tool.href}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {isLoading && messages.length === 0 && (
        <div className={styles.loading}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      )}

      {isLoading && onStop && (
        <div className={styles.stopRow}>
          <button className={styles.stopBtn} onClick={onStop}>
            停止生成
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
