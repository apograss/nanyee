"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import styles from "./WikiEditor.module.css";

interface ToolbarProps {
  editor: Editor | null;
}

export default function Toolbar({ editor }: ToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const btn = (
    label: string,
    action: () => void,
    isActive?: boolean,
    title?: string,
  ) => (
    <button
      type="button"
      className={`${styles.toolBtn} ${isActive ? styles.toolBtnActive : ""}`}
      onClick={action}
      title={title || label}
    >
      {label}
    </button>
  );

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        editor.chain().focus().setImage({ src: data.data.url }).run();
      } else {
        alert(data.error?.message || "图片上传失败");
      }
    } catch {
      alert("图片上传失败，请检查网络");
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
    e.target.value = "";
  };

  const addImage = () => {
    imageInputRef.current?.click();
  };

  const addLink = () => {
    const href = window.prompt("Link URL:");
    if (href) {
      editor.chain().focus().setLink({ href }).run();
    }
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className={styles.toolbar}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleImageSelect}
        hidden
      />
      <div className={styles.toolGroup}>
        {btn("H1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
        {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      </div>
      <div className={styles.toolDivider} />
      <div className={styles.toolGroup}>
        {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), "Bold")}
        {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), "Italic")}
        {btn("U", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"), "Underline")}
        {btn("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"), "Strikethrough")}
        {btn("Hi", () => editor.chain().focus().toggleHighlight().run(), editor.isActive("highlight"), "Highlight")}
      </div>
      <div className={styles.toolDivider} />
      <div className={styles.toolGroup}>
        {btn("UL", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"), "Bullet list")}
        {btn("OL", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"), "Ordered list")}
        {btn("Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"), "Blockquote")}
        {btn("Code", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"), "Code block")}
      </div>
      <div className={styles.toolDivider} />
      <div className={styles.toolGroup}>
        {btn("L", () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }), "Align left")}
        {btn("C", () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }), "Align center")}
        {btn("R", () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }), "Align right")}
      </div>
      <div className={styles.toolDivider} />
      <div className={styles.toolGroup}>
        {btn("Link", addLink, editor.isActive("link"), "Add link")}
        {btn("Img", addImage, false, "Upload image")}
        {btn("Table", addTable, false, "Insert table")}
        {btn("HR", () => editor.chain().focus().setHorizontalRule().run(), false, "Horizontal rule")}
      </div>
    </div>
  );
}
