"use client";

import { useEffect, useState, useCallback } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "../audit/page.module.css";

interface LinkItem {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string | null;
  order: number;
  createdAt: string;
}

export default function LinksPage() {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formDescription, setFormDescription] = useState("");
  const [formOrder, setFormOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  const handleFetchMeta = async () => {
    if (!formUrl.trim()) return;
    if (formTitle || formDescription) {
      if (!confirm("已有标题或描述，是否用抓取结果覆盖？")) return;
    }
    setFetching(true);
    try {
      const res = await fetch("/api/admin/links/fetch-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        if (data.data.title) setFormTitle(data.data.title);
        if (data.data.description) setFormDescription(data.data.description);
      } else {
        alert("未能获取到页面信息");
      }
    } catch {
      alert("抓取失败，请检查URL是否可访问");
    } finally {
      setFetching(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/links");
      const data = await res.json();
      if (data.ok) setItems(data.data.links);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormUrl("");
    setFormCategory("general");
    setFormDescription("");
    setFormOrder("0");
  };

  const startEdit = (item: LinkItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormUrl(item.url);
    setFormCategory(item.category);
    setFormDescription(item.description || "");
    setFormOrder(String(item.order));
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formUrl.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle,
        url: formUrl,
        category: formCategory,
        description: formDescription || null,
        order: parseInt(formOrder) || 0,
      };

      if (editingId) {
        const res = await fetch(`/api/admin/links/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          resetForm();
          loadData();
        }
      } else {
        const res = await fetch("/api/admin/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          resetForm();
          loadData();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除该链接吗？")) return;
    const res = await fetch(`/api/admin/links/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.ok) loadData();
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>链接管理</h1>
      </div>

      {/* Create / Edit Form */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {editingId ? "编辑链接" : "新建链接"}
        </h2>
        <div className={styles.form}>
          <div className={styles.formRow}>
            <NeoInput
              label="标题"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="链接标题"
            />
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flex: 1 }}>
              <NeoInput
                label="URL"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://..."
              />
              <NeoButton
                size="sm"
                variant="secondary"
                onClick={handleFetchMeta}
                isLoading={fetching}
                disabled={!formUrl.trim()}
              >
                抓取信息
              </NeoButton>
            </div>
          </div>
          <div className={styles.formRow}>
            <NeoInput
              label="分类"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="general"
            />
            <NeoInput
              label="排序（数字越小越靠前）"
              value={formOrder}
              onChange={(e) => setFormOrder(e.target.value)}
              placeholder="0"
            />
          </div>
          <NeoInput
            label="描述（可选）"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="链接描述..."
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <NeoButton onClick={handleSave} isLoading={saving} disabled={!formTitle.trim() || !formUrl.trim()}>
              {editingId ? "保存修改" : "创建链接"}
            </NeoButton>
            {editingId && (
              <NeoButton variant="secondary" onClick={resetForm}>
                取消
              </NeoButton>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>链接列表</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>标题</th>
              <th>URL</th>
              <th>分类</th>
              <th>描述</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600 }}>{item.title}</td>
                <td className={styles.mono} style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-brand)" }}>
                    {item.url}
                  </a>
                </td>
                <td>{item.category}</td>
                <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.description || "—"}
                </td>
                <td>{item.order}</td>
                <td>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <NeoButton size="sm" variant="secondary" onClick={() => startEdit(item)}>
                      编辑
                    </NeoButton>
                    <NeoButton size="sm" variant="danger" onClick={() => handleDelete(item.id)}>
                      删除
                    </NeoButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  style={{ textAlign: "center", color: "var(--text-muted)" }}
                >
                  暂无链接
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
