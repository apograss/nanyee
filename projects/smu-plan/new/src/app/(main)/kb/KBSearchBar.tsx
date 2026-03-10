"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

export default function KBSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    router.push(`/kb${params.toString() ? `?${params}` : ""}`);
  };

  const handleClear = () => {
    setQuery("");
    router.push("/kb");
    inputRef.current?.focus();
  };

  return (
    <form className={styles.searchForm} onSubmit={handleSubmit}>
      <svg
        className={styles.searchIcon}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        className={styles.searchInput}
        type="text"
        placeholder="搜索知识库条目…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          type="button"
          className={styles.searchClear}
          onClick={handleClear}
          aria-label="清除搜索"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <button type="submit" className={styles.searchSubmit}>
        搜索
      </button>
    </form>
  );
}
