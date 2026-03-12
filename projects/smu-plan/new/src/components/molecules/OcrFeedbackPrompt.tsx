"use client";

import { useState } from "react";

import styles from "./OcrFeedbackPrompt.module.css";

interface OcrFeedbackPromptProps {
  imageBase64: string;
  correctedText: string;
  sourcePage: string;
  ocrText?: string;
}

export default function OcrFeedbackPrompt({
  imageBase64,
  correctedText,
  sourcePage,
  ocrText,
}: OcrFeedbackPromptProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const canSubmit = Boolean(
    imageBase64 &&
      correctedText.trim() &&
      correctedText.trim().length <= 16 &&
      status !== "saving" &&
      status !== "done",
  );

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch("/api/ocr/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePage,
          imageBase64,
          correctedText: correctedText.trim(),
          ocrText,
        }),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        setStatus("done");
        return;
      }
    } catch {}

    setStatus("idle");
  };

  return (
    <div className={styles.wrap}>
      <span>识别结果不对？帮我们改进</span>
      <button
        type="button"
        className={styles.button}
        disabled={!canSubmit}
        onClick={submit}
      >
        {status === "saving" ? "提交中..." : status === "done" ? "已提交" : "提交当前验证码"}
      </button>
      {status === "done" ? <span className={styles.success}>感谢你的纠错</span> : null}
    </div>
  );
}
