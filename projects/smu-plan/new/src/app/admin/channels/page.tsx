"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  modelMapping: Record<string, string> | null;
  usageCount: number;
  createdAt: string;
}

interface MappingRow {
  from: string;
  to: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formRpm, setFormRpm] = useState("");
  const [formRpd, setFormRpd] = useState("");
  const [formMappings, setFormMappings] = useState<MappingRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadChannels = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/channels");
      const data = await res.json();
      if (data.ok) setChannels(data.data.items);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadChannels(); }, []);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormEnabled(true);
    setFormRpm("");
    setFormRpd("");
    setFormMappings([]);
    setEditId(null);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (ch: Channel) => {
    setFormName(ch.name);
    setFormDesc(ch.description || "");
    setFormEnabled(ch.enabled);
    setFormRpm(ch.rateLimitRpm?.toString() || "");
    setFormRpd(ch.rateLimitRpd?.toString() || "");
    setFormMappings(
      ch.modelMapping
        ? Object.entries(ch.modelMapping).map(([from, to]) => ({ from, to }))
        : []
    );
    setEditId(ch.id);
    setShowForm(true);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { setError("名称不能为空"); return; }

    setSubmitting(true);
    setError("");

    const mapping = formMappings.reduce<Record<string, string>>((acc, row) => {
      if (row.from.trim() && row.to.trim()) acc[row.from.trim()] = row.to.trim();
      return acc;
    }, {});

    const body = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      enabled: formEnabled,
      rateLimitRpm: formRpm ? parseInt(formRpm, 10) : null,
      rateLimitRpd: formRpd ? parseInt(formRpd, 10) : null,
      modelMapping: Object.keys(mapping).length > 0 ? mapping : null,
    };

    try {
      const url = editId ? `/api/admin/channels/${editId}` : "/api/admin/channels";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        resetForm();
        loadChannels();
      } else {
        setError(data.error?.message || "操作失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除渠道 "${name}" 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/channels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) loadChannels();
      else alert(data.error?.message || "删除失败");
    } catch { alert("网络错误"); }
  };

  const handleToggle = async (ch: Channel) => {
    try {
      const res = await fetch(`/api/admin/channels/${ch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !ch.enabled }),
      });
      const data = await res.json();
      if (data.ok) loadChannels();
    } catch {}
  };

  const addMapping = () => setFormMappings([...formMappings, { from: "", to: "" }]);
  const removeMapping = (idx: number) => setFormMappings(formMappings.filter((_, i) => i !== idx));
  const updateMapping = (idx: number, field: "from" | "to", value: string) => {
    const updated = [...formMappings];
    updated[idx][field] = value;
    setFormMappings(updated);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>渠道管理</h1>
        <NeoButton variant="primary" onClick={openCreate}>新建渠道</NeoButton>
      </div>

      {showForm && (
        <div className={styles.formOverlay} onClick={() => { setShowForm(false); resetForm(); }} onKeyDown={(e) => { if (e.key === "Escape") { setShowForm(false); resetForm(); } }}>
          <form className={styles.form} role="dialog" aria-modal="true" aria-label={editId ? "编辑渠道" : "新建渠道"} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h2 className={styles.formTitle}>{editId ? "编辑渠道" : "新建渠道"}</h2>
            {error && <div className={styles.error}>{error}</div>}

            <NeoInput label="渠道名称" value={formName} onChange={(e) => setFormName(e.target.value)} required />
            <NeoInput label="描述" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />

            <div className={styles.row}>
              <NeoInput label="RPM 限速" type="number" value={formRpm} onChange={(e) => setFormRpm(e.target.value)} placeholder="不限" />
              <NeoInput label="RPD 限速" type="number" value={formRpd} onChange={(e) => setFormRpd(e.target.value)} placeholder="不限" />
            </div>

            <label className={styles.checkLabel}>
              <input type="checkbox" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
              启用渠道
            </label>

            <div className={styles.mappingSection}>
              <div className={styles.mappingHeader}>
                <span className={styles.label}>模型映射</span>
                <NeoButton type="button" variant="secondary" size="sm" onClick={addMapping}>+ 添加</NeoButton>
              </div>
              {formMappings.map((row, idx) => (
                <div key={idx} className={styles.mappingRow}>
                  <input className={styles.mappingInput} placeholder="外部模型名" value={row.from} onChange={(e) => updateMapping(idx, "from", e.target.value)} />
                  <span className={styles.arrow}>&rarr;</span>
                  <input className={styles.mappingInput} placeholder="内部模型名" value={row.to} onChange={(e) => updateMapping(idx, "to", e.target.value)} />
                  <NeoButton type="button" variant="danger" size="sm" onClick={() => removeMapping(idx)}>X</NeoButton>
                </div>
              ))}
              {formMappings.length === 0 && <p className={styles.hint}>无映射规则，外部模型名将直接透传</p>}
            </div>

            <div className={styles.formActions}>
              <NeoButton type="submit" variant="primary" isLoading={submitting}>{editId ? "保存" : "创建"}</NeoButton>
              <NeoButton type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>取消</NeoButton>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : channels.length === 0 ? (
        <div className={styles.empty}>暂无渠道</div>
      ) : (
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>名称</th>
              <th>状态</th>
              <th>RPM/RPD</th>
              <th>映射</th>
              <th>用量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.id}>
                <td>
                  <strong>{ch.name}</strong>
                  {ch.description && <br />}
                  {ch.description && <small className={styles.desc}>{ch.description}</small>}
                </td>
                <td>
                  <button role="switch" aria-checked={ch.enabled} className={`${styles.toggle} ${ch.enabled ? styles.on : styles.off}`} onClick={() => handleToggle(ch)}>
                    {ch.enabled ? "ON" : "OFF"}
                  </button>
                </td>
                <td>{ch.rateLimitRpm || "-"} / {ch.rateLimitRpd || "-"}</td>
                <td>{ch.modelMapping ? Object.keys(ch.modelMapping).length + " 条" : "-"}</td>
                <td>{ch.usageCount}</td>
                <td className={styles.actions}>
                  <NeoButton size="sm" variant="secondary" onClick={() => openEdit(ch)}>编辑</NeoButton>
                  <NeoButton size="sm" variant="danger" onClick={() => handleDelete(ch.id, ch.name)}>删除</NeoButton>
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
