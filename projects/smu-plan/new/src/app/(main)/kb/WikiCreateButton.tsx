"use client";

import Link from "next/link";

import { useAuth } from "@/hooks/useAuth";

import styles from "./page.module.css";

export default function WikiCreateButton() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <Link href="/login?redirect=%2Feditor" className={styles.secondaryCta}>
        登录后参与共建
      </Link>
    );
  }

  return (
    <Link href="/editor" className={styles.contributeBtn}>
      发起共建
    </Link>
  );
}
