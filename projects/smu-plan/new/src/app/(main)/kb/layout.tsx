import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "知识库",
  description: "南方医科大学校园知识库 — 校规、指南、经验分享",
};

export default function KBLayout({ children }: { children: React.ReactNode }) {
  return children;
}
