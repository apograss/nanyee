// Canvas design runtime editable source marker: qun
import React, { useState, useRef } from "react";
import { Users, Upload, Image as ImageIcon, CheckCircle2, AlertTriangle, ArrowRight, KeyRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, Table, cn } from "@/components/ui.jsx";

const FORMS = [
  { form_id: "form_3a91", title: "周报表", version: 4, updated_at: "2026-09-08 08:00" },
  { form_id: "form_2b80", title: "健康打卡", version: 7, updated_at: "2026-09-09 06:00" },
];

const PREVIEW_CATALOGS = [
  { cid: "c_name", label: "姓名", value: "林**", source: "default" },
  { cid: "c_class", label: "班级", value: "临床 2026 级 3 班", source: "custom" },
  { cid: "c_temp", label: "体温", value: "36.5", source: "custom" },
  { cid: "c_photo", label: "现场照片", value: "（已上传图片 URL）", source: "image" },
];

export default function Qun() {
  const [token, setToken] = useState(""); // 敏感态：仅内存，不落库
  const [verified, setVerified] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [imageError, setImageError] = useState(null);
  const fileRef = useRef(null);

  const verify = () => { setVerified(true); }; // POST /qun/token/verify
  const submitPreview = () => { setPreview(PREVIEW_CATALOGS); }; // POST /qun/forms/{form_id}/preview

  const onFile = (f) => {
    if (!f) return;
    const okType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.type);
    if (!okType) { setImageError("仅接受 JPEG/PNG/GIF/WebP，且 MIME 与内容一致"); return; }
    if (f.size > 5 * 1024 * 1024) { setImageError("单张最多 5 MiB"); return; }
    setImageError(null);
    // POST /qun/images multipart: auth_token + file → 返回 URL 填入对应图片字段
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5" data-component="QunPage" data-od-id="qun">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">在线办理</div>
        <h1>群报数</h1>
        <p className="text-[var(--muted)] text-sm prose-body">粘贴登录凭证后即可预览并提交打卡。需要定时自动提交时，可创建定时任务。</p>
      </div>

      <Card>
        <CardHeader><CardTitle>第一步 · 登录校验</CardTitle><CardDescription>凭证仅本次使用，不会保存。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk">群报数登录凭证</Label>
            <Input id="tk" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="请粘贴完整的登录凭证" />
          </div>
          <Button onClick={verify} disabled={!token}><KeyRound className="w-4 h-4" /> 校验凭证</Button>
          {verified && <Alert variant="success" title="凭证有效"><span>可以继续预览和提交了。</span></Alert>}
        </CardContent>
      </Card>

      {verified && (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>第二步 · 表单同步</CardTitle>
              <CardDescription>读取可提交表单列表。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table
              head={["表单", "版本", "更新时间", ""]}
              rows={FORMS.map((f) => [
                <span className="font-medium text-[13px]">{f.title}</span>,
                <Badge variant="muted">v{f.version}</Badge>,
                <span className="text-[13px] text-[var(--muted)]">{f.updated_at}</span>,
                <Button size="sm" variant={selectedForm?.form_id === f.form_id ? "default" : "outline"} onClick={() => { setSelectedForm(f); setPreview(null); }}>选择</Button>,
              ])}
            />
          </CardContent>
        </Card>
      )}

      {selectedForm && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>第三步 · 图片上传</CardTitle>
              <CardDescription>支持单张上传，不超过 5 MB。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="rounded-[var(--radius)] border border-dashed border-border p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[var(--seed-surface-2)]"
                data-component="ImageDrop"
              >
                <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
                <div className="text-[13px] font-medium">点击或拖拽上传</div>
                <div className="text-[11px] text-[var(--muted)]">JPEG / PNG / GIF / WebP · 单张 ≤ 5 MiB</div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
              {imageError && <Alert variant="danger" title="上传被拒绝"><span>{imageError}</span></Alert>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>第四步 · 字段预览回填</CardTitle>
              <CardDescription>核对 catalogs 后可构造预约提交任务。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!preview ? (
                <Button variant="outline" onClick={submitPreview}><ArrowRight className="w-4 h-4" /> 生成预览</Button>
              ) : (
                <>
                  <Table
                    head={["项目", "标签", "回填值", "来源"]}
                    rows={preview.map((c) => [
                      <span className="text-[13px] text-[var(--muted)]">{c.label}</span>,
                      <span className="text-[13px]">{c.label}</span>,
                      <span className="text-[13px] font-medium">{c.value}</span>,
                      c.source === "image" ? <Badge variant="default">图片</Badge> : c.source === "custom" ? <Badge variant="muted">自定义</Badge> : <Badge variant="outline">默认</Badge>,
                    ])}
                  />
                  <Alert variant="warning" title="预约结果未知时禁止自动创建新任务">
                    <span>提交结果未知时不得自动重试，应引导用户先到群报数后台核验表单状态。</span>
                  </Alert>
                  <div className="flex gap-2">
                    <Button>构造 qun_checkin:submit:v1 任务</Button>
                    <span className="text-[13px] text-[var(--muted)] self-center">需先添加群报数授权</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
