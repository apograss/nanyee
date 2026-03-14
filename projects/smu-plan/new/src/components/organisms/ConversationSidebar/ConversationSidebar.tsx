"use client";

import { useCallback, useEffect, useState } from "react";

import NeoButton from "@/components/atoms/NeoButton";
import type { ChatMessage } from "@/components/organisms/ChatStream";

import styles from "./ConversationSidebar.module.css";

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string, messages: ChatMessage[]) => void;
  onCreateConversation: () => void;
}

export default function ConversationSidebar({
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      const data = await response.json();
      if (data.ok) {
        setConversations(data.data.conversations);
      }
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [activeConversationId, loadConversations]);

  const handleSelect = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      const data = await response.json();
      if (data.ok) {
        onSelectConversation(id, data.data.conversation.messages);
      }
    } catch {
      // Ignore sidebar fetch failures; the chat view stays on the current conversation.
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (data.ok) {
        setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
        if (activeConversationId === id) {
          onCreateConversation();
        }
      }
    } catch {
      // Ignore delete failures in the sidebar UI.
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.title}>对话历史</div>
        <div className={styles.hint}>登录后自动同步最近 20 条对话</div>
        <NeoButton size="sm" variant="secondary" onClick={onCreateConversation}>
          新对话
        </NeoButton>
      </div>

      <div className={styles.list}>
        {conversations.length > 0 ? (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`${styles.item} ${
                conversation.id === activeConversationId ? styles.itemActive : ""
              }`}
              onClick={() => handleSelect(conversation.id)}
            >
              <div className={styles.itemTitle}>{conversation.title}</div>
              <div className={styles.itemMeta}>
                {new Date(conversation.updatedAt).toLocaleString("zh-CN")}
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(conversation.id);
                  }}
                >
                  删除
                </button>
              </div>
            </button>
          ))
        ) : (
          <div className={styles.empty}>还没有保存过对话，开始第一轮提问吧。</div>
        )}
      </div>
    </aside>
  );
}
