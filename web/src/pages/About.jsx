// Canvas design runtime editable source marker: about
import React from "react";
import { motion } from "motion/react";
import { Info } from "lucide-react";
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
            <p className="text-[var(--muted)] text-sm prose-body mt-1">站点的一些说明。</p>
          </div>
        </div>
      </motion.header>

      {/* ---------- 说明 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker">Notes</div>
            <CardTitle className="flex items-center gap-2"><Info className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 一些说明</CardTitle>
            <CardDescription>联系方式、源码和访问相关。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              {[
                <>
                  如有任何问题或者建议，欢迎发邮件到
                  <a href="mailto:contact@nanyee.de">contact@nanyee.de</a>
                  ，期待大家的反馈qwq
                </>,
                <>
                  代码用 MIT 协议开源，全都放在
                  <a href="https://github.com/apograss/nanyee" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                  ，欢迎直接提 issue 乃至 pull request。
                </>,
                <>
                  网站部署在 Cloudflare 上，国内访问会比较慢，可以的话尽量开加速器，或是访问优选域名
                  <a href="https://www.nanyee.de" target="_blank" rel="noreferrer">
                    www.nanyee.de
                  </a>
                  （非联通可显著提升速度）。
                </>,
                <>遇到任何问题，先问问你的 AI 或者自己认真想想 :)</>,
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
