export interface StoredConversationMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  references?: { title: string; source: string; url?: string }[];
  toolCards?: { title: string; desc: string; icon: string; href: string }[];
}

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
