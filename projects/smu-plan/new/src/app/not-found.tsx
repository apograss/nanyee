import Link from "next/link";

export default function NotFound() {
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
      <div style={{ fontSize: "4rem", fontWeight: 700 }}>404</div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)" }}>
        页面不存在
      </h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "400px" }}>
        你访问的页面可能已被移除或暂时不可用。
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          background: "var(--color-brand)",
          color: "var(--text-inverse)",
          border: "var(--neo-border)",
          borderRadius: "var(--neo-radius)",
          boxShadow: "var(--neo-shadow-sm)",
          fontWeight: 600,
          textDecoration: "none",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
      >
        返回首页
      </Link>
    </div>
  );
}
