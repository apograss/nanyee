import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "自动选课",
  description: "南方医科大学自动选课工具，时间校准 + 毫秒级抢课",
};

export default function EnrollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
