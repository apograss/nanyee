import Link from "next/link";
import styles from "./links.module.css";

/* ── Metadata ── */
export const metadata = {
  title: "链接推荐",
  description: "南方医科大学常用链接和资源推荐",
};

/* ── Types ── */
interface LinkItem {
  title: string;
  url: string;
  desc?: string;
  internal?: boolean;
}

interface LinkCategory {
  name: string;
  icon: string;
  links: LinkItem[];
}

/* ── Data ── */
const CATEGORIES: LinkCategory[] = [
  {
    name: "教务系统",
    icon: "🎓",
    links: [
      {
        title: "教务管理系统",
        url: "https://jw.smu.edu.cn",
        desc: "选课、课表查看、考试安排等教务功能",
      },
      {
        title: "统一身份认证",
        url: "https://cas.smu.edu.cn",
        desc: "校园各系统统一登录入口",
      },
      {
        title: "成绩查询系统",
        url: "/tools/grades",
        desc: "查询各学期成绩、GPA 和排名信息",
        internal: true,
      },
    ],
  },
  {
    name: "学习资源",
    icon: "📚",
    links: [
      {
        title: "图书馆",
        url: "https://lib.smu.edu.cn",
        desc: "馆藏检索、电子资源、座位预约",
      },
      {
        title: "网络教学平台",
        url: "https://mooc.smu.edu.cn",
        desc: "在线课程、教学视频与课件资源",
      },
      {
        title: "学术搜索 (Google Scholar)",
        url: "https://scholar.google.com",
        desc: "学术论文、引用与文献检索",
      },
    ],
  },
  {
    name: "校园生活",
    icon: "🏫",
    links: [
      {
        title: "校园信息门户",
        url: "https://my.smu.edu.cn",
        desc: "通知公告、个人信息、校园服务一站式入口",
      },
      {
        title: "后勤服务",
        url: "https://hq.smu.edu.cn",
        desc: "报修、缴费、宿舍与餐饮服务",
      },
      {
        title: "校园网自助",
        url: "https://self.smu.edu.cn",
        desc: "网络账号管理、流量查询与充值",
      },
    ],
  },
  {
    name: "实用工具",
    icon: "🛠️",
    links: [
      {
        title: "课表导出",
        url: "/tools/schedule",
        desc: "将教务系统课表导出为 ICS 日历文件",
        internal: true,
      },
      {
        title: "自动选课",
        url: "/tools/enroll",
        desc: "设定选课目标，自动抢课并识别验证码",
        internal: true,
      },
      {
        title: "AI 问答",
        url: "/",
        desc: "南医 AI 助手，校园问题一问即答",
        internal: true,
      },
    ],
  },
];

/* ── External-link arrow icon (inline SVG) ── */
function ExternalArrow() {
  return (
    <svg
      className={styles.externalIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h7v7" />
      <path d="M13 3 6 10" />
    </svg>
  );
}

/* ── Link Card ── */
function LinkCard({ item }: { item: LinkItem }) {
  const inner = (
    <>
      <span className={styles.cardTop}>
        <span className={styles.cardTitle}>{item.title}</span>
        {item.internal ? (
          <span className={styles.badge}>站内</span>
        ) : (
          <ExternalArrow />
        )}
      </span>
      {item.desc && <span className={styles.cardDesc}>{item.desc}</span>}
      <span className={styles.cardUrl}>
        {item.internal ? item.url : new URL(item.url).hostname}
      </span>
    </>
  );

  if (item.internal) {
    return (
      <Link href={item.url} className={styles.card}>
        {inner}
      </Link>
    );
  }

  return (
    <a
      href={item.url}
      className={styles.card}
      target="_blank"
      rel="noopener noreferrer"
    >
      {inner}
    </a>
  );
}

/* ── Page ── */
export default function LinksPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>链接推荐</h1>
        <p className={styles.desc}>南方医科大学常用链接和资源推荐</p>
      </div>

      {CATEGORIES.map((cat) => (
        <section key={cat.name} className={styles.category}>
          <div className={styles.categoryHeader}>
            <span className={styles.categoryIcon}>{cat.icon}</span>
            <h2 className={styles.categoryTitle}>{cat.name}</h2>
          </div>

          <div className={styles.grid}>
            {cat.links.map((item) => (
              <LinkCard key={item.url} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
