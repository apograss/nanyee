"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import DOMPurify from "isomorphic-dompurify";

import styles from "./about.module.css";

const FEATURES = [
  {
    icon: "\uD83D\uDD0D",
    title: "AI 搜索",
    desc: "基于大语言模型的校园智能问答，覆盖转专业、选课、校园网、实习等高频问题，秒级响应。",
    color: "var(--color-brand)",
  },
  {
    icon: "\uD83D\uDCC5",
    title: "课表导出",
    desc: "一键将教务系统课表转换为 WakeUp 课程表 / ICS 日历文件，导入手机即可使用。",
    color: "var(--color-info)",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "成绩查询",
    desc: "GPA 自动计算、专业排名查询、学期趋势分析，支持加权与算术均分双模式。",
    color: "var(--color-success)",
  },
  {
    icon: "\u26A1",
    title: "自动选课",
    desc: "NTP 时间校准 + 毫秒级抢课引擎，ONNX 验证码自动识别，告别手动刷新。",
    color: "var(--color-warning)",
  },
];

const TECH_STACK = [
  { name: "Next.js 15", color: "var(--text-primary)" },
  { name: "TypeScript", color: "var(--color-info)" },
  { name: "SQLite", color: "var(--color-success)" },
  { name: "OpenAI API", color: "var(--color-brand)" },
  { name: "ONNX Runtime", color: "var(--color-warning)" },
];

export default function AboutPageClient() {
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.settings.aboutHtml) {
          setCustomHtml(DOMPurify.sanitize(data.data.settings.aboutHtml));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && customHtml) {
    return (
      <div
        className={styles.page}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(customHtml) }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Nanyee.de</h1>
        <p className={styles.heroSub}>
          AI Agent 驱动的南方医科大学校园工具平台
        </p>
        <span className={styles.heroBadge}>Southern Medical University</span>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>&#x2728;</span>
          核心功能
        </h2>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.featureCard}>
              <div
                className={styles.featureIcon}
                style={{ background: f.color + "18" }}
              >
                {f.icon}
              </div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>&#x2699;</span>
          技术栈
        </h2>
        <div className={styles.techGrid}>
          {TECH_STACK.map((t) => (
            <span key={t.name} className={styles.techBadge}>
              <span
                className={styles.techDot}
                style={{ background: t.color }}
              />
              {t.name}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>&#x1F4AC;</span>
          关于项目
        </h2>
        <div className={styles.infoPanel}>
          <div className={styles.infoRow}>
            <div className={styles.infoBlock}>
              <span className={styles.infoLabel}>项目定位</span>
              <p className={styles.infoValue}>
                Nanyee.de 是面向南方医科大学师生的开源校园工具平台。我们利用
                AI Agent 技术，将分散在教务系统、选课平台、校园论坛中的信息整合为统一的智能服务，
                让每一位南医人都能高效获取所需资源。
              </p>
            </div>

            <hr className={styles.divider} />

            <div className={styles.infoBlock}>
              <span className={styles.infoLabel}>开源协议</span>
              <p className={styles.infoValue}>
                本项目代码以 MIT 协议开源，欢迎贡献代码与反馈建议。
              </p>
            </div>

            <hr className={styles.divider} />

            <div className={styles.infoBlock}>
              <span className={styles.infoLabel}>联系方式</span>
              <p className={styles.infoValue}>
                如有问题或合作意向，请通过{" "}
                <a
                  className={styles.infoLink}
                  href="https://github.com/nanyee"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>{" "}
                联系我们，或在{" "}
                <Link className={styles.infoLink} href="/guestbook">
                  留言板
                </Link>{" "}
                留下你的想法。
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Made with care for SMU students
        </p>
        <Link href="/" className={styles.homeLink}>
          <span className={styles.homeLinkArrow}>&larr;</span>
          返回首页
        </Link>
      </div>
    </div>
  );
}
