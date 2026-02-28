import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "校园工具",
  description: "南方医科大学校园工具集 — 课表导出、成绩查询、自动选课",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
