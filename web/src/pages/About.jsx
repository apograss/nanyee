// Canvas design runtime editable source marker: about
import React from "react";
import { motion } from "motion/react";
import { Gift, Info, ArrowUpRight } from "lucide-react";
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

export default function About() {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto flex flex-col gap-8"
      data-component="AboutPage"
    >
      {/* ---------- 编辑风页面头（品牌区：与 favicon 同一图形） ---------- */}
      <motion.header variants={fadeUp} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>About</strong> — 关于本站</span>
          <span className="rule-line flex-1" />
        </div>
        <div className="flex items-center gap-5">
          <svg
            viewBox="0 0 64 64"
            className="w-16 h-16 shrink-0"
            fill="none"
            stroke="var(--seed-primary)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <g transform="translate(7 7) scale(2.0833)">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M12 8v4M10 10h4" />
            </g>
          </svg>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="display-lede">南医工具台</h1>
            <div className="text-[12px] tracking-[0.14em] text-[var(--muted)] uppercase">Nanyee Toolkit · nanyee.de</div>
            <p className="text-[var(--muted)] text-sm prose-body mt-1">关于这个站点，以及站主的一点私货。</p>
          </div>
        </div>
      </motion.header>

      {/* ---------- 私货 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker">Personal</div>
            <CardTitle className="flex items-center gap-2"><Gift className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 一些私货</CardTitle>
            <CardDescription>站主的个人站点，点击直达（新标签页打开）。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              {GOODIES.map((l) => (
                <a
                  key={l.url}
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
                    <span className="text-[13px] text-[var(--muted)]">{l.note}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                    <span className="hidden md:inline truncate max-w-[220px]">{l.site}</span>
                    <ArrowUpRight className="index-arrow w-[18px] h-[18px]" />
                  </span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- 说明 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker">Notes</div>
            <CardTitle className="flex items-center gap-2"><Info className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 一些说明</CardTitle>
            <CardDescription>联系、协议与使用提示。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              {[
                <>
                  有问题、有想法，或者哪里用不顺手，都欢迎写信到{" "}
                  <a href="mailto:contact@nanyee.de">contact@nanyee.de</a>
                  。这个站需要你的反馈才能继续变好。
                </>,
                <>
                  本站代码以 MIT 协议全部开源，仓库在{" "}
                  <a href="https://github.com/apograss/nanyee" target="_blank" rel="noreferrer">
                    github.com/apograss/nanyee
                  </a>
                  ，欢迎围观、捉虫、添砖加瓦。
                </>,
                <>
                  站点架在 Cloudflare 边缘节点上，没有针对大陆优化线路；觉得慢的话，开个加速器会顺畅不少。
                </>,
                <>
                  遇到不会的操作或者打不开的内容，先问问 AI（比如
                  <a href="https://www.doubao.com/" target="_blank" rel="noreferrer">
                    豆包
                  </a>
                  ）——99% 的问题都能这样解决。
                </>,
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 py-3.5 px-2 sm:px-3 border-b border-border last:border-b-0 text-[14px] leading-[1.7]"
                >
                  <span aria-hidden="true" className="mt-[0.55em] w-1.5 h-1.5 rounded-full bg-[var(--seed-primary)] shrink-0" />
                  <span className="min-w-0">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
