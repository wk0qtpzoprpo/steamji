// 添加 Steam 账户表单（无账号时的引导页）：Bot 名 / Steam 用户名 / 密码
import { useState } from "react";
import { postJson, ApiError } from "../../lib/api";

interface Props {
  quota: number;
  current: number;
  onAdded: () => void;
}

export default function AddAccountForm({ quota, current, onAdded }: Props) {
  const [botName, setBotName] = useState("");
  const [steamUsername, setSteamUsername] = useState("");
  const [password, setPassword] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddMsg("");
    setError("");
    setAdding(true);
    try {
      const data = await postJson<{ id: number; bot_name: string; server_name: string }>("/api/accounts", {
        bot_name: botName,
        steam_username: steamUsername,
        password,
      });
      setAddMsg(`「${data.bot_name}」已添加，分配到服务器「${data.server_name}」`);
      setBotName("");
      setSteamUsername("");
      setPassword("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h1 style={{ marginBottom: 4 }}>添加 Steam 账户</h1>
        <div className="sub">配额 {current}/{quota} · 添加后自动分配到账号数最少的在线服务器</div>
      </div>
      <form className="form" onSubmit={addAccount}>
        <label>Bot 名称（自定义）</label>
        <input value={botName} onChange={(e) => setBotName(e.target.value)} autoFocus />
        <label>Steam 用户名</label>
        <input value={steamUsername} onChange={(e) => setSteamUsername(e.target.value)} />
        <label>Steam 密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="hint">密码加密保存，仅用于挂卡与迁移，不会明文回传</div>
        {error && <div className="err">{error}</div>}
        {addMsg && <div className="ok">{addMsg}</div>}
        <button className="btn" disabled={adding} style={{ width: "100%" }}>
          {adding ? "添加中…" : "添加账户"}
        </button>
      </form>
    </div>
  );
}
