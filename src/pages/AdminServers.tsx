// 管理员：服务器卡片网格 + 添加服务器
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, postJson, ApiError } from "../lib/api";

interface Server {
  id: number;
  name: string;
  tunnel_url: string;
  status: string;
  bot_count: number;
  offline_since: string | null;
  last_seen: string | null;
  created_at: string;
}

export default function AdminServers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 添加表单
  const [name, setName] = useState("");
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [asfPassword, setAsfPassword] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setServers(await api<Server[]>("/api/servers"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addServer(e: React.FormEvent) {
    e.preventDefault();
    setAddMsg("");
    setError("");
    setAdding(true);
    try {
      const data = await postJson<{ name: string; alive: boolean }>("/api/servers", {
        name,
        tunnel_url: tunnelUrl,
        asf_password: asfPassword,
      });
      setAddMsg(data.alive ? `「${data.name}」已添加并成功连接 ASF` : `「${data.name}」已添加，但暂时无法连接 ASF（请检查 Tunnel 与 IPCPassword）`);
      setName("");
      setTunnelUrl("");
      setAsfPassword("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <h1>服务器管理</h1>
      <div className="sub">点击卡片查看账号详情（实时连接 ASF 数据）</div>

      {error && <div className="err">{error}</div>}
      {loading ? (
        <div className="center" style={{ minHeight: 120 }}>加载中…</div>
      ) : servers.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)" }}>还没有服务器，请先在下方添加。</div>
      ) : (
        <div className="grid">
          {servers.map((s) => (
            <Link key={s.id} to={`/admin/servers/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card server-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="name">{s.name}</span>
                  <span className={`badge ${s.status === "online" ? "badge-online" : "badge-offline"}`}>
                    {s.status === "online" ? "在线" : "离线"}
                  </span>
                </div>
                <div className="meta mono">{s.tunnel_url}</div>
                <div className="meta">
                  账号数 <b>{s.bot_count}</b>
                  {s.status === "offline" && s.offline_since && (
                    <> · 离线自 {new Date(s.offline_since).toLocaleString()}</>
                  )}
                  {s.last_seen && <> · 最近探测 {new Date(s.last_seen).toLocaleTimeString()}</>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>添加服务器</h2>
        <div className="sub">Tunnel 地址即 cloudflared 为该服务器分配的 https 域名（指向 localhost:1242）</div>
        <form className="form" onSubmit={addServer} style={{ marginLeft: 0, maxWidth: 560 }}>
          <label>服务器名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Tunnel 地址</label>
          <input value={tunnelUrl} onChange={(e) => setTunnelUrl(e.target.value)} placeholder="https://asf-a.example.com" required />
          <label>ASF IPCPassword（可选）</label>
          <input type="password" value={asfPassword} onChange={(e) => setAsfPassword(e.target.value)} />
          <div className="hint">ASF.json 中配置的 IPCPassword，将加密存储，仅服务端代理使用</div>
          {addMsg && <div className="ok">{addMsg}</div>}
          <button className="btn" disabled={adding}>{adding ? "添加中…" : "添加并测试连接"}</button>
        </form>
      </div>
    </div>
  );
}
