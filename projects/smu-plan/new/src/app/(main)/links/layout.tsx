import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "链接推荐",
};

export default function LinksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
