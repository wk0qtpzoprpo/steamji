// 兑换卡密：输入卡密，选择要延长时间的栏位（槽位）
// 卡密时长绑定栏位：删除栏位上的账户后，新添加的账户绑定同一栏位自动继承剩余时长
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { postJson, api, ApiError } from "../lib/api";

interface Slot {
  id: number;
  slot_index: number;
  expires_at: string | null;
  bot_name: string | null;
  account_id: number | null;
}

export default function Redeem() {
  const { reload } = useAuth();
  const [code, setCode] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState<string>("");
  const [channel, setChannel] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Slot[]>("/api/slots").then((rows) => {
      setSlots(rows);
      if (rows.length > 0) setSlotId(String(rows[0].id));
    }).catch(() => setSlots([]));
    api<{ purchase_channel: string | null }>("/api/purchase-channel")
      .then((r) => setChannel(r.purchase_channel))
      .catch(() => setChannel(null));
  }, []);

  function slotLabel(s: Slot) {
    const name = s.bot_name ? `栏位 #${s.slot_index}（${s.bot_name}）` : `栏位 #${s.slot_index}（空栏位）`;
    const time = s.expires_at ? `至 ${s.expires_at.slice(0, 10)}` : "无可用时间";
    return `${name} · ${time}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult("");
    setLoading(true);
    try {
      if (!slotId) {
        setError("请选择要延长时间的栏位");
        setLoading(false);
        return;
      }
      const data = await postJson<{ duration_days: number; slot_id?: number; expires_at: string | null }>("/api/redeem", {
        code,
        slot_id: Number(slotId),
      });
      const slot = slots.find((s) => s.id === data.slot_id);
      const name = slot ? (slot.bot_name ? `「${slot.bot_name}」` : "空栏位") : "";
      setResult(`兑换成功：栏位 #${slot?.slot_index ?? ""}${name}使用时间已延长 ${data.duration_days} 天，至 ${(data.expires_at ?? "").slice(0, 10)}`);
      setCode("");
      void reload();
      // 刷新栏位状态
      api<Slot[]>("/api/slots").then((rows) => setSlots(rows)).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "兑换失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-card">
      <h1>兑换卡密</h1>
      <form className="form" onSubmit={submit} style={{ marginLeft: 0 }}>
        <label>卡密</label>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
        <label>选择栏位</label>
        {slots.length === 0 ? (
          <div className="hint">暂无可延长时间的栏位，请先到「我的账号」添加 Steam 账户</div>
        ) : (
          <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {slotLabel(s)}
              </option>
            ))}
          </select>
        )}
        {error && <div className="err">{error}</div>}
        {result && <div className="ok">{result}</div>}
        <button className="btn" disabled={loading || !code.trim() || !slotId}>
          {loading ? "兑换中…" : "兑换"}
        </button>
      </form>

      {/* 购买渠道提示 */}
      <p className="redeem-buy">
        如无卡密请前往<strong style={{ color: "var(--primary)" }}>{channel || "联系管理员"}</strong>购买
      </p>

      {/* 说明 */}
      <div className="redeem-note">
        <div><strong style={{ color: "var(--text)" }}>兑换说明</strong></div>
        <div>· 卡密为月卡制，每个卡密仅可使用一次，有效期与剩余次数以卡密状态为准。</div>
        <div>· 使用时间绑定栏位而非账户：为某栏位续费后，删除该栏位上的账户，再添加新账户会自动继承该栏位的剩余时长，无需重新续费。</div>
        <div>· 选择栏位后，从该栏位当前到期（或今天）起向后延长，可重复累积；空栏位也可直接续费备用。</div>
        <div>· 新注册用户默认可添加 2 个 Steam 账户，初始状态为「无可用时间」；兑换卡密后即可开始挂卡。</div>
        <div>· 使用时间到期后仅停止挂卡、账户保留；再次兑换卡密即可恢复挂卡。</div>
      </div>
    </div>
  );
}
