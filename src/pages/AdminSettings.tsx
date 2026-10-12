// 系统设置（仅管理员）：卡密购买渠道名称
import { useEffect, useState } from "react";
import { api, putJson, ApiError } from "../lib/api";

export default function AdminSettings() {
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Record<string, string>>("/api/admin/settings")
      .then((m) => {
        setChannel(m.purchase_channel || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setSaving(true);
    try {
      await putJson<{ purchase_channel: string }>("/api/admin/settings", { purchase_channel: channel });
      setMsg("已保存，兑换卡密页面将显示该购买渠道");
    } catch (err) {
      setErr(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-card">
      <h1>系统设置</h1>
      <form className="form" onSubmit={save} style={{ marginLeft: 0 }}>
        <label>卡密购买渠道</label>
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="如：淘宝店铺 / 微信客服 / 官网"
          maxLength={60}
        />
        <div className="hint">兑换卡密页面底部将显示「如无卡密请前往【{channel || "购买渠道"}】购买」，留空则显示「联系管理员」</div>
        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <button className="btn" disabled={saving || loading}>
          {saving ? "保存中…" : "保存"}
        </button>
      </form>
    </div>
  );
}
