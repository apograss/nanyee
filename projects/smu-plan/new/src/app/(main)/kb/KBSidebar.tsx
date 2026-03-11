"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { ArticleMeta } from "@/lib/wiki/queries";
import styles from "./KBSidebar.module.css";

const CONTRIB_COLORS = [
  "#E8652B",
  "#457B9D",
  "#4CAF50",
  "#9B59B6",
  "#E74C3C",
  "#27ae60",
  "#2196F3",
];

function getContribColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CONTRIB_COLORS[Math.abs(hash) % CONTRIB_COLORS.length];
}

interface KBSidebarProps {
  meta: ArticleMeta;
  currentCategory?: string;
  currentTag?: string;
}

export default function KBSidebar({
  meta,
  currentCategory,
  currentTag,
}: KBSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [categoryCollapsed, setCategoryCollapsed] = useState<Record<string, boolean>>({});

  const categoryTree = meta.categoryTree ?? [];
  const totalCount = useMemo(
    () => categoryTree.reduce((sum, item) => sum + item.articleCount, 0),
    [categoryTree],
  );

  const toggleSection = (id: string) =>
    setSectionCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleCategory = (id: string) =>
    setCategoryCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const navigate = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    router.push(`/kb${sp.toString() ? `?${sp}` : ""}`);
    setMobileOpen(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      q: query.trim() || undefined,
      category: currentCategory,
      tag: currentTag,
    });
  };

  const sidebarContent = (
    <>
      <form className={styles.sbSearch} onSubmit={handleSearch}>
        <span className={styles.sbSearchIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          className={styles.sbSearchInput}
          type="text"
          placeholder="搜索知识库…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className={styles.sbSection}>
        <div className={styles.sbTitle} onClick={() => toggleSection("cat")}>
          学科分类
          <span className={`${styles.sbArrow} ${sectionCollapsed.cat ? styles.sbArrowCollapsed : ""}`}>▾</span>
        </div>
        <div className={`${styles.sbBody} ${sectionCollapsed.cat ? styles.sbBodyCollapsed : ""}`}>
          <ul className={styles.catList}>
            <li>
              <button
                className={`${styles.catItem} ${!currentCategory ? styles.catItemActive : ""}`}
                onClick={() => navigate({ q: query.trim() || undefined, tag: currentTag })}
              >
                <span className={styles.catIcon}>🗂️</span>
                全部
                <span className={styles.catCount}>{totalCount}</span>
              </button>
            </li>

            {categoryTree.map((parent) => {
              const isParentCollapsed = categoryCollapsed[parent.id] ?? false;

              return (
                <li key={parent.id} className={styles.parentGroup}>
                  <button
                    className={styles.parentItem}
                    onClick={() => toggleCategory(parent.id)}
                    type="button"
                  >
                    <span className={styles.catIcon}>{parent.icon || "📚"}</span>
                    <span className={styles.parentLabel}>{parent.name}</span>
                    <span className={styles.catCount}>{parent.articleCount}</span>
                    <span className={`${styles.parentArrow} ${isParentCollapsed ? styles.parentArrowCollapsed : ""}`}>▾</span>
                  </button>

                  {!isParentCollapsed && parent.children.length > 0 ? (
                    <ul className={styles.childList}>
                      {parent.children.map((child) => (
                        <li key={child.id}>
                          <button
                            className={`${styles.childItem} ${currentCategory === child.slug ? styles.catItemActive : ""}`}
                            onClick={() =>
                              navigate({
                                q: query.trim() || undefined,
                                category: child.slug,
                                tag: currentTag,
                              })
                            }
                          >
                            <span className={styles.catIcon}>{child.icon || "📄"}</span>
                            {child.name}
                            <span className={styles.catCount}>{child.articleCount}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {meta.tags.length > 0 && (
        <div className={styles.sbSection}>
          <div className={styles.sbTitle} onClick={() => toggleSection("tags")}>
            热门标签
            <span className={`${styles.sbArrow} ${sectionCollapsed.tags ? styles.sbArrowCollapsed : ""}`}>▾</span>
          </div>
          <div className={`${styles.sbBody} ${sectionCollapsed.tags ? styles.sbBodyCollapsed : ""}`}>
            <div className={styles.tagCloud}>
              {meta.tags.map((tag) => (
                <button
                  key={tag.name}
                  className={`${styles.tag} ${currentTag === tag.name ? styles.tagActive : ""}`}
                  onClick={() =>
                    navigate({
                      q: query.trim() || undefined,
                      category: currentCategory,
                      tag: currentTag === tag.name ? undefined : tag.name,
                    })
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {meta.contributors.length > 0 && (
        <div className={styles.sbSection}>
          <div className={styles.sbTitle} onClick={() => toggleSection("contrib")}>
            活跃贡献者
            <span className={`${styles.sbArrow} ${sectionCollapsed.contrib ? styles.sbArrowCollapsed : ""}`}>▾</span>
          </div>
          <div className={`${styles.sbBody} ${sectionCollapsed.contrib ? styles.sbBodyCollapsed : ""}`}>
            <div className={styles.contrib}>
              {meta.contributors.map((contributor) => {
                const color = getContribColor(contributor.name);
                return contributor.avatar ? (
                  <img
                    key={contributor.id}
                    src={contributor.avatar}
                    alt={contributor.name}
                    title={contributor.name}
                    className={styles.contribAvatarImg}
                  />
                ) : (
                  <div
                    key={contributor.id}
                    className={styles.contribAvatar}
                    title={contributor.name}
                    style={{
                      background: `${color}18`,
                      color,
                      borderColor: color,
                    }}
                  >
                    {contributor.name.charAt(0)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <button
        className={styles.mobileToggle}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="筛选知识库"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="14" y2="12" />
          <line x1="4" y1="18" x2="9" y2="18" />
        </svg>
        筛选
      </button>

      <div className={styles.desktopOnly}>
        <aside className={styles.sidebar}>{sidebarContent}</aside>
      </div>

      {mobileOpen && (
        <div className={styles.overlay} onClick={() => setMobileOpen(false)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>筛选</span>
              <button className={styles.drawerClose} onClick={() => setMobileOpen(false)}>×</button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
