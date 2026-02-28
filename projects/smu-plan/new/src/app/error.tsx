"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      gap: "16px",
      padding: "32px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "2rem" }}>&#x26A0;&#xFE0F;</div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
        出了点问题
      </h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "400px", fontSize: "0.875rem" }}>
        {error.message || "页面加载时发生了错误，请重试。"}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "10px 24px",
          background: "var(--color-brand)",
          color: "var(--text-inverse)",
          border: "var(--neo-border)",
          borderRadius: "var(--neo-radius)",
          boxShadow: "var(--neo-shadow-sm)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        重试
      </button>
    </div>
  );
}
