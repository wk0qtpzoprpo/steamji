// 管理员：月卡（邀请码）管理
import { useEffect, useState } from "react";
import { api, postJson, ApiError } from "../lib/api";

interface Card {
  id: number;
  code: string;
  duration_days: number;
  role: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  status: string;
  remark: string | null;
  created_by_name: string | null;
  created_at: string;
}

export default function AdminCards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [durationDays, setDurationDays] = useState(30);
  const [maxUses, setMaxUses] = useState(1);
  const [role, setRole] = useState("user");
  const [expiresAt, setExpiresAt] = useState("");
  const [remark, setRemark] = useState("");
  const [created, setCreated] = useState<Card | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setCards(await api<Card[]>("/api/invites"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreated(null);
    setError("");
    setCreating(true);
    try {
      const card = await postJson<Card>("/api/invites", {
        duration_days: durationDays,
        max_uses: maxUses,
        role,
        expires_at: expiresAt || undefined,
        remark,
      });
      setCreated(card);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  function copyCode(code: string) {
    void navigator.clipboard?.writeText(code);
    alert("月卡码已复制：" + code);
  }

  // 激活状态：已激活（有使用记录）/ 未激活（无使用记录）/ 已作废（状态非 active）
  function activationOf(c: Card): { text: string; cls: string } {
    if (c.status !== "active") return { text: "已作废", cls: "badge-offline" };
    return c.used_count > 0 ? { text: "已激活", cls: "badge-online" } : { text: "未激活", cls: "badge-muted" };
  }

  const inactiveCards = cards.filter((c) => c.used_count === 0);
  const activeCards = cards.filter((c) => c.used_count > 0);

  function cardTable(rows: Card[]) {
    return (
      <table>
        <thead>
          <tr><th>月卡码</th><th>时长</th><th>用量</th><th>角色</th><th>卡有效期</th><th>是否已激活</th><th>备注</th><th>创建人</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const act = activationOf(c);
            return (
              <tr key={c.id}>
                <td className="mono">{c.code}</td>
                <td>{c.duration_days} 天</td>
                <td>{c.used_count}/{c.max_uses}</td>
                <td>{c.role === "admin" ? "管理员" : "普通"}</td>
                <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "不限"}</td>
                <td>
                  <span className={`badge ${act.cls}`}>{act.text}</span>
                </td>
                <td>{c.remark ?? "—"}</td>
                <td>{c.created_by_name ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <h1>月卡管理</h1>
      <div className="sub">月卡即邀请码：注册时必填，也可用于续期（顺延有效期）</div>

      {error && <div className="err">{error}</div>}

      {created && (
        <div className="card" style={{ borderColor: "#bbf7d0", background: "#f0fdf4", marginBottom: 12 }}>
          <b>月卡已创建：</b>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{created.code}</span>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
            时长 {created.duration_days} 天 · 可用 {created.max_uses} 次 · 角色 {created.role}
            {created.expires_at && <> · 卡有效期至 {new Date(created.expires_at).toLocaleDateString()}</>}
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => copyCode(created.code)} style={{ marginTop: 8 }}>复制</button>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>创建月卡</h2>
        <form className="form" onSubmit={create} style={{ marginLeft: 0, maxWidth: 560 }}>
          <label>服务时长（天）</label>
          <input type="number" min={1} max={3650} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} />
          <label>可使用次数</label>
          <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          <label>授予角色</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
          <label>卡有效期（可选，最晚激活时间）</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          <label>备注</label>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} />
          <button className="btn" disabled={creating}>{creating ? "创建中…" : "创建月卡"}</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>未激活（{inactiveCards.length}）</h2>
        {loading ? (
          <div style={{ color: "var(--muted)" }}>加载中…</div>
        ) : inactiveCards.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>没有未激活的月卡。</div>
        ) : (
          cardTable(inactiveCards)
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>已激活（{activeCards.length}）</h2>
        {loading ? (
          <div style={{ color: "var(--muted)" }}>加载中…</div>
        ) : activeCards.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>还没有被激活的月卡。</div>
        ) : (
          cardTable(activeCards)
        )}
      </div>
    </div>
  );
}
