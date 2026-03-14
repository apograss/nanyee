import { z } from "zod";

export interface StoredConversationMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  references?: { title: string; source: string; url?: string }[];
  toolCards?: { title: string; desc: string; icon: string; href: string }[];
}

/* ── Shared Zod schemas for conversation message validation ── */

export const referenceSchema = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().optional(),
});

export const toolCardSchema = z.object({
  title: z.string(),
  desc: z.string(),
  icon: z.string(),
  href: z.string(),
});

export const conversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "ai"]),
  content: z.string(),
  references: z.array(referenceSchema).optional(),
  toolCards: z.array(toolCardSchema).optional(),
});

export function deriveConversationTitle(messages: StoredConversationMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
  return firstUserMessage.trim().slice(0, 30) || "新的对话";
}

export function parseConversationMessages(messagesJson: string): StoredConversationMessage[] {
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
