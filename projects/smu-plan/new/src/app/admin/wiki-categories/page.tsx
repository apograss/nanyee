"use client";

import { useEffect, useState } from "react";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import ConfirmDialog from "@/components/molecules/ConfirmDialog";
import styles from "./page.module.css";

interface WikiCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  articleCount: number;
  children: WikiCategoryNode[];
}

interface NoticeState {
  tone: "success" | "error";
  message: string;
}

export default function AdminWikiCategoriesPage() {
  const [categories, setCategories] = useState<WikiCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WikiCategoryNode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");

  async function loadCategories() {
    setLoading(true);
    try {
      const res = await fetch("/api/wiki/categories");
      const data = await res.json();
      if (data.ok) {
        setCategories(data.data.categories || []);
      } else {
        setNotice({ tone: "error", message: data.error?.message || "分类加载失败" });
      }
    } catch {
      setNotice({ tone: "error", message: "分类加载失败，请稍后重试。" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories().catch(() => {});
  }, []);

  function resetForm() {
    setEditingId(null);
    setFormName("");
    setFormIcon("");
    setFormParentId("");
    setFormSortOrder("0");
  }

  function openParentCreate() {
    resetForm();
  }

  function openChildCreate(parentId: string) {
    resetForm();
    setFormParentId(parentId);
  }

  function openEdit(category: WikiCategoryNode, parentId?: string) {
    setEditingId(category.id);
    setFormName(category.name);
    setFormIcon(category.icon || "");
    setFormParentId(parentId || category.parentId || "");
    setFormSortOrder(String(category.sortOrder));
  }

  async function handleSave() {
    if (!formName.trim()) {
      setNotice({ tone: "error", message: "请填写分类名称。" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        icon: formIcon.trim() || undefined,
        parentId: formParentId || undefined,
        sortOrder: Number(formSortOrder) || 0,
      };

      const res = await fetch(
        editingId ? `/api/wiki/categories/${editingId}` : "/api/wiki/categories",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!data.ok) {
        setNotice({ tone: "error", message: data.error?.message || "保存失败" });
        return;
      }

      setNotice({ tone: "success", message: "分类已保存。" });
      resetForm();
      await loadCategories();
    } catch {
      setNotice({ tone: "error", message: "保存失败，请稍后重试。" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      const res = await fetch(`/api/wiki/categories/${pendingDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) {
        setNotice({ tone: "error", message: data.error?.message || "删除失败" });
        return;
      }
      setPendingDelete(null);
      setNotice({ tone: "success", message: "分类已删除。" });
      await loadCategories();
    } catch {
      setNotice({ tone: "error", message: "删除失败，请稍后重试。" });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Wiki 分类管理</h1>
          <p className={styles.desc}>母项由管理员维护，子项支持共建，但后台仍可统一整理。</p>
        </div>
        <NeoButton type="button" onClick={openParentCreate}>
          新建母分类
        </NeoButton>
      </div>

      {notice ? (
        <div
          className={`${styles.notice} ${
            notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      ) : null}

      <div className={styles.layout}>
        <section className={styles.editor}>
          <h2 className={styles.sectionTitle}>
            {editingId ? "编辑分类" : formParentId ? "新建子分类" : "新建母分类"}
          </h2>
          <div className={styles.form}>
            <NeoInput
              label="分类名称"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="例如：本科生学习指南"
            />
            <NeoInput
              label="图标"
              value={formIcon}
              onChange={(e) => setFormIcon(e.target.value)}
              placeholder="例如：📘"
              maxLength={8}
            />
            <div className={styles.field}>
              <label className={styles.fieldLabel}>所属母分类</label>
              <select
                className={styles.select}
                value={formParentId}
                onChange={(e) => setFormParentId(e.target.value)}
              >
                <option value="">作为母分类</option>
                {categories.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.icon ? `${parent.icon} ` : ""}{parent.name}
                  </option>
                ))}
              </select>
            </div>
            <NeoInput
              label="排序值"
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
              placeholder="0"
            />
            <div className={styles.formActions}>
              <NeoButton type="button" onClick={handleSave} isLoading={saving}>
                保存分类
              </NeoButton>
              <NeoButton type="button" variant="secondary" onClick={resetForm}>
                取消
              </NeoButton>
            </div>
          </div>
        </section>

        <section className={styles.tree}>
          <h2 className={styles.sectionTitle}>分类树</h2>
          {loading ? (
            <div className={styles.empty}>加载中...</div>
          ) : categories.length === 0 ? (
            <div className={styles.empty}>还没有母分类，请先创建。</div>
          ) : (
            <div className={styles.treeList}>
              {categories.map((parent) => (
                <article key={parent.id} className={styles.parentCard}>
                  <div className={styles.parentHeader}>
                    <div>
                      <p className={styles.parentTitle}>
                        {parent.icon || "📚"} {parent.name}
                      </p>
                      <p className={styles.parentMeta}>
                        {parent.articleCount} 篇文章 · {parent.children.length} 个子分类
                      </p>
                    </div>
                    <div className={styles.parentActions}>
                      <NeoButton type="button" size="sm" variant="secondary" onClick={() => openEdit(parent)}>
                        编辑母项
                      </NeoButton>
                      <NeoButton type="button" size="sm" variant="outline" onClick={() => openChildCreate(parent.id)}>
                        新建子项
                      </NeoButton>
                      <NeoButton type="button" size="sm" variant="danger" onClick={() => setPendingDelete(parent)}>
                        删除
                      </NeoButton>
                    </div>
                  </div>

                  {parent.children.length === 0 ? (
                    <div className={styles.emptyInline}>暂无子分类</div>
                  ) : (
                    <ul className={styles.childList}>
                      {parent.children.map((child) => (
                        <li key={child.id} className={styles.childItem}>
                          <div>
                            <strong>{child.icon || "📄"} {child.name}</strong>
                            <div className={styles.childMeta}>
                              {child.articleCount} 篇文章 · 排序 {child.sortOrder}
                            </div>
                          </div>
                          <div className={styles.childActions}>
                            <NeoButton type="button" size="sm" variant="secondary" onClick={() => openEdit(child, parent.id)}>
                              编辑
                            </NeoButton>
                            <NeoButton type="button" size="sm" variant="danger" onClick={() => setPendingDelete(child)}>
                              删除
                            </NeoButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除分类"
        message={
          pendingDelete?.parentId
            ? `确认删除子分类“${pendingDelete.name}”吗？已归属文章会被暂时移出分类。`
            : `确认删除母分类“${pendingDelete?.name}”吗？请先确保母项下没有子分类。`
        }
        confirmLabel="确认删除"
        cancelLabel="取消"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
