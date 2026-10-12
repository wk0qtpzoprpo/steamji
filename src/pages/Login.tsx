// 登录页
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { postJson, ApiError } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // 防止快速重复提交
    setError("");
    setLoading(true);
    try {
      const data = await postJson<{ access_token: string; refresh_token: string; role: string }>(
        "/api/auth/login",
        { username, password }
      );
      login(data.access_token, data.refresh_token);
      nav(data.role === "admin" ? "/admin/servers" : "/console");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>ASF 控制台</h1>
        <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
          <label>用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="err">{error}</div>}
          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? "登录中…" : "登录"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
          <Link to="/register">注册新账号</Link> · <Link to="/renew">服务到期续期</Link>
        </p>
      </div>
    </div>
  );
}
