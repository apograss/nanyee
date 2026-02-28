"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "@/components/organisms/ChatStream";

type ChatStatus = "idle" | "streaming" | "done" | "error";

interface UseChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  send: (content: string, model?: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const msgIdCounter = useRef(0);

  const nextId = () => String(++msgIdCounter.current);

  const send = useCallback(
    async (content: string, model?: string) => {
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content,
      };

      const aiMsg: ChatMessage = {
        id: nextId(),
        role: "ai",
        content: "",
        references: [],
        toolCards: [],
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setStatus("streaming");

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        // Build history (exclude current aiMsg which is empty)
        const history = [...messages, userMsg].map((m) => ({
          role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model }),
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

          // Parse SSE events
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
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "ai") {
                        updated[updated.length - 1] = {
                          ...last,
                          content: last.content + (data.content || ""),
                        };
                      }
                      return updated;
                    });
                    break;

                  case "tool_card":
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "ai") {
                        updated[updated.length - 1] = {
                          ...last,
                          toolCards: [...(last.toolCards || []), data],
                        };
                      }
                      return updated;
                    });
                    break;

                  case "done":
                    setStatus("done");
                    break;

                  case "error":
                    setStatus("error");
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "ai") {
                        updated[updated.length - 1] = {
                          ...last,
                          content:
                            last.content || `出错了: ${data.message || "未知错误"}`,
                        };
                      }
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
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("done");
          return;
        }
        setStatus("error");
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "ai") {
            updated[updated.length - 1] = {
              ...last,
              content: `请求失败: ${(err as Error).message}`,
            };
          }
          return updated;
        });
      } finally {
        abortRef.current = null;
      }
    },
    [messages, status]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("done");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setStatus("idle");
    msgIdCounter.current = 0;
  }, []);

  return { messages, status, send, stop, reset };
}
