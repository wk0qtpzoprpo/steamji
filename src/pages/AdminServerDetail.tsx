// 管理员：服务器详情（编辑 / 测试 / 删除 / 账号列表 / 迁移记录）
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, postJson, putJson, del, ApiError } from "../lib/api";

interface ServerDetail {
  server: {
    id: number;
    name: string;
    tunnel_url: string;
    status: string;
    bot_count: number;
    offline_since: string | null;
    last_seen: string | null;
    created_at: string;
  };
  accounts: Array<{
    id: number;
    bot_name: string;
    steam_username: string;
    status: string;
    migration_status: string;
    original_server_id: number | null;
    owner: string | null;
    created_at: string;
  }>;
}

interface MigrationRow {
  id: number;
  account_id: number;
  bot_name: string | null;
  owner: string | null;
  action: string;
  detail: string | null;
  from_server: string | null;
  to_server: string | null;
  created_at: string;
}

export default function AdminServerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const serverId = Number(id);
  const [data, setData] = useState<ServerDetail | null>(null);
  const [error, setError] = useState("");
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);

  // 编辑表单
  const [name, setName] = useState("");
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [asfPassword, setAsfPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const d = await api<ServerDetail>(`/api/servers/${serverId}`);
      setData(d);
      setName(d.server.name);
      setTunnelUrl(d.server.tunnel_url);
      setAsfPassword("");
      const m = await api<MigrationRow[]>(`/api/admin/migrations?server_id=${serverId}`);
      setMigrations(m);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [serverId]);

  async function testConn() {
    setMsg("");
    try {
      const r = await postJson<{ alive: boolean; version?: string }>(`/api/servers/${serverId}`, {});
      setMsg(r.alive ? `连接正常（ASF ${r.version ?? ""}）` : "无法连接，请检查 Tunnel 与 IPCPassword");
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    try {
      const r = await putJson<{ alive: boolean }>(`/api/servers/${serverId}`, {
        name,
        tunnel_url: tunnelUrl,
        asf_password: asfPassword,
      });
      setMsg(r.alive ? "已保存，连接正常" : "已保存，但暂时无法连接");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    }
  }

  async function remove() {
    if (!window.confirm("确认删除该服务器？其上的账号需先迁移。")) return;
    try {
      await del(`/api/servers/${serverId}`);
      nav("/admin/servers");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <div className="err">{error} <Link to="/admin/servers">返回列表</Link></div>;
  if (!data) return <div className="center">加载中…</div>;

  const s = data.server;

  return (
    <div>
      <h1>{s.name}</h1>
      <div className="sub">
        <span className={`badge ${s.status === "online" ? "badge-online" : "badge-offline"}`}>{s.status === "online" ? "在线" : "离线"}</span>
        {" "}账号数 {s.bot_count}
        {s.offline_since && <> · 离线自 {new Date(s.offline_since).toLocaleString()}</>}
        {s.last_seen && <> · 最近探测 {new Date(s.last_seen).toLocaleString()}</>
        }
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>服务器设置</h2>
        <form className="form" onSubmit={save} style={{ marginLeft: 0, maxWidth: 560 }}>
          <label>服务器名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Tunnel 地址</label>
          <input value={tunnelUrl} onChange={(e) => setTunnelUrl(e.target.value)} required />
          <label>ASF IPCPassword</label>
          <input type="password" value={asfPassword} onChange={(e) => setAsfPassword(e.target.value)} placeholder="留空表示不修改" />
          {msg && <div className="ok">{msg}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="submit">保存</button>
            <button className="btn btn-secondary" type="button" onClick={testConn}>测试连接</button>
            <button className="btn btn-danger" type="button" onClick={remove}>删除服务器</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>本服务器账号（{data.accounts.length}）</h2>
        {data.accounts.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>该服务器上暂无账号。</div>
        ) : (
          <table>
            <thead>
              <tr><th>Bot</th><th>Steam 用户名</th><th>归属用户</th><th>状态</th><th>迁移状态</th></tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.bot_name}</td>
                  <td>{a.steam_username}</td>
                  <td>{a.owner ?? "—"}</td>
                  <td>
                    <span className={`badge ${{ online: "badge-online", offline: "badge-muted", pending: "badge-warn" }[a.status] ?? "badge-muted"}`}>
                      {{ online: "在线", offline: "离线", pending: "等待同步" }[a.status] ?? a.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${a.migration_status === "active" ? "badge-online" : a.migration_status === "migrated" ? "badge-warn" : "badge-muted"}`}>
                      {a.migration_status === "active" ? "正常" : a.migration_status === "migrated" ? "已迁移" : "已禁用"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>迁移记录（仅管理员可见）</h2>
        {migrations.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>暂无迁移记录。</div>
        ) : (
          <table>
            <thead>
              <tr><th>时间</th><th>账号</th><th>操作</th><th>来源 → 目标</th><th>详情</th></tr>
            </thead>
            <tbody>
              {migrations.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString()}</td>
                  <td className="mono">{m.bot_name ?? m.account_id}</td>
                  <td>
                    <span className={`badge ${m.action === "migrate" ? "badge-warn" : m.action === "disable" ? "badge-muted" : "badge-offline"}`}>
                      {m.action}
                    </span>
                  </td>
                  <td>{m.from_server ?? "—"} → {m.to_server ?? "—"}</td>
                  <td>{m.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 12 }}>
        <Link to="/admin/servers" style={{ fontSize: 13 }}>← 返回服务器列表</Link>
      </p>
    </div>
  );
}
