// Canvas design runtime editable source marker: grades
import React, { useState } from "react";
import { GraduationCap, ShieldCheck, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Table, Alert, Badge, cn } from "@/components/ui.jsx";
import { apiPost, mockGrades } from "@/lib/api.jsx";

function RankBadge({ ranking }) {
  if (!ranking) return <span className="text-[var(--muted)] text-[13px]">—</span>;
  const { class_rank, class_total, course_rank, course_total, distribution } = ranking;
  const dist = distribution || {};
  const segments = [
    { v: dist.gte90 || 0, color: "var(--seed-primary)", label: "≥90" },
    { v: dist.s80to90 || 0, color: "color-mix(in srgb, var(--seed-primary) 70%, var(--seed-bg))", label: "80-89" },
    { v: dist.s70to80 || 0, color: "var(--seed-success)", label: "70-79" },
    { v: dist.s60to70 || 0, color: "color-mix(in srgb, var(--seed-warning) 60%, var(--seed-bg))", label: "60-69" },
    { v: dist.lt60 || 0, color: "var(--danger)", label: "<60" },
  ];
  const total = segments.reduce((a, b) => a + b.v, 0) || 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2 text-[11px]">
        <span className="text-[var(--seed-primary-strong)] font-medium">班级 {class_rank}/{class_total}</span>
        <span className="text-[var(--muted)]">课程 {course_rank}/{course_total}</span>
      </div>
      {total > 1 && (
        <div className="flex h-1.5 w-[120px] rounded-[var(--radius-full)] overflow-hidden" data-component="DistributionBar">
          {segments.map((s, i) => s.v > 0 && (
            <div key={i} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.v}人`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Grades() {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState(null);

  const login = async () => {
    setLoading(true);
    try {
      const sess = await apiPost("/smu/session", { flow_id: "flow_demo", account, password, captcha: captchaCode }, {
        mock: { academic_session_id: "as_demo_001", expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() },
      });
      setSession(sess);
      setPassword(""); setCaptchaCode("");
      const data = await apiPost("/smu/grades", { academic_session_id: sess.academic_session_id }, { mock: mockGrades });
      setGrades(data);
    } catch {}
    setLoading(false);
  };

  const s = grades?.summary;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5" data-component="GradesPage" data-od-id="grades">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">学校工具</div>
        <h1>成绩查询</h1>
        <p className="text-[var(--muted)] text-sm">成绩不会保存在服务器，查询结果包含班级和课程排名。</p>
      </div>

      {!session ? (
        <Card>
          <CardHeader>
            <CardTitle>学校系统登录</CardTitle>
            <CardDescription>验证码仅用一次，学校密码只用于本次登录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label>学号</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>学校密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="仅本次请求" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>验证码</Label>
                <Input value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value)} placeholder="图中字符" />
              </div>
            </div>
            <div className="mt-3"><Button onClick={login} loading={loading} disabled={!account || !password}>登录并查询</Button></div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="success" title="登录成功">
            <span>5 分钟内可查询，过期后需重新登录。</span>
          </Alert>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: "总学分", v: s?.total_credits?.toFixed(1) || "—", s: `${s?.total_courses || 0} 门` },
              { k: "加权绩点", v: s?.weighted_gpa?.toFixed(2) || "—", s: `必修 ${s?.required_gpa?.toFixed(2) || "—"}` },
              { k: "加权均分", v: s?.average_score?.toFixed(1) || "—", s: `必修 ${s?.required_average_score?.toFixed(1) || "—"}` },
              { k: "挂科数", v: String(s?.failed_count || 0), s: s?.failed_count === 0 ? "全部通过" : "需关注" },
            ].map((m) => (
              <Card key={m.k} data-component="GradeStat" data-od-id={`stat-${m.k}`}>
                <CardContent className="p-4">
                  <div className="text-[11px] tracking-[0.08em] uppercase text-[var(--muted)]">{m.k}</div>
                  <div className="font-display text-[1.75rem] tracking-[-0.02em] text-foreground mt-1 tabular-nums">{m.v}</div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">{m.s}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>成绩明细</CardTitle>
                <CardDescription>排名包含班级和课程范围，分布为各分段人数。</CardDescription>
              </div>
              <Badge variant="muted" className="gap-1"><BarChart3 className="w-3 h-3" /> 含排名分布</Badge>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto rounded-[var(--radius)] border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--seed-surface-2)]">
                    <tr>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">课程</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">学期</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">学分</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">成绩</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">绩点</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">排名与分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grades?.grades || []).map((g, i) => (
                      <tr key={i} className="border-t border-border hover:bg-[var(--seed-surface-2)]">
                        <td className="px-4 py-3"><span className="font-medium text-[13px]">{g.name}</span></td>
                        <td className="px-4 py-3 text-[13px] text-[var(--muted)]">{g.semester || "—"}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums">{g.credits}</td>
                        <td className="px-4 py-3 text-[13px] font-medium tabular-nums">{g.raw_score}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums">{g.grade_point?.toFixed(1)}</td>
                        <td className="px-4 py-3"><RankBadge ranking={g.ranking} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Alert variant="info" title="默认不保存">
            <span>成绩不会保存在服务器，关闭页面后需重新登录查询。为保护隐私，成绩信息不存储、不上报。</span>
          </Alert>
        </>
      )}
    </div>
  );
}
