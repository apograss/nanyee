import React, { useEffect, useState } from "react";
import { Download as DownloadIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui.jsx";

export default function Download() {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/downloads/android/version.json", { cache: "no-cache", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        const url = new URL(data.url);
        if (url.protocol !== "https:" || url.hostname !== "nanyee.de" || url.username || url.password || (url.port && url.port !== "443") || !data.versionName || !/^[a-f0-9]{64}$/i.test(data.sha256)) throw new Error();
        setRelease(data);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6" data-component="DownloadPage">
      <h1 className="display-lede">下载</h1>
      <Card>
        <CardHeader><CardTitle>Nanyee Android</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loading ? <span className="text-sm text-[var(--muted)]">加载中…</span> : !release ? <span>暂未发布</span> : <>
            <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
              <span>v{release.versionName}</span>
              {Number(release.size) > 0 && <span>{(Number(release.size) / 1024 / 1024).toFixed(1)} MB</span>}
              {release.publishedAt && !Number.isNaN(Date.parse(release.publishedAt)) && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString("zh-CN")}</time>}
            </div>
            {typeof release.notes === "string" && release.notes && <div className="whitespace-pre-wrap text-sm">{release.notes}</div>}
            <a href={release.url} className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--seed-primary)] text-white px-6 py-3 font-medium self-start no-underline"><DownloadIcon size={20} />下载 APK</a>
            <div className="text-[11px] text-[var(--muted)] font-mono break-all">SHA-256 · {release.sha256}</div>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
