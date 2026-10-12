// 续期页：服务到期后，输入 用户名 + 密码 + 月卡码 续期（到期仅禁登录，bot 保留）
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { postJson, ApiError } from "../lib/api";

export default function Renew() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = await postJson<{ expires_at: string }>("/api/auth/renew", {
        username,
        password,
        invite_code: inviteCode,
      });
      setSuccess(`续期成功，有效期至 ${new Date(data.expires_at).toLocaleString()}`);
      setTimeout(() => nav("/login"), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "续期失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>服务续期</h1>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>
          服务到期后仅禁止登录，挂机服务保留。续期后即可恢复登录。
        </p>
        <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
          <label>用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label>月卡邀请码</label>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          {error && <div className="err">{error}</div>}
          {success && <div className="ok">{success}</div>}
          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? "续期中…" : "续期"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
          <Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
