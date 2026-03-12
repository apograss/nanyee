import styles from "./SourceCard.module.css";

interface SourceCardProps {
  index: number;
  title: string;
  source: string;
  url?: string;
}

export default function SourceCard({ index, title, source, url }: SourceCardProps) {
  const Wrapper = url ? "a" : "div";
  const wrapperProps = url
    ? { href: url, target: "_self" as const, rel: "noreferrer" }
    : {};

  return (
    <Wrapper className={styles.card} {...wrapperProps}>
      <span className={styles.index}>[{index}]</span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.source}>{source}</p>
      </div>
      {url ? <span className={styles.arrow}>↗</span> : null}
    </Wrapper>
  );
}
