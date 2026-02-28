import styles from "./ReferenceCard.module.css";

interface ReferenceCardProps {
  title: string;
  source: string;
  url?: string;
}

export default function ReferenceCard({ title, source, url }: ReferenceCardProps) {
  const Wrapper = url ? "a" : "div";
  const wrapperProps = url
    ? { href: url, target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <Wrapper className={styles.card} {...wrapperProps}>
      <div className={styles.icon}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.source}>{source}</p>
      </div>
      {url && <span className={styles.link}>↗</span>}
    </Wrapper>
  );
}
