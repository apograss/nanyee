import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nanyee.de — 课表导出",
  description: "南医大教务课表一键导出到 WakeUp 课程表 / ICS 日历",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
