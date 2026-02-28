"use client";

import { useEffect, useState, useCallback } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import Badge from "@/components/atoms/Badge";
import styles from "../audit/page.module.css";

interface UserItem {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.ok) setUsers(data.data.users);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleChangeRole = async (id: string, newRole: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (data.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, role: newRole } : u))
      );
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "banned" : "active";
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: newStatus } : u))
      );
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "error" as const;
      case "editor":
        return "warning" as const;
      default:
        return "mint" as const;
    }
  };

  const statusColor = (status: string) => {
    return status === "active" ? ("success" as const) : ("error" as const);
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>用户管理</h1>
      </div>

      <div className={styles.form}>
        <div className={styles.formRow}>
          <NeoInput
            label="搜索用户"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入用户名搜索..."
          />
          <NeoButton onClick={loadUsers} disabled={loading}>
            搜索
          </NeoButton>
        </div>
      </div>

      <div className={styles.section}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>用户名</th>
              <th>邮箱</th>
              <th>昵称</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 600 }}>{user.username}</td>
                <td className={styles.mono}>{user.email || "—"}</td>
                <td>{user.nickname || "—"}</td>
                <td>
                  <Badge text={user.role} colorVariant={roleColor(user.role)} />
                </td>
                <td>
                  <Badge
                    text={user.status === "active" ? "正常" : "封禁"}
                    colorVariant={statusColor(user.status)}
                  />
                </td>
                <td>
                  {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {user.role !== "admin" && (
                      <NeoButton
                        size="sm"
                        variant="primary"
                        onClick={() => handleChangeRole(user.id, "admin")}
                      >
                        设为管理
                      </NeoButton>
                    )}
                    {user.role !== "editor" && (
                      <NeoButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handleChangeRole(user.id, "editor")}
                      >
                        设为编辑
                      </NeoButton>
                    )}
                    {user.role !== "contributor" && (
                      <NeoButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handleChangeRole(user.id, "contributor")}
                      >
                        设为用户
                      </NeoButton>
                    )}
                    <NeoButton
                      size="sm"
                      variant={user.status === "active" ? "danger" : "primary"}
                      onClick={() => handleToggleStatus(user.id, user.status)}
                    >
                      {user.status === "active" ? "封禁" : "解封"}
                    </NeoButton>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  style={{ textAlign: "center", color: "var(--text-muted)" }}
                >
                  暂无用户数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
