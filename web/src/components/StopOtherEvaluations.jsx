// 忘了旧平台账号：用这里保存的学校凭据登录学校验证后，停止其他账号上同一学号的自动评课
// 见 docs/adr/0002-school-account-conflict-takeover.md
import React, { useCallback, useEffect, useState } from "react";
import { UserX, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Alert, Dialog, Spinner } from "@/components/ui.jsx";
import { apiGet, stopOtherEvaluations, isCredentialUsable } from "@/lib/api.jsx";
import { recognizeCaptcha, terminateOCR } from "@/lib/captcha-ocr.jsx";

const SCHOOL_ACCOUNT_PURPOSES = ["school", "evaluation", "study_cabin"];
const MAX_AUTO_RETRIES = 3;

export default function StopOtherEvaluations({ credentials }) {
  const credential = credentials.find((c) => SCHOOL_ACCOUNT_PURPOSES.includes(c.purpose) && isCredentialUsable(c));
  const [open, setOpen] = useState(false);
  const [captcha, setCaptcha] = useState(null); // { flow_id, dataUrl }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const loadCaptcha = useCallback(async () => {
    setCaptcha(null);
    setCode("");
    const data = await apiGet("/smu/captcha", { action: "smu_captcha" });
    const dataUrl = `data:${data.content_type};base64,${data.image_base64}`;
    setCaptcha({ flow_id: data.flow_id, dataUrl });
    try {
      const r = await recognizeCaptcha(dataUrl);
      if (r?.text) setCode(r.text);
      return { flow_id: data.flow_id, text: r?.text || "" };
    } catch {
      return { flow_id: data.flow_id, text: "" };
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    setResult(null);
    loadCaptcha().catch((err) => setError(err?.message || "验证码获取失败，请稍后重试。"));
    return () => { terminateOCR(); };
  }, [open, loadCaptcha]);

  // 识别错验证码时自动换一张重试，最多 MAX_AUTO_RETRIES 次
  const submit = async () => {
    setBusy(true);
    setError("");
    let flowId = captcha?.flow_id;
    let text = code;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const data = await stopOtherEvaluations({ credential_id: credential.id, flow_id: flowId, captcha: text });
          setResult(data);
          break;
        } catch (err) {
          const retryable = err?.details?.smu_reason === "bad_captcha" || err?.status === 410;
          if (!retryable || attempt >= MAX_AUTO_RETRIES) throw err;
          const next = await loadCaptcha();
          flowId = next.flow_id;
          text = next.text;
          if (!text) throw err;
        }
      }
    } catch (err) {
      setError(err?.message || "验证失败，请稍后重试。");
    }
    setBusy(false);
  };

  return (
    <>
      <Card data-component="StopOtherEvaluations">
        <CardHeader>
          <div className="kicker"><strong>Old account</strong> — 旧账号</div>
          <CardTitle className="flex items-center gap-2"><UserX className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 忘了旧账号，停不掉之前的自动评课？</CardTitle>
          <CardDescription>
            如果你以前用别的平台账号开过自动评课、现在登不上了，可以在这里用当前保存的学号密码登录学校验证一次。
            验证通过后，其他平台账号上用这个学号的自动评课会被停止，那边保存的学校密码也会被撤销。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credential ? (
            <Button variant="outline" onClick={() => setOpen(true)}>验证学号并停止</Button>
          ) : (
            <div className="text-[13px] text-[var(--muted)]">先在上面添加一条「学校统一认证」授权，才能用这个功能。</div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="验证学号并停止其他账号的自动评课"
        description={`将用这里保存的学号${credential?.metadata?.account_hint ? `（${credential.metadata.account_hint}）` : ""}和密码登录一次学校。`}
        footer={result ? (
          <Button onClick={() => setOpen(false)}>完成</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={submit} loading={busy} disabled={!captcha || !code}>验证并停止</Button>
          </>
        )}
      >
        {result ? (
          <Alert variant="success" title={result.stopped_jobs > 0 ? `已停止 ${result.stopped_jobs} 个自动评课任务` : "没有需要停止的任务"}>
            <span>
              {result.stopped_jobs > 0
                ? "其他平台账号上用这个学号的自动评课已经停止，那边保存的学校密码也已撤销。"
                : "没有发现其他平台账号在用这个学号自动评课。"}
            </span>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="claim-captcha">学校验证码（已自动识别，可修改）</Label>
              <div className="flex items-center gap-3">
                {captcha ? (
                  <img src={captcha.dataUrl} alt="学校验证码" className="h-10 rounded-[var(--radius-sm)] border border-border" />
                ) : (
                  <div className="h-10 w-24 flex items-center justify-center"><Spinner /></div>
                )}
                <Button size="sm" variant="ghost" onClick={() => loadCaptcha().catch(() => {})} aria-label="换一张"><RefreshCw className="w-3.5 h-3.5" /></Button>
                <Input id="claim-captcha" value={code} onChange={(e) => setCode(e.target.value.trim())} className="max-w-[8rem]" />
              </div>
            </div>
            {error && <Alert variant="danger" title="没有完成"><span>{error}</span></Alert>}
          </div>
        )}
      </Dialog>
    </>
  );
}
