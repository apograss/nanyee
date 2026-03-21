"use client";

import { useRef } from "react";
import type { Editor } from "@tiptap/react";

import styles from "./WikiEditor.module.css";

interface ToolbarProps {
  editor: Editor | null;
}

async function readApiPayload(response: Response) {
  const raw = await response.text();

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {
      ok: false,
      error: {
        message: raw.trim() || `请求失败，状态码 ${response.status}`,
      },
    };
  }
}

export default function Toolbar({ editor }: ToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await readApiPayload(response);

      if (response.ok && data.ok) {
        editor.chain().focus().setImage({ src: data.data.url }).run();
        return;
      }

      alert(data.error?.message || "图片上传失败");
    } catch {
      alert("图片上传失败，请检查网络后重试");
    }
  };

  const uploadAttachment = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload/attachment", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await readApiPayload(response);

      if (response.ok && data.ok) {
        const safeName = String(data.data.name || file.name).replace(/[<>]/g, "");
        editor
          .chain()
          .focus()
          .insertContent(
            `<p><a href="${data.data.url}" target="_blank" rel="noopener noreferrer">${safeName}</a></p>`,
          )
          .run();
        return;
      }

      alert(data.error?.message || "附件上传失败");
    } catch {
      alert("附件上传失败，请检查网络后重试");
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
    event.target.value = "";
  };

  const handleAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAttachment(file);
    }
    event.target.value = "";
  };

  const addLink = () => {
    const href = window.prompt("请输入链接 URL：");
    if (href) {
      editor.chain().focus().setLink({ href }).run();
    }
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
      <input
        ref={attachmentInputRef}
        type="file"
        accept=".pdf,.txt,.zip,.docx,.xlsx,.pptx"
        onChange={handleAttachmentSelect}
        hidden
      />

      <div className={styles.toolGroup}>
        {btn("↩", () => editor.chain().focus().undo().run(), false, "撤销")}
        {btn("↪", () => editor.chain().focus().redo().run(), false, "重做")}
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {btn("H1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
        {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), "加粗")}
        {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), "斜体")}
        {btn("U", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"), "下划线")}
        {btn("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"), "删除线")}
        {btn("Hi", () => editor.chain().focus().toggleHighlight().run(), editor.isActive("highlight"), "高亮")}
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {btn("UL", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"), "无序列表")}
        {btn("OL", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"), "有序列表")}
        {btn("Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"), "引用")}
        {btn("Code", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"), "代码块")}
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {btn("L", () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }), "左对齐")}
        {btn("C", () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }), "居中")}
        {btn("R", () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }), "右对齐")}
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {btn("Link", addLink, editor.isActive("link"), "添加链接")}
        {btn("Img", () => imageInputRef.current?.click(), false, "上传图片")}
        {btn("File", () => attachmentInputRef.current?.click(), false, "上传附件")}
        {btn("Table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), editor.isActive("table"), "插入表格")}
        {btn("+Row", () => editor.chain().focus().addRowAfter().run(), false, "新增一行")}
        {btn("-Row", () => editor.chain().focus().deleteRow().run(), false, "删除当前行")}
        {btn("+Col", () => editor.chain().focus().addColumnAfter().run(), false, "新增一列")}
        {btn("-Col", () => editor.chain().focus().deleteColumn().run(), false, "删除当前列")}
        {btn("DelT", () => editor.chain().focus().deleteTable().run(), false, "删除表格")}
        {btn("HR", () => editor.chain().focus().setHorizontalRule().run(), false, "分割线")}
      </div>
    </div>
  );
}
