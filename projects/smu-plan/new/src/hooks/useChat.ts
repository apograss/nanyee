"use client";

import { useState, useCallback, useEffect, useRef } from "react";

import type { ChatMessage } from "@/components/organisms/ChatStream";
import { useAuth } from "@/hooks/useAuth";
import type { StoredConversationMessage } from "@/lib/conversations";

type ChatStatus = "idle" | "streaming" | "done" | "error";
const ACTIVE_CONVERSATION_STORAGE_KEY = "nanyee_active_conversation_id";

interface UseChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  conversationId: string | null;
  send: (content: string, model?: string, imageBase64?: string | null) => void;
  stop: () => void;
  reset: () => void;
  hydrateConversation: (id: string, messages: ChatMessage[]) => void;
}

function buildConversationPayload(messages: ChatMessage[]): StoredConversationMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    references: message.references,
    toolCards: message.toolCards,
  }));
}

export function useChat(): UseChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const msgIdCounter = useRef(0);

  const nextId = () =>
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++msgIdCounter.current}`;

  const persistConversation = useCallback(
    async (nextMessages: ChatMessage[], currentConversationId: string | null) => {
      if (!user) {
        return currentConversationId;
      }

      const payload = {
        messages: buildConversationPayload(nextMessages),
      };

      if (currentConversationId) {
        await fetch(`/api/conversations/${currentConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});

        return currentConversationId;
      }

      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      const data = await response?.json().catch(() => null);
      const nextConversationId = data?.data?.conversation?.id ?? null;
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }
      return nextConversationId;
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const activeConversationId = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    if (!activeConversationId || messages.length > 0 || conversationId) {
      return;
    }

    fetch(`/api/conversations/${activeConversationId}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          setConversationId(data.data.conversation.id);
          setMessages(data.data.conversation.messages);
          setStatus("done");
        } else {
          localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        }
      })
      .catch(() => {});
  }, [conversationId, messages.length, user]);

  useEffect(() => {
    if (!user) return;

    if (conversationId) {
      localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
    } else {
      localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
  }, [conversationId, user]);

  const send = useCallback(
    async (content: string, model?: string, imageBase64?: string | null) => {
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content,
      };

      let finalAiMessage: ChatMessage = {
        id: nextId(),
        role: "ai",
        content: "",
        references: [],
        toolCards: [],
      };

      const optimisticMessages = [...messages, userMsg, finalAiMessage];
      setMessages(optimisticMessages);
      setStatus("streaming");

      let currentConversationId = conversationId;
      if (user) {
        currentConversationId = await persistConversation(
          [...messages, userMsg],
          conversationId,
        );
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model, imageBase64 }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);

                switch (eventType) {
                  case "delta":
                    finalAiMessage = {
                      ...finalAiMessage,
                      content: finalAiMessage.content + (data.content || ""),
                    };
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = finalAiMessage;
                      return updated;
                    });
                    break;

                  case "tool_card":
                    finalAiMessage = {
                      ...finalAiMessage,
                      toolCards: [...(finalAiMessage.toolCards || []), data],
                    };
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = finalAiMessage;
                      return updated;
                    });
                    break;

                  case "tool_references":
                    finalAiMessage = {
                      ...finalAiMessage,
                      references: [
                        ...(finalAiMessage.references || []),
                        ...(Array.isArray(data) ? data : [data]),
                      ],
                    };
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = finalAiMessage;
                      return updated;
                    });
                    break;

                  case "done":
                    setStatus("done");
                    break;

                  case "error":
                    finalAiMessage = {
                      ...finalAiMessage,
                      content: finalAiMessage.content || `出错了: ${data.message || "未知错误"}`,
                    };
                    setStatus("error");
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = finalAiMessage;
                      return updated;
                    });
                    break;
                }
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }

        if (status !== "error") {
          setStatus("done");
        }

        if (user) {
          await persistConversation(
            [...messages, userMsg, finalAiMessage],
            currentConversationId,
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("done");
          return;
        }

        finalAiMessage = {
          ...finalAiMessage,
          content: `请求失败: ${(err as Error).message}`,
        };
        setStatus("error");
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = finalAiMessage;
          return updated;
        });

        if (user) {
          await persistConversation(
            [...messages, userMsg, finalAiMessage],
            currentConversationId,
          );
        }
      } finally {
        abortRef.current = null;
      }
    },
    [conversationId, messages, persistConversation, status, user],
  );

  const hydrateConversation = useCallback((id: string, nextMessages: ChatMessage[]) => {
    setConversationId(id);
    setMessages(nextMessages);
    setStatus("done");
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("done");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setConversationId(null);
    setStatus("idle");
    localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    msgIdCounter.current = 0;
  }, []);

  return { messages, status, conversationId, send, stop, reset, hydrateConversation };
}
