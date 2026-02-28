export default function Loading() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "40vh",
      gap: "8px",
    }}>
      <div style={{
        width: "24px",
        height: "24px",
        border: "3px solid var(--border-light)",
        borderTopColor: "var(--color-brand)",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
