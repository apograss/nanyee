import ToolGrid from "@/components/organisms/ToolGrid";
import styles from "./page.module.css";

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

export default function ToolsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工具中心</h1>
        <p className={styles.desc}>南医校园实用工具集合</p>
      </div>
      <ToolGrid tools={TOOLS.map((t) => ({ ...t, icon: <span>{t.icon}</span> }))} />
    </div>
  );
}
