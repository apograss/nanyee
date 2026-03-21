"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./TableOfContents.module.css";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TableOfContentsProps {
  html: string;
}

export default function TableOfContents({ html }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const items = useMemo<TocItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("h2[id], h3[id]"))
      .map((heading) => ({
        id: heading.id,
        text: heading.textContent?.trim() || "",
        level: (heading.tagName === "H2" ? 2 : 3) as 2 | 3,
      }))
      .filter((item) => item.id && item.text);
  }, [html]);

  useEffect(() => {
    if (items.length < 2) return;

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => heading !== null);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0% -60% 0%" },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) {
    return null;
  }

  return (
    <aside className={styles.toc} aria-label="文章目录">
      <button
        type="button"
        className={styles.titleButton}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        <span>文章目录</span>
        <span className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ""}`} aria-hidden="true">▾</span>
      </button>
      {!collapsed && (
        <nav className={styles.list}>
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`${styles.item} ${
                item.level === 3 ? styles.itemLevel3 : ""
              } ${activeId === item.id ? styles.itemActive : ""}`.trim()}
            >
              {item.text}
            </a>
          ))}
        </nav>
      )}
    </aside>
  );
}
