"use client";

import { EditorContent, useEditor } from "@tiptap/react";

import Toolbar from "./Toolbar";
import styles from "./WikiEditor.module.css";
import { getWikiEditorOptions } from "./options";

interface WikiEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function WikiEditor({ content, onChange }: WikiEditorProps) {
  const editor = useEditor(
    getWikiEditorOptions({ content, onChange, className: styles.proseMirror }),
  );

  return (
    <div className={styles.editor}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}
