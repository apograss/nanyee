// Canvas design runtime editable source marker: qun
import React, { useRef, useState } from "react";
import { Image as ImageIcon, CheckCircle2, ArrowRight, KeyRound, MapPin, Send, Download, ChevronDown, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, Table } from "@/components/ui.jsx";
import AmapLocationPicker from "@/components/AmapLocationPicker.jsx";
import { apiFetch, apiPost, CONFIRMATION_VERSIONS } from "@/lib/api.jsx";

const EMPTY_LOCATION = { lat: "", lng: "", address: "" };

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "（空）";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function Qun() {
  const [token, setToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [preview, setPreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const fileRef = useRef(null);

  const run = async (action) => {
    setLoading(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ variant: "danger", title: "操作失败", text: error?.message || "请求失败，请稍后重试。" });
    } finally {
      setLoading(false);
    }
  };

  const verify = () => run(async () => {
    await apiPost("/qun/token/verify", { auth_token: token });
    const data = await apiPost("/qun/forms", { auth_token: token });
    setVerified(true);
    setForms(data);
    setSelectedForm(null);
    setPreview(null);
    setMessage({ variant: "success", title: "凭证有效", text: `已读取 ${data.length} 个可用表单。` });
  });

  const loadPreview = () => run(async () => {
    const hasCoordinates = location.lat !== "" && location.lng !== "";
    const data = await apiPost(`/qun/forms/${selectedForm.form_id}/preview`, {
      auth_token: token,
      defaults: {
        display_name: displayName,
        default_lat: hasCoordinates ? Number(location.lat) : null,
        default_lng: hasCoordinates ? Number(location.lng) : null,
        default_address: location.address,
      },
      custom_fields: {},
    });
    if (uploadedUrl) {
      data.catalogs = data.catalogs.map((catalog) => (
        catalog.type === "IMAGE" ? { ...catalog, value: [uploadedUrl] } : catalog
      ));
    }
    setPreview(data);
  });

  const onFile = (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage({ variant: "danger", title: "图片不可用", text: "仅支持 JPEG/PNG/GIF/WebP，单张不超过 5 MiB。" });
      return;
    }
    run(async () => {
      const body = new FormData();
      body.append("auth_token", token);
      body.append("file", file);
      const result = await apiFetch("/qun/images", { method: "POST", body });
      setUploadedUrl(result.url);
      setPreview((current) => current ? {
        ...current,
        catalogs: current.catalogs.map((catalog) => (
          catalog.type === "IMAGE" ? { ...catalog, value: [result.url] } : catalog
        )),
      } : current);
      setMessage({ variant: "success", title: "图片已上传", text: "预览中的图片字段会使用这张图片。" });
    });
  };

  const submit = () => run(async () => {
    const result = await apiPost(`/qun/forms/${preview.form_id}/submit`, {
      auth_token: token,
      form_version: preview.version,
      title: preview.title,
      catalogs: preview.catalogs,
      confirmation_version: CONFIRMATION_VERSIONS.qunSubmit,
    });
    setMessage({ variant: "success", title: "提交成功", text: `${result.title || "表单"} 已提交。` });
  });

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5" data-component="QunPage" data-od-id="qun">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">在线办理</div>
        <h1>群报数</h1>
        <p className="text-[var(--muted)] text-sm prose-body">凭证、坐标和预览内容只保留在当前页面内存中，服务器不保存本次凭证明文。</p>
      </div>

      <Card>
        <CardHeader><CardTitle>第一步 · 登录校验</CardTitle><CardDescription>粘贴完整 Authorization Token。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qun-token">群报数登录凭证</Label>
            <Input id="qun-token" type="password" value={token} onChange={(event) => { setToken(event.target.value); setVerified(false); }} placeholder="请粘贴完整的登录凭证" autoComplete="off" />
          </div>
          <div id="qun-cookie-tutorial" data-tutorial-slot="qun-cookie" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setShowTutorial(!showTutorial)} className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--seed-primary-strong)] hover:underline">
                <ChevronDown className={"w-4 h-4 transition-transform" + (showTutorial ? " rotate-180" : "")} />
                Token 获取教程
              </button>
              <a href="/downloads/qun-token-tool-windows.zip" download className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 h-8 text-[13px] font-medium text-[var(--seed-primary-strong)] hover:bg-[var(--seed-surface-2)] transition-colors">
                <Download className="w-3.5 h-3.5" /> 下载工具包
              </a>
            </div>
            {showTutorial && (
              <div className="rounded-[var(--radius)] border border-border p-4 flex flex-col gap-4 text-[13px]">
                <div>
                  <div className="font-medium text-[var(--fg)] mb-1.5">A. 获取群报数 Token（Windows 工具）</div>
                  <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-[var(--muted)]">
                    <li>点击上方"下载工具包"，解压到任意文件夹。</li>
                    <li>安装 Python 3.12 或更高版本（<a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer" className="text-[var(--seed-primary)] underline inline-flex items-center gap-0.5">python.org<ExternalLink className="w-3 h-3" /></a>），安装时务必勾选 <em>Add to PATH</em>。</li>
                    <li>双击 <code className="rounded bg-[var(--seed-surface-2)] px-1 py-0.5 text-[12px] font-mono">setup.bat</code>，它会安装 mitmproxy 并把根证书安装到当前 Windows 用户。</li>
                    <li>安装成功后关闭窗口。完全退出 PC 微信，再重新打开并登录。</li>
                    <li>双击 <code className="rounded bg-[var(--seed-surface-2)] px-1 py-0.5 text-[12px] font-mono">get_token.bat</code>，保持命令窗口开启。</li>
                    <li>在 PC 微信中打开群报数小程序，进入任意一个表单。</li>
                    <li>窗口提示成功后，Token 已复制到剪贴板，回到本页直接粘贴到上方输入框。</li>
                  </ol>
                </div>
                <div>
                  <div className="font-medium text-[var(--fg)] mb-1.5">B. 获取学校教务系统 Cookie（选课页面用）</div>
                  <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-[var(--muted)]">
                    <li>用 Microsoft Edge 打开教务系统首页并登录自己的账号。</li>
                    <li>安装 Cookie-Editor 扩展（Edge 应用商店搜索获取）。</li>
                    <li>点击右上角 Cookie-Editor 图标，在中间列找到 <code className="rounded bg-[var(--seed-surface-2)] px-1 py-0.5 text-[12px] font-mono">JSESSIONID</code>。</li>
                    <li>复制名称和值，到选课页面的 Cookie 输入框粘贴即可。</li>
                  </ol>
                </div>
                <div className="text-[12px] text-[var(--muted)] border-t border-border pt-2.5 flex flex-col gap-1">
                  <div>Token 有效期通常只有 1-2 天，过期后重新运行 get_token.bat 获取即可。</div>
                  <div>工具只读取 qun100.com 的 Authorization 请求头，不记录网页内容；成功或报错后自动恢复系统代理。</div>
                </div>
              </div>
            )}
          </div>
          <Button onClick={verify} loading={loading} disabled={token.trim().length < 60}><KeyRound className="w-4 h-4" /> 校验并读取表单</Button>
        </CardContent>
      </Card>

      {message && <Alert variant={message.variant} title={message.title}><span>{message.text}</span></Alert>}

      {verified && <>
        <Card>
          <CardHeader><CardTitle>第二步 · 默认填写信息</CardTitle><CardDescription>地图选点在浏览器中完成，只把最终坐标用于本次表单。</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div><Label htmlFor="qun-name">名单姓名（可选）</Label><Input id="qun-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="用于有名单限制的姓名字段" /></div>
            <div className="flex items-center gap-2 text-[13px] font-medium"><MapPin className="w-4 h-4" /> 默认打卡位置</div>
            <AmapLocationPicker value={location} onChange={setLocation} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>第三步 · 选择表单</CardTitle><CardDescription>从当前账号的可用表单中选择。</CardDescription></CardHeader>
          <CardContent>
            {forms.length ? <Table
              head={["表单", "版本", "状态", ""]}
              rows={forms.map((form) => [
                <span className="font-medium text-[13px]">{form.title || form.form_id}</span>,
                <Badge variant="muted">v{form.version ?? "--"}</Badge>,
                <span className="text-[13px] text-[var(--muted)]">{String(form.status ?? "可用")}</span>,
                <Button size="sm" variant={selectedForm?.form_id === form.form_id ? "default" : "outline"} onClick={() => { setSelectedForm(form); setPreview(null); }}>选择</Button>,
              ])}
            /> : <div className="text-[13px] text-[var(--muted)]">当前没有可用表单。</div>}
          </CardContent>
        </Card>
      </>}

      {selectedForm && <>
        <Card>
          <CardHeader><CardTitle>第四步 · 图片（可选）</CardTitle><CardDescription>若表单含图片字段，上传后会自动回填。</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div onClick={() => fileRef.current?.click()} className="rounded-[var(--radius)] border border-dashed border-border p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[var(--seed-surface-2)]" data-component="ImageDrop">
              <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
              <div className="text-[13px] font-medium">{uploadedUrl ? "已上传，可点击更换" : "点击上传图片"}</div>
              <div className="text-[11px] text-[var(--muted)]">JPEG / PNG / GIF / WebP · 单张 ≤ 5 MiB</div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>第五步 · 预览并提交</CardTitle><CardDescription>先核对后端按原工具规则生成的 catalogs，再提交。</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!preview ? <Button variant="outline" onClick={loadPreview} loading={loading}><ArrowRight className="w-4 h-4" /> 生成预览</Button> : <>
              <Table
                head={["字段", "类型", "回填值"]}
                rows={preview.catalogs.map((catalog) => [
                  <span className="text-[12px] font-mono">{catalog.cid}</span>,
                  <Badge variant="outline">{catalog.type}</Badge>,
                  <pre className="max-w-md whitespace-pre-wrap break-all text-[12px] font-sans">{displayValue(catalog.value)}</pre>,
                ])}
              />
              <Button onClick={submit} loading={loading}><Send className="w-4 h-4" /> 确认提交</Button>
              <div className="text-[12px] text-[var(--muted)] flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> 提交结果未知时不会自动重复提交。</div>
            </>}
          </CardContent>
        </Card>
      </>}
    </div>
  );
}
