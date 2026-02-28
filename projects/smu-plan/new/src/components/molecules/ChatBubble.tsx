"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ChatBubble.module.css";

interface ChatBubbleProps {
  role: "user" | "ai";
  content: string;
  isStreaming?: boolean;
}

export default function ChatBubble({
  role,
  content,
  isStreaming = false,
}: ChatBubbleProps) {
  return (
    <div className={`${styles.bubble} ${styles[role]}`}>
      <div className={styles.avatar}>
        {role === "user" ? "U" : "AI"}
      </div>
      <div className={styles.content}>
        {role === "ai" ? (
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          content
        )}
        {isStreaming && <span className={styles.cursor} />}
      </div>
    </div>
  );
}
