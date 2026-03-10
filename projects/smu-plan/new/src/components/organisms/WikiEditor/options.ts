import type { EditorOptions } from "@tiptap/react";

import { extensions } from "./extensions";

interface GetWikiEditorOptionsInput {
  content: string;
  onChange: (html: string) => void;
  className?: string;
}

export interface WikiEditorOptions extends Partial<EditorOptions> {
  immediatelyRender: false;
}

export function getWikiEditorOptions({
  content,
  onChange,
  className,
}: GetWikiEditorOptionsInput): WikiEditorOptions {
  return {
    extensions,
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: className || "",
      },
    },
  };
}
