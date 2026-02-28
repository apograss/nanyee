import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "留言板",
  description: "Nanyee.de 社区留言板 — 分享校园经验和建议",
};

export default function GuestbookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
