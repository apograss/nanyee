export const CHAT_MODEL_OPTIONS = [
  "longcat-flash-chat",
  "grok-4.20-beta",
] as const;

export type ChatModelOption = (typeof CHAT_MODEL_OPTIONS)[number];

export const DEFAULT_CHAT_MODEL: ChatModelOption = "longcat-flash-chat";

export const CHAT_MODEL_LABELS: Record<
  ChatModelOption,
  { label: string; desc: string }
> = {
  "longcat-flash-chat": {
    label: "快速",
    desc: "LongCat Flash Chat",
  },
  "grok-4.20-beta": {
    label: "深度思考",
    desc: "Grok 4.20 Beta",
  },
};
