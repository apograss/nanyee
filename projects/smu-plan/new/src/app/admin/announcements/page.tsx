"use client";

import { useEffect, useState, useCallback } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import Badge from "@/components/atoms/Badge";
import styles from "../audit/page.module.css";

interface AnnouncementItem {
  id: string;
  content: string;
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formContent, setFormContent] = useState("");
  const [formPriority, setFormPriority] = useState("0");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements");
      const data = await res.json();
      if (data.ok) setItems(data.data.announcements);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setFormContent("");
    setFormPriority("0");
    setFormActive(true);
  };

  const startEdit = (item: AnnouncementItem) => {
    setEditingId(item.id);
    setFormContent(item.content);
    setFormPriority(String(item.priority));
    setFormActive(item.active);
  };

  const handleSave = async () => {
    if (!formContent.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/admin/announcements/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formContent,
            priority: parseInt(formPriority) || 0,
            active: formActive,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          resetForm();
          loadData();
        }
      } else {
        // Create
        const res = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formContent,
            priority: parseInt(formPriority) || 0,
            active: formActive,
          }),
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
    if (!confirm("确定要删除该公告吗？")) return;
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.ok) loadData();
  };

  const handleToggle = async (item: AnnouncementItem) => {
    const res = await fetch(`/api/admin/announcements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    const data = await res.json();
    if (data.ok) loadData();
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>公告管理</h1>
      </div>

      {/* Create / Edit Form */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {editingId ? "编辑公告" : "新建公告"}
        </h2>
        <div className={styles.form}>
          <NeoInput
            label="公告内容"
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="输入公告文本..."
          />
          <div className={styles.formRow}>
            <NeoInput
              label="优先级（数字越大越靠前）"
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value)}
              placeholder="0"
            />
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "var(--text-sm)",
                  cursor: "pointer",
                  paddingBottom: "8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                启用
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <NeoButton onClick={handleSave} isLoading={saving} disabled={!formContent.trim()}>
              {editingId ? "保存修改" : "创建公告"}
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
        <h2 className={styles.sectionTitle}>公告列表</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>内容</th>
              <th>状态</th>
              <th>优先级</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ maxWidth: "400px", wordBreak: "break-all" }}>
                  {item.content}
                </td>
                <td>
                  <Badge
                    text={item.active ? "启用" : "禁用"}
                    colorVariant={item.active ? "success" : "error"}
                  />
                </td>
                <td>{item.priority}</td>
                <td>
                  {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <NeoButton size="sm" variant="secondary" onClick={() => startEdit(item)}>
                      编辑
                    </NeoButton>
                    <NeoButton
                      size="sm"
                      variant={item.active ? "danger" : "primary"}
                      onClick={() => handleToggle(item)}
                    >
                      {item.active ? "禁用" : "启用"}
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
                  colSpan={5}
                  style={{ textAlign: "center", color: "var(--text-muted)" }}
                >
                  暂无公告
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
