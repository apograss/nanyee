import type { ChatMessage } from "@/components/organisms/ChatStream";

type ReferenceItem = NonNullable<ChatMessage["references"]>[number];

export function injectSourceFootnotes(
  content: string,
  references?: ReferenceItem[],
): string {
  if (!references || references.length === 0) {
    return content;
  }

  const hasExplicitFootnotes = references.some((_, index) =>
    content.includes(`[${index + 1}]`),
  );

  if (hasExplicitFootnotes) {
    return content;
  }

  const markers = references.map((_, index) => `[${index + 1}]`).join("");
  return `${content}\n\n来源 ${markers}`;
}
