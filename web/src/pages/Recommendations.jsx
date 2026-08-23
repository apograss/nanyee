// Canvas design runtime editable source marker: recommendations
import React from "react";
import { motion } from "motion/react";
import { Compass, Newspaper, Gift, ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui.jsx";

const EASE = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// 仙人指路 —— 校友自用的外部工具与脚本（新标签页打开）
const LINKS = [
  {
    title: "慧生活798app的去广告版本",
    site: "github.com/nocookies111/life-798",
    url: "https://github.com/nocookies111/life-798",
    icon: "/link-icons/life-798.svg",
  },
  {
    title: "ocs网课助手",
    note: "可解决智慧树与学习通",
    site: "docs.ocsjs.com",
    url: "https://docs.ocsjs.com/",
    icon: "/link-icons/ocs.png",
  },
  {
    title: "雨课堂刷课助手",
    note: "原作者不更新，我自己改了点，起码自用没问题",
    site: "greasyfork.org",
    url: "https://greasyfork.org/zh-CN/scripts/590400-雨课堂刷课助手new",
    icon: "/link-icons/yuketang.png",
  },
  {
    title: "一个蛮活跃的学长",
    note: "我的很多脚本只是基于他的二开",
    site: "github.com/rep1ace",
    url: "https://github.com/rep1ace",
    icon: "/link-icons/rep1ace.png",
  },
];

// 同好站点 —— 南医人做的站点与博客（新标签页打开）
const COMMUNITY = [
  {
    title: "SMU 生祠",
    note: "收录 140 个南医学生公众号与资料的索引站",
    site: "smuer.cn",
    url: "https://smuer.cn/",
    icon: "/link-icons/smuer.png",
  },
  {
    title: "david03 的博客",
    note: "生祠站长的个人博客，医学、代码与碎碎念",
    site: "david03.top",
    url: "https://david03.top/",
    icon: "/link-icons/david03.png",
  },
];

// 一些私货 —— 站主的个人站点（原关于页私货，新标签页打开）
const GOODIES = [
  {
    title: "看看我的主页！",
    note: "你也可以在这里找到我的联系方式并一直视奸我。（本站支持iframe设置为主页~）",
    site: "apograss.cn",
    url: "https://apograss.cn/",
    icon: "/link-icons/apograss.png",
  },
  {
    title: "看看我的博客！",
    note: "你也可以从主页那边跳转的。",
    site: "blog.apograss.cn",
    url: "https://blog.apograss.cn/",
    icon: "/link-icons/blog-apograss.svg",
  },
];

function LinkRow({ l }) {
  return (
    <a
      href={l.url}
      target="_blank"
      rel="noreferrer"
      className="index-row group grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-6 py-4 px-2 sm:px-3 border-b border-border last:border-b-0 no-underline"
    >
      <img
        src={l.icon}
        alt=""
        loading="lazy"
        className="w-8 h-8 rounded-[8px] border border-border bg-white object-contain p-[3px]"
      />
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
        <span className="font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-foreground">{l.title}</span>
        {l.note && <span className="text-[13px] text-[var(--muted)]">{l.note}</span>}
      </span>
      <span className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
        <span className="hidden md:inline truncate max-w-[220px]">{l.site}</span>
        <ArrowUpRight className="index-arrow w-[18px] h-[18px]" />
      </span>
    </a>
  );
}

function LinkCard({ kicker, icon: Icon, title, description, items }) {
  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardHeader>
          <div className="kicker">{kicker}</div>
          <CardTitle className="flex items-center gap-2"><Icon className="w-4 h-4 text-[var(--seed-primary-strong)]" /> {title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {items.map((l) => (
              <LinkRow key={l.url} l={l} />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Recommendations() {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto flex flex-col gap-8"
      data-component="RecommendationsPage"
    >
      {/* ---------- 编辑风页面头 ---------- */}
      <motion.header variants={fadeUp} className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>Recommendations</strong> — 内容推荐</span>
          <span className="rule-line flex-1" />
        </div>
        <h1 className="display-lede">其它推荐</h1>
        <p className="text-[var(--muted)] text-sm prose-body">其它值得推荐的站点与内容。</p>
      </motion.header>

      {/* ---------- 仙人指路 ---------- */}
      <LinkCard
        kicker="Curated"
        icon={Compass}
        title="仙人指路"
        description="外部工具与脚本，点击直达（新标签页打开）。"
        items={LINKS}
      />

      {/* ---------- 同好站点 ---------- */}
      <LinkCard
        kicker="Community"
        icon={Newspaper}
        title="同好站点"
        description="南医人做的站点与博客，点击直达（新标签页打开）。"
        items={COMMUNITY}
      />

      {/* ---------- 一些私货（从关于页挪来） ---------- */}
      <LinkCard
        kicker="Personal"
        icon={Gift}
        title="一些私货"
        description="站主的个人站点，点击直达（新标签页打开）。"
        items={GOODIES}
      />
    </motion.div>
  );
}
