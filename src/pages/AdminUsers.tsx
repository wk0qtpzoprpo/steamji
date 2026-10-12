// 管理员：用户管理（配额 / 重置密码 / 禁用 / 启用）
import { useEffect, useState } from "react";
import { api, postJson, ApiError } from "../lib/api";

interface User {
  id: number;
  username: string;
  role: string;
  quota: number;
  status: string;
  subscription_expires_at: string | null;
  subscription_status: string;
  account_count: number;
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      setUsers(await api<User[]>("/api/admin/users"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function action(userId: number, action: "set_quota" | "reset_password" | "disable" | "enable", extra?: { quota?: number; new_password?: string }) {
    setMsg("");
    setError("");
    if (action === "set_quota") {
      const quota = window.prompt("新的账号配额：", "2");
      if (quota === null) return;
      extra = { quota: Number(quota) };
    }
    if (action === "reset_password") {
      const pwd = window.prompt("新密码（至少 6 位）：");
      if (pwd === null) return;
      extra = { new_password: pwd };
    }
    try {
      const r = await postJson<{ quota?: number }>("/api/admin/users", { user_id: userId, action, ...extra });
      setMsg(r.quota !== undefined ? `已更新配额为 ${r.quota}` : "操作成功");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失败");
    }
  }

  return (
    <div>
      <h1>用户管理</h1>
      <div className="sub">管理普通用户的配额、密码与状态</div>

      {error && <div className="err">{error}</div>}
      {msg && <div className="ok">{msg}</div>}

      <div className="card">
        {users.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>暂无用户。</div>
        ) : (
          <table>
            <thead>
              <tr><th>用户名</th><th>角色</th><th>配额</th><th>账号数</th><th>订阅状态</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.role === "admin" ? "管理员" : "普通用户"}</td>
                  <td>{u.role === "admin" ? "—" : `${u.account_count}/${u.quota}`}</td>
                  <td>{u.account_count}</td>
                  <td>
                    {u.role === "admin" ? (
                      <span className="badge badge-muted">永久</span>
                    ) : (
                      <span className={`badge ${u.subscription_status === "active" ? "badge-online" : "badge-offline"}`}>
                        {u.subscription_status === "active" && u.subscription_expires_at
                          ? `至 ${new Date(u.subscription_expires_at).toLocaleDateString()}`
                          : u.subscription_status === "active" ? "永久" : "已到期"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.status === "active" ? "badge-online" : "badge-muted"}`}>{u.status}</span>
                  </td>
                  <td>
                    {u.role !== "admin" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => void action(u.id, "set_quota")}>配额</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => void action(u.id, "reset_password")}>重置密码</button>
                        {u.status === "active" ? (
                          <button className="btn btn-sm btn-danger" onClick={() => void action(u.id, "disable")}>禁用</button>
                        ) : (
                          <button className="btn btn-sm" onClick={() => void action(u.id, "enable")}>启用</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
