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

interface PromptExample {
  icon: string;
  text: string;
}

const DEFAULT_PROMPT_EXAMPLES: PromptExample[] = [
  { icon: "📅", text: "今天有什么课" },
  { icon: "📊", text: "帮我算一下 GPA" },
  { icon: "🏫", text: "南医大有哪些社团" },
  { icon: "🍜", text: "二食堂几点开门" },
];

export default function AppearancePage() {
  const [navLinks, setNavLinks] = useState<NavLink[]>([]);
  const [footerContent, setFooterContent] = useState("");
  const [aboutHtml, setAboutHtml] = useState("");
  const [aboutPreview, setAboutPreview] = useState(false);
  const [promptExamples, setPromptExamples] = useState<PromptExample[]>(DEFAULT_PROMPT_EXAMPLES);
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
          if (s.aboutHtml) setAboutHtml(s.aboutHtml);
          if (s.promptExamples) {
            try {
              const parsed = JSON.parse(s.promptExamples);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setPromptExamples(parsed);
              }
            } catch {}
          }
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
          aboutHtml,
          promptExamples: JSON.stringify(promptExamples),
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

  const addPromptExample = () => setPromptExamples([...promptExamples, { icon: "", text: "" }]);
  const removePromptExample = (idx: number) => setPromptExamples(promptExamples.filter((_, i) => i !== idx));
  const updatePromptExample = (idx: number, field: keyof PromptExample, value: string) => {
    const updated = [...promptExamples];
    updated[idx] = { ...updated[idx], [field]: value };
    setPromptExamples(updated);
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

      {/* About Page HTML */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>关于页面</h2>
          <NeoButton
            size="sm"
            variant="secondary"
            onClick={() => setAboutPreview(!aboutPreview)}
          >
            {aboutPreview ? "编辑" : "预览"}
          </NeoButton>
        </div>
        <p className={styles.hint}>
          自定义「关于」页面内容（支持完整 HTML）。留空则使用默认内容。
        </p>
        {aboutPreview ? (
          <div
            className={styles.aboutPreview}
            dangerouslySetInnerHTML={{ __html: aboutHtml }}
          />
        ) : (
          <textarea
            className={styles.textarea}
            value={aboutHtml}
            onChange={(e) => setAboutHtml(e.target.value)}
            rows={16}
            placeholder="<h1>自定义关于页面</h1>\n<p>输入任意 HTML 内容...</p>"
            aria-label="关于页面 HTML"
          />
        )}
      </section>

      {/* Prompt Examples Editor */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>推荐问题</h2>
          <NeoButton size="sm" variant="secondary" onClick={addPromptExample}>+ 添加</NeoButton>
        </div>
        <p className={styles.hint}>自定义首页搜索框下方的推荐问题。留空则使用默认推荐。</p>
        {promptExamples.map((example, idx) => (
          <div key={idx} className={styles.linkRow}>
            <NeoInput placeholder="图标 emoji" value={example.icon} onChange={(e) => updatePromptExample(idx, "icon", e.target.value)} />
            <NeoInput placeholder="问题文字" value={example.text} onChange={(e) => updatePromptExample(idx, "text", e.target.value)} />
            <NeoButton size="sm" variant="danger" onClick={() => removePromptExample(idx)}>删除</NeoButton>
          </div>
        ))}
        {promptExamples.length === 0 && <p className={styles.hint}>没有推荐问题。点击「+ 添加」来创建。</p>}
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
