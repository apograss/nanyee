import React from "react";
import { Compass } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui.jsx";

export default function Recommendations() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5" data-component="RecommendationsPage">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">内容推荐</div>
        <h1>其它推荐</h1>
        <p className="text-[var(--muted)] text-sm">这里将用于放置其它值得推荐的工具或内容。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Compass className="w-4 h-4" /> 推荐内容</CardTitle>
          <CardDescription>页面和导航入口已经预留。</CardDescription>
        </CardHeader>
        <CardContent>
          <div id="other-recommendations-slot" data-content-slot="other-recommendations" className="rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-[13px] text-[var(--muted)]">
            暂无内容，后续可直接在此添加推荐卡片。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
