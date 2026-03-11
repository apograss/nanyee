"use client";

import { diffLines, diffWords } from "diff";

import styles from "./WikiDiffView.module.css";

export interface WikiDiffVersion {
  label: string;
  title: string;
  summary: string | null;
  content: string;
  format: string;
  editorName?: string | null;
  createdAt?: string | null;
}

interface WikiDiffViewProps {
  current: WikiDiffVersion;
  revision: WikiDiffVersion;
}

function InlineDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);

  return (
    <div className={styles.inlineDiff}>
      {parts.map((part, index) => (
        <span
          key={`${part.value}-${index}`}
          className={
            part.added
              ? styles.added
              : part.removed
                ? styles.removed
                : styles.unchanged
          }
        >
          {part.value}
        </span>
      ))}
    </div>
  );
}

function BlockDiff({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);

  return (
    <div className={styles.blockDiff}>
      {parts.map((part, index) => (
        <div
          key={`${index}-${part.value.length}`}
          className={
            part.added
              ? styles.blockAdded
              : part.removed
                ? styles.blockRemoved
                : styles.blockUnchanged
          }
        >
          {part.value || "\n"}
        </div>
      ))}
    </div>
  );
}

export default function WikiDiffView({ current, revision }: WikiDiffViewProps) {
  const hasSummary = Boolean(current.summary || revision.summary);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>版本对比</p>
          <h2 className={styles.title}>当前版本 vs 选中历史版本</h2>
        </div>
        <div className={styles.comparisonMeta}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>当前版本</span>
            <strong>{current.label}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>对比版本</span>
            <strong>{revision.label}</strong>
            {revision.editorName ? <span>{revision.editorName}</span> : null}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>标题变化</div>
        <InlineDiff before={revision.title} after={current.title} />
      </div>

      {hasSummary ? (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>摘要变化</div>
          <InlineDiff before={revision.summary ?? ""} after={current.summary ?? ""} />
        </div>
      ) : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>正文变化</div>
          <span className={styles.formatTag}>
            {revision.format === "markdown" || current.format === "markdown"
              ? "按 Markdown 源文比较"
              : "按 HTML 源文比较"}
          </span>
        </div>
        <BlockDiff before={revision.content} after={current.content} />
      </div>
    </section>
  );
}
