import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "成绩查询",
  description: "查询南方医科大学教务成绩、GPA 计算与专业排名",
};

export default function GradesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
