import type { Metadata } from "next";

import ToolGrid from "@/components/organisms/ToolGrid";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "校园工具",
};

const TOOLS = [
  {
    title: "课表导出",
    desc: "将教务系统课表转换为 ICS 日历文件，一键导入手机或电脑日历。",
    icon: "📅",
    href: "/tools/schedule",
    tag: "热门",
  },
  {
    title: "成绩查询",
    desc: "查询各学期成绩、GPA、排名等信息。",
    icon: "📊",
    href: "/tools/grades",
  },
  {
    title: "自动选课",
    desc: "设定选课目标，系统自动抢课，并支持验证码自动识别。",
    icon: "🎯",
    href: "/tools/enroll",
    tag: "新",
  },
  {
    title: "自动评课",
    desc: "自动完成教务系统课程评价，可由服务器每天定时执行。",
    icon: "📝",
    href: "/tools/evaluation",
    tag: "新",
  },
] as const;

export default function ToolsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工具中心</h1>
        <p className={styles.desc}>当前开放的校园工具入口都集中在这里。</p>
      </div>
      <ToolGrid tools={TOOLS.map((tool) => ({ ...tool, icon: <span>{tool.icon}</span> }))} />
    </div>
  );
}
