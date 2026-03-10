import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export const extensions = [
  StarterKit.configure({
    codeBlock: false, // replaced by CodeBlockLowlight
  }),
  CodeBlockLowlight.configure({ lowlight }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  Placeholder.configure({
    placeholder: "开始编辑文章内容...",
  }),
  Highlight,
  Underline,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
];
