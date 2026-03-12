"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { injectSourceFootnotes } from "@/lib/ai/source-footnotes";
import styles from "./ChatBubble.module.css";

interface ChatBubbleProps {
  role: "user" | "ai";
  content: string;
  references?: { title: string; source: string; url?: string }[];
  isStreaming?: boolean;
}

export default function ChatBubble({
  role,
  content,
  references,
  isStreaming = false,
}: ChatBubbleProps) {
  const renderedContent =
    role === "ai" ? injectSourceFootnotes(content, references) : content;

  return (
    <div className={`${styles.bubble} ${styles[role]}`}>
      <div className={styles.avatar}>
        {role === "user" ? "U" : "AI"}
      </div>
      <div className={styles.content}>
        {role === "ai" ? (
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {renderedContent}
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
