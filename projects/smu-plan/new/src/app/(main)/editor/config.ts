export const KB_EDITOR_MODES = [
  { id: "edit", label: "编辑" },
  { id: "preview", label: "预览" },
] as const;

export type KbEditorMode = (typeof KB_EDITOR_MODES)[number]["id"];
