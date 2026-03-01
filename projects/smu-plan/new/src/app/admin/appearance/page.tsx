"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

interface HomeSections {
  announcement: boolean;
  searchHistory: boolean;
  tools: boolean;
}

export default function AppearancePage() {
  const [navLinks, setNavLinks] = useState<NavLink[]>([]);
  const [footerContent, setFooterContent] = useState("");
  const [homeSections, setHomeSections] = useState<HomeSections>({
    announcement: true,
    searchHistory: true,
    tools: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (data.ok) {
          const s = data.data.settings as Record<string, string>;
          if (s.navLinks) {
            try { setNavLinks(JSON.parse(s.navLinks)); } catch {}
          }
          if (s.footerContent) setFooterContent(s.footerContent);
          if (s.homeSections) {
            try { setHomeSections(JSON.parse(s.homeSections)); } catch {}
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          navLinks: JSON.stringify(navLinks),
          footerContent,
          homeSections: JSON.stringify(homeSections),
        }),
      });
      const data = await res.json();
      setMessage(data.ok ? "保存成功" : (data.error?.message || "保存失败"));
    } catch {
      setMessage("网络错误");
    }
    setSaving(false);
  };

  const addNavLink = () => setNavLinks([...navLinks, { label: "", href: "" }]);
  const removeNavLink = (idx: number) => setNavLinks(navLinks.filter((_, i) => i !== idx));
  const updateNavLink = (idx: number, field: keyof NavLink, value: string | boolean) => {
    const updated = [...navLinks];
    updated[idx] = { ...updated[idx], [field]: value };
    setNavLinks(updated);
  };

  const toggleSection = (key: keyof HomeSections) => {
    setHomeSections({ ...homeSections, [key]: !homeSections[key] });
  };

  if (loading) return <div className={styles.page}><div className={styles.empty}>加载中...</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>外观设置</h1>
        <NeoButton variant="primary" onClick={handleSave} isLoading={saving}>保存全部</NeoButton>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      {/* Nav Links Editor */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>导航链接</h2>
          <NeoButton size="sm" variant="secondary" onClick={addNavLink}>+ 添加</NeoButton>
        </div>
        <p className={styles.hint}>自定义顶部导航栏链接。留空则使用默认导航。</p>
        {navLinks.map((link, idx) => (
          <div key={idx} className={styles.linkRow}>
            <NeoInput placeholder="显示文字" value={link.label} onChange={(e) => updateNavLink(idx, "label", e.target.value)} />
            <NeoInput placeholder="链接地址" value={link.href} onChange={(e) => updateNavLink(idx, "href", e.target.value)} />
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={link.external || false} onChange={(e) => updateNavLink(idx, "external", e.target.checked)} />
              外部
            </label>
            <NeoButton size="sm" variant="danger" onClick={() => removeNavLink(idx)}>删除</NeoButton>
          </div>
        ))}
        {navLinks.length === 0 && <p className={styles.hint}>未配置自定义导航，将使用默认导航链接。</p>}
      </section>

      {/* Footer Content */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>页脚内容</h2>
        <p className={styles.hint}>自定义页脚显示内容（支持 HTML）。留空则使用默认页脚。</p>
        <textarea
          className={styles.textarea}
          value={footerContent}
          onChange={(e) => setFooterContent(e.target.value)}
          rows={4}
          placeholder="Made with ♥ by Nanyee.de"
          aria-label="页脚内容"
        />
      </section>

      {/* Home Sections Toggle */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>首页区块开关</h2>
        <p className={styles.hint}>控制首页各区块的显示/隐藏。</p>
        <div className={styles.toggleList}>
          {([
            { key: "announcement" as const, label: "公告横幅" },
            { key: "searchHistory" as const, label: "搜索历史" },
            { key: "tools" as const, label: "工具展示" },
          ]).map((item) => (
            <label key={item.key} className={styles.toggleRow}>
              <span>{item.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={homeSections[item.key]}
                className={`${styles.toggle} ${homeSections[item.key] ? styles.on : styles.off}`}
                onClick={() => toggleSection(item.key)}
              >
                {homeSections[item.key] ? "ON" : "OFF"}
              </button>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
