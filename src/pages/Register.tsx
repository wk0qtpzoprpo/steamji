// 注册页：免费注册（无需邀请码），注册后配额为 0，需兑换卡密获得账户额度/时长
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { postJson, ApiError } from "../lib/api";

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await postJson<{ access_token: string; refresh_token: string; role: string }>("/api/auth/register", {
        username,
        password,
      });
      login(data.access_token, data.refresh_token);
      nav(data.role === "admin" ? "/admin/servers" : "/console");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>注册</h1>
        <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
          <label>用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <div className="hint">用户名需超过 6 位</div>
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="hint">密码需超过 8 位，且同时包含字母和数字</div>
          <div className="hint">免费注册，无需邀请码。注册后默认可添加 2 个账号，初始状态为「无可用时间」，可在「兑换卡密」中增加</div>
          {error && <div className="err">{error}</div>}
          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? "注册中…" : "注册"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
          <Link to="/login">已有账号？去登录</Link>
        </p>
      </div>
    </div>
  );
}
