import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "课表导出",
  description: "一键导出南方医科大学教务课表到 WakeUp 或 ICS 日历格式",
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
