"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import styles from "./links.module.css";

/* ── Types ── */
interface LinkItem {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string | null;
  order: number;
}

interface CategoryMeta {
  icon?: string;
  order?: number;
}

/* ── Default links shown when DB is empty ── */
const DEFAULTS: Omit<LinkItem, "id">[] = [
  { title: "教务管理系统", url: "https://jw.smu.edu.cn", category: "教务系统", description: "选课、课表查看、考试安排等教务功能", order: 0 },
  { title: "统一身份认证", url: "https://cas.smu.edu.cn", category: "教务系统", description: "校园各系统统一登录入口", order: 1 },
  { title: "图书馆", url: "https://lib.smu.edu.cn", category: "学习资源", description: "馆藏检索、电子资源、座位预约", order: 0 },
  { title: "网络教学平台", url: "https://mooc.smu.edu.cn", category: "学习资源", description: "在线课程、教学视频与课件资源", order: 1 },
  { title: "校园信息门户", url: "https://my.smu.edu.cn", category: "校园生活", description: "通知公告、个人信息、校园服务一站式入口", order: 0 },
  { title: "课表导出", url: "/tools/schedule", category: "实用工具", description: "将教务系统课表导出为 ICS 日历文件", order: 0 },
  { title: "自动选课", url: "/tools/enroll", category: "实用工具", description: "设定选课目标，自动抢课并识别验证码", order: 1 },
];

const DEFAULT_ICONS: Record<string, string> = {
  "教务系统": "🎓",
  "学习资源": "📚",
  "校园生活": "🏫",
  "实用工具": "🛠️",
};

function isInternal(url: string) {
  return url.startsWith("/");
}

function hostOf(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

/* ── External-link arrow icon ── */
function ExternalArrow() {
  return (
    <svg className={styles.externalIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h7v7" />
      <path d="M13 3 6 10" />
    </svg>
  );
}

/* ── Page ── */
export default function LinksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<LinkItem[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<Record<string, CategoryMeta>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Edit form state
  const [editId, setEditId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formOrder, setFormOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  // Category edit state
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catNewName, setCatNewName] = useState("");
  const [catNewIcon, setCatNewIcon] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/links");
      const data = await res.json();
      if (data.ok && data.data.links.length > 0) {
        setItems(data.data.links);
      } else {
        setItems(DEFAULTS.map((d, i) => ({ ...d, id: `default-${i}` })));
      }
      if (data.ok && data.data.categoryMeta) {
        setCategoryMeta(data.data.categoryMeta);
      }
    } catch {
      setItems(DEFAULTS.map((d, i) => ({ ...d, id: `default-${i}` })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group by category
  const grouped = items.reduce<Record<string, LinkItem[]>>((acc, item) => {
    const cat = item.category || "其他";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Sort categories by meta.order, then alphabetically
  const categories = Object.keys(grouped).sort((a, b) => {
    const oa = categoryMeta[a]?.order ?? 999;
    const ob = categoryMeta[b]?.order ?? 999;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  const getCategoryIcon = (cat: string) => {
    return categoryMeta[cat]?.icon || DEFAULT_ICONS[cat] || "📎";
  };

  const resetForm = () => {
    setEditId(null);
    setFormTitle("");
    setFormUrl("");
    setFormCategory("");
    setFormDesc("");
    setFormOrder("0");
  };

  const startEdit = (item: LinkItem) => {
    setEditId(item.id);
    setFormTitle(item.title);
    setFormUrl(item.url);
    setFormCategory(item.category);
    setFormDesc(item.description || "");
    setFormOrder(String(item.order));
  };

  const startAdd = (category: string) => {
    setEditId("new");
    setFormTitle("");
    setFormUrl("");
    setFormCategory(category);
    setFormDesc("");
    setFormOrder("0");
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formUrl.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        url: formUrl.trim(),
        category: formCategory.trim() || "其他",
        description: formDesc.trim() || null,
        order: parseInt(formOrder) || 0,
      };

      const isNew = editId === "new" || editId?.startsWith("default-");
      const url = isNew ? "/api/admin/links" : `/api/admin/links/${editId}`;
      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        resetForm();
        loadData();
      } else {
        alert(data.error?.message || data.error || "保存失败");
      }
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : "网络错误"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith("default-")) {
      alert("这是默认链接，请先添加到数据库再管理");
      return;
    }
    if (!confirm("确定要删除该链接吗？")) return;
    try {
      const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        loadData();
      } else {
        alert(data.error?.message || data.error || "删除失败");
      }
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : "网络错误"}`);
    }
  };

  /* ── Category editing ── */
  const startCatEdit = (cat: string) => {
    setEditingCat(cat);
    setCatNewName(cat);
    setCatNewIcon(getCategoryIcon(cat));
  };

  const cancelCatEdit = () => {
    setEditingCat(null);
    setCatNewName("");
    setCatNewIcon("");
  };

  const handleCatSave = async () => {
    if (!editingCat || !catNewName.trim()) return;
    setCatSaving(true);
    try {
      // 1. Rename category on all links if name changed
      if (catNewName.trim() !== editingCat) {
        const res = await fetch("/api/admin/links", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldName: editingCat, newName: catNewName.trim() }),
        });
        const data = await res.json();
        if (!data.ok) {
          alert(data.error?.message || "重命名失败");
          setCatSaving(false);
          return;
        }
      }

      // 2. Update category meta (icon, order) in settings
      const newMeta = { ...categoryMeta };
      // Remove old key if renamed
      if (catNewName.trim() !== editingCat) {
        delete newMeta[editingCat];
      }
      newMeta[catNewName.trim()] = {
        ...newMeta[catNewName.trim()],
        icon: catNewIcon.trim() || undefined,
      };

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkCategories: JSON.stringify(newMeta) }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error?.message || "保存分类设置失败");
        setCatSaving(false);
        return;
      }

      cancelCatEdit();
      loadData();
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : "网络错误"}`);
    } finally {
      setCatSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>链接推荐</h1>
          <p className={styles.desc}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>链接推荐</h1>
            <p className={styles.desc}>南方医科大学常用链接和资源推荐</p>
          </div>
          {isAdmin && (
            <button
              className={`${styles.editToggle} ${editing ? styles.editToggleActive : ""}`}
              onClick={() => { setEditing(!editing); resetForm(); }}
            >
              {editing ? "退出编辑" : "编辑模式"}
            </button>
          )}
        </div>
      </div>

      {/* Edit form (shown inline when editing a link or adding) */}
      {editing && editId && (
        <div className={styles.editPanel}>
          <h3 className={styles.editPanelTitle}>
            {editId === "new" || editId.startsWith("default-") ? "添加链接" : "编辑链接"}
          </h3>
          <div className={styles.editForm}>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>
                标题
                <input className={styles.editInput} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="链接标题" />
              </label>
              <label className={styles.editLabel}>
                URL
                <input className={styles.editInput} value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..." />
              </label>
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>
                分类
                <input className={styles.editInput} value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder="教务系统" />
              </label>
              <label className={styles.editLabel}>
                排序
                <input className={styles.editInput} value={formOrder} onChange={(e) => setFormOrder(e.target.value)} placeholder="0" />
              </label>
            </div>
            <label className={styles.editLabel}>
              描述
              <input className={styles.editInput} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="链接描述（可选）" />
            </label>
            <div className={styles.editActions}>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !formTitle.trim() || !formUrl.trim()}>
                {saving ? "保存中..." : "保存"}
              </button>
              <button className={styles.cancelBtn} onClick={resetForm}>取消</button>
            </div>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <section key={cat} className={styles.category}>
          <div className={styles.categoryHeader}>
            {editing && editingCat === cat ? (
              <div className={styles.catEditRow}>
                <input
                  className={styles.catEditInput}
                  value={catNewIcon}
                  onChange={(e) => setCatNewIcon(e.target.value)}
                  placeholder="📎"
                  style={{ width: 48, textAlign: "center" }}
                  aria-label="分类图标"
                />
                <input
                  className={styles.catEditInput}
                  value={catNewName}
                  onChange={(e) => setCatNewName(e.target.value)}
                  placeholder="分类名称"
                  aria-label="分类名称"
                />
                <button className={styles.saveBtn} onClick={handleCatSave} disabled={catSaving || !catNewName.trim()}>
                  {catSaving ? "..." : "保存"}
                </button>
                <button className={styles.cancelBtn} onClick={cancelCatEdit}>取消</button>
              </div>
            ) : (
              <>
                <span className={styles.categoryIcon}>{getCategoryIcon(cat)}</span>
                <h2 className={styles.categoryTitle}>{cat}</h2>
                {editing && (
                  <>
                    <button className={styles.catEditBtn} onClick={() => startCatEdit(cat)} title="编辑分类">✏️</button>
                    <button className={styles.addBtn} onClick={() => startAdd(cat)} title="添加链接到此分类">+</button>
                  </>
                )}
              </>
            )}
          </div>

          <div className={styles.grid}>
            {grouped[cat].map((item) => {
              const internal = isInternal(item.url);
              const cardContent = (
                <>
                  <span className={styles.cardTop}>
                    <span className={styles.cardTitle}>{item.title}</span>
                    {internal ? (
                      <span className={styles.badge}>站内</span>
                    ) : (
                      <ExternalArrow />
                    )}
                  </span>
                  {item.description && <span className={styles.cardDesc}>{item.description}</span>}
                  <span className={styles.cardUrl}>{internal ? item.url : hostOf(item.url)}</span>
                </>
              );

              if (editing) {
                return (
                  <div key={item.id} className={styles.card} style={{ cursor: "default" }}>
                    {cardContent}
                    <div className={styles.cardActions}>
                      <button className={styles.cardEditBtn} onClick={() => startEdit(item)}>编辑</button>
                      <button className={styles.cardDeleteBtn} onClick={() => handleDelete(item.id)}>删除</button>
                    </div>
                  </div>
                );
              }

              if (internal) {
                return (
                  <Link key={item.id} href={item.url} className={styles.card}>
                    {cardContent}
                  </Link>
                );
              }

              return (
                <a key={item.id} href={item.url} className={styles.card} target="_blank" rel="noopener noreferrer">
                  {cardContent}
                </a>
              );
            })}
          </div>
        </section>
      ))}

      {/* Global add button when in edit mode */}
      {editing && (
        <div className={styles.globalAdd}>
          <button className={styles.globalAddBtn} onClick={() => startAdd("")}>
            + 添加新链接
          </button>
        </div>
      )}
    </div>
  );
}
