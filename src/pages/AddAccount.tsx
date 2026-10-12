// 添加 Steam 账号：bot 名称由用户命名，在线状态可选（离线/在线/忙碌/隐身），自动分配到账号数最少的在线服务器
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { postJson, ApiError } from "../lib/api";

const ONLINE_STATUSES = [
  { value: 0, label: "离线" },
  { value: 1, label: "在线" },
  { value: 2, label: "忙碌" },
  { value: 7, label: "隐身" },
];

export default function AddAccount() {
  const nav = useNavigate();
  const [botName, setBotName] = useState("");
  const [steamUsername, setSteamUsername] = useState("");
  const [password, setPassword] = useState("");
  const [onlineStatus, setOnlineStatus] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = await postJson<{ bot_name: string; server_name: string }>("/api/accounts", {
        bot_name: botName,
        steam_username: steamUsername,
        password,
        online_status: onlineStatus,
      });
      setSuccess(`添加成功：${data.bot_name} 已自动分配到服务器「${data.server_name}」`);
      setTimeout(() => nav("/console"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-card">
      <h1>添加 Steam 账号</h1>
      <div className="sub">系统将自动把账号分配到当前账号数最少的在线服务器。</div>
      <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
        <label>Bot 名称（自定义）</label>
        <input value={botName} onChange={(e) => setBotName(e.target.value)} autoFocus />
        <div className="hint">仅允许字母、数字、下划线、连字符，最长 32 字符</div>
        <label>Steam 用户名</label>
        <input value={steamUsername} onChange={(e) => setSteamUsername(e.target.value)} />
        <label>Steam 密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="hint">密码将加密保存，仅用于挂卡与迁移，不会明文存储或回传前端</div>
        <label>在线状态</label>
        <select value={onlineStatus} onChange={(e) => setOnlineStatus(Number(e.target.value))}>
          {ONLINE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="hint">登录 Steam 网络后显示的在线状态，默认离线</div>
        {error && <div className="err">{error}</div>}
        {success && <div className="ok">{success}</div>}
        <button className="btn" disabled={loading}>{loading ? "添加中…" : "添加"}</button>
        <Link to="/console" style={{ marginLeft: 12, fontSize: 13 }}>返回</Link>
      </form>
    </div>
  );
}
