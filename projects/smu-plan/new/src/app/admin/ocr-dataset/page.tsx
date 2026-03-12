"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import styles from "../guestbook/page.module.css";

interface OcrSampleItem {
  id: string;
  sourcePage: string;
  imageBase64: string;
  correctedText: string;
  ocrText?: string | null;
  authorName: string;
  createdAt: string;
}

export default function OcrDatasetPage() {
  const [items, setItems] = useState<OcrSampleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ocr-dataset")
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          setItems(data.data.samples);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>OCR 纠错数据集</h1>
        <Link
          href="/api/admin/ocr-dataset?format=csv"
          className={styles.pageInfo}
          style={{ textDecoration: "underline", color: "var(--color-brand)" }}
        >
          导出 CSV
        </Link>
      </div>

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无 OCR 纠错样本</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>来源</th>
                <th>图片</th>
                <th>原识别</th>
                <th>人工纠正</th>
                <th>提交人</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.sourcePage}</td>
                  <td>
                    <img
                      src={item.imageBase64}
                      alt="OCR 样本"
                      style={{ width: 112, borderRadius: 10, border: "1px solid var(--border-subtle)" }}
                    />
                  </td>
                  <td className={styles.mono}>{item.ocrText || "-"}</td>
                  <td className={styles.contentCell}>{item.correctedText}</td>
                  <td>{item.authorName}</td>
                  <td className={styles.mono}>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
