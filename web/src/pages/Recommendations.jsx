// Canvas design runtime editable source marker: recommendations
import React from "react";
import { motion } from "motion/react";
import { Compass } from "lucide-react";
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
        <p className="text-[var(--muted)] text-sm prose-body">这里将用于放置其它值得推荐的工具或内容。</p>
      </motion.header>

      {/* ---------- 推荐内容 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker">Curated</div>
            <CardTitle className="flex items-center gap-2"><Compass className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 推荐内容</CardTitle>
            <CardDescription>页面和导航入口已经预留。</CardDescription>
          </CardHeader>
          <CardContent>
            <div id="other-recommendations-slot" data-content-slot="other-recommendations" className="rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-[13px] text-[var(--muted)]">
              暂无内容，后续可直接在此添加推荐卡片。
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
