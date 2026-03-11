"use client";

import { useRouter, useSearchParams } from "next/navigation";
import styles from "./KBSortBar.module.css";

const SORT_OPTIONS = [
  { value: "newest", label: "最新" },
  { value: "popular", label: "最热" },
  { value: "recommended", label: "推荐" },
] as const;

interface KBSortBarProps {
  currentSort: string;
}

export default function KBSortBar({ currentSort }: KBSortBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSort = (sort: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (sort === "newest") {
      sp.delete("sort");
    } else {
      sp.set("sort", sort);
    }
    sp.delete("page");
    router.push(`/kb${sp.toString() ? `?${sp}` : ""}`);
  };

  return (
    <div className={styles.tabs}>
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.tab} ${currentSort === opt.value ? styles.active : ""}`}
          onClick={() => handleSort(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
