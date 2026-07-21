// Canvas design runtime editable source marker: home
import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, GraduationCap, BookOpen, ClipboardCheck, Armchair, Users, ArrowRight, Activity } from "lucide-react";
import { Card, CardContent, StatusBadge, Alert } from "@/components/ui.jsx";
import { useAuth } from "@/lib/api.jsx";

const TOOLS = [
  { to: "/tools/timetable", label: "课表查询", desc: "登录学校系统后查看周课表，可导出日历", icon: CalendarDays },
  { to: "/tools/grades", label: "成绩查询", desc: "查看课程成绩、绩点和排名分布", icon: GraduationCap },
  { to: "/tools/enrollment", label: "在线选课", desc: "按优先级排队，到点自动抢课", icon: BookOpen },
  { to: "/tools/evaluations", label: "自动评课", desc: "登录后自动完成全部评课，无需逐题填写", icon: ClipboardCheck },
  { to: "/tools/study-cabin", label: "学习舱预约", desc: "选好舱位，到点自动帮你抢", icon: Armchair },
  { to: "/tools/qun", label: "群报数", desc: "每日打卡自动提交，支持图片上传", icon: Users },
];

const SUMMARY = [
  { state: "running", title: "自动评课进行中", sub: "正在自动评课", id: "job_001" },
  { state: "verification_required", title: "学习舱预约待核验", sub: "需要手动确认", id: "job_002" },
  { state: "succeeded", title: "自动评课已完成 · 18 门", sub: "评课已完成", id: "job_004" },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6" data-component="HomePage" data-od-id="home">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">首页</div>
        <h1 className="text-[clamp(1.75rem,1.3rem+1.5vw,2.25rem)]">你好，{user?.nickname || "同学"}</h1>
        <p className="text-[var(--muted)] text-sm prose-body">课表和成绩用学校账号登录即可查看；选课、评课、学习舱等会到点自动帮你完成。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} data-component="ToolCard" data-od-id={t.to} className="group">
              <Card className="h-full hover:border-[color-mix(in_srgb,var(--seed-primary)_40%,transparent)] hover:shadow-[var(--shadow-md)] transition-all">
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="w-9 h-9 rounded-[var(--radius)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium tracking-[0.01em]">{t.label}</div>
                    <div className="text-[13px] text-[var(--muted)] mt-0.5 leading-[1.5]">{t.desc}</div>
                  </div>
                  <div className="text-[13px] text-[var(--seed-primary-strong)] inline-flex items-center gap-1 mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    进入 <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-component="TaskSummary" data-od-id="task-summary">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium tracking-[0.01em]"><Activity className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 任务摘要</div>
              <Link to="/jobs" className="text-[13px] text-[var(--seed-primary-strong)] underline underline-offset-2">全部</Link>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {SUMMARY.map((s) => (
                <Link to={`/jobs/${s.id}`} key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <StatusBadge status={s.state} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{s.title}</div>
                    <div className="text-[11px] text-[var(--muted)] tracking-[0.01em]">{s.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="text-sm font-medium tracking-[0.01em]">待办提醒</div>
            <Alert variant="warning" title="学习舱预约待核验">
              <span>有一个学习舱预约需要你手动确认结果，请在任务列表中查看详情。</span>
            </Alert>
            <Alert variant="info" title="自动选课运行中">
              <span>选课正在自动进行中，可随时取消。先连续尝试几轮，之后自动轮询直到成功或超时。</span>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
