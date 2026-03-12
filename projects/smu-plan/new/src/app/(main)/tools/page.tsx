import type { Metadata } from "next";

import ToolGrid from "@/components/organisms/ToolGrid";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "校园工具",
};

const TOOLS = [
  {
    title: "课表导出",
    desc: "将教务系统课表转换为 ICS 日历文件，一键导入手机/电脑日历",
    icon: "📅",
    href: "/tools/schedule",
    tag: "热门",
  },
  {
    title: "成绩查询",
    desc: "查询各学期成绩、GPA、排名等信息",
    icon: "📊",
    href: "/tools/grades",
  },
  {
    title: "自动选课",
    desc: "设定选课目标，系统自动抢课，支持验证码自动识别",
    icon: "🎯",
    href: "/tools/enroll",
    tag: "新",
  },
];

const COMING_SOON = [
  {
    title: "考试倒计时",
    desc: "距离期末、补考和重要节点还有多久，一眼看清。",
    icon: "⏳",
    href: "/tools/countdown",
    tag: "即将推出",
    disabled: true,
  },
  {
    title: "校医院导航",
    desc: "各科室位置、常见办理事项和就诊时间入口。",
    icon: "🏥",
    href: "/links",
    tag: "即将推出",
    disabled: true,
  },
];

export default function ToolsPage() {
  const tools = [...TOOLS, ...COMING_SOON].map((tool) => ({
    ...tool,
    icon: <span>{tool.icon}</span>,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工具中心</h1>
        <p className={styles.desc}>南医校园实用工具集合</p>
      </div>
      <ToolGrid tools={tools} />
    </div>
  );
}
