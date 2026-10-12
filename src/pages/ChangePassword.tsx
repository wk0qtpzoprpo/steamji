// 修改密码：原密码 + 新密码 + 确认新密码
import { useState } from "react";
import { postJson, ApiError } from "../lib/api";

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      const data = await postJson<{ Message?: string }>("/api/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setSuccess(data.Message || "密码已修改");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "修改失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-card">
      <h1>修改密码</h1>
      <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
        <label>原密码</label>
        <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoFocus />
        <label>新密码</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <label>确认新密码</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <div className="hint">新密码至少 6 位，不能与原密码相同</div>
        {error && <div className="err">{error}</div>}
        {success && <div className="ok">{success}</div>}
        <button className="btn" disabled={loading}>
          {loading ? "提交中…" : "确认修改"}
        </button>
      </form>
    </div>
  );
}
