// 卡密兑换：POST { code, slot_id }
// 卡密时长绑定「栏位（槽位）」：为指定栏位延长时间（account_slots.expires_at + duration_days）
// 删除该栏位上的账户后，新添加的账户绑定同一栏位时自动继承剩余时长
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import { parseJson } from "../lib/http.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };

  const body = await parseJson<{ code?: string; slot_id?: number }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const code = (body.code || "").trim().toUpperCase();
  if (!code) return fail("请输入卡密");

  const slotId = Number(body.slot_id);
  if (!Number.isInteger(slotId) || slotId <= 0) return fail("请选择要延长的时间栏位");

  const slot = await env.DB.prepare("SELECT * FROM account_slots WHERE id = ? AND user_id = ?")
    .bind(slotId, user.id).first<{ id: number; slot_index: number; expires_at: string | null }>();
  if (!slot) return fail("栏位不存在或不属于当前用户");

  // 栏位上绑定的账户（用于提示，可空）
  const boundAcc = await env.DB.prepare(
    "SELECT bot_name FROM steam_accounts WHERE slot_id = ? AND user_id = ? LIMIT 1"
  ).bind(slotId, user.id).first<{ bot_name: string }>();

  const card = await env.DB.prepare(
    "SELECT * FROM invite_codes WHERE code = ?"
  ).bind(code).first<{
    id: number; duration_days: number; max_uses: number; used_count: number;
    expires_at: string | null; status: string;
  }>();
  if (!card || card.status !== "active") return fail("卡密不存在或已作废");
  if (card.expires_at && card.expires_at < new Date().toISOString()) return fail("卡密已过有效期");

  // 原子占用一张卡（防并发超用）
  const consume = await env.DB.prepare(
    `UPDATE invite_codes SET used_count = used_count + 1
     WHERE id = ? AND status = 'active' AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(card.id, new Date().toISOString()).run();
  if (consume.meta.changes === 0) return fail("卡密已被用完");

  try {
    const now = new Date();
    // 从当前或已有到期（取较晚者）向后延长
    const baseMs = slot.expires_at
      ? Math.max(now.getTime(), new Date(slot.expires_at).getTime())
      : now.getTime();
    const newExpiresAt = new Date(baseMs + card.duration_days * 86400_000).toISOString();
    await env.DB.prepare("UPDATE account_slots SET expires_at = ? WHERE id = ?")
      .bind(newExpiresAt, slotId).run();

    // 同步账号级状态：槽位续期后账号恢复 active，
    // 账号级到期时间与槽位新到期取较晚者——消除"槽位有时长但登不上"的双轨割裂
    const cur = await env.DB.prepare("SELECT subscription_expires_at FROM users WHERE id = ?")
      .bind(user.id).first<{ subscription_expires_at: string | null }>();
    const accBaseMs = cur?.subscription_expires_at && cur.subscription_expires_at > new Date().toISOString()
      ? new Date(cur.subscription_expires_at).getTime()
      : Date.now();
    const aligned = new Date(Math.max(accBaseMs, new Date(newExpiresAt).getTime())).toISOString();
    await env.DB.prepare("UPDATE users SET subscription_expires_at = ?, subscription_status = 'active' WHERE id = ?")
      .bind(aligned, user.id).run();

    return ok(
      { duration_days: card.duration_days, slot_id: slotId, expires_at: newExpiresAt },
      `兑换成功：栏位 #${slot.slot_index}${boundAcc ? `（${boundAcc.bot_name}）` : "（空栏位）"}使用时间已延长 ${card.duration_days} 天`
    );
  } catch {
    // 回补卡用量
    await env.DB.prepare("UPDATE invite_codes SET used_count = used_count - 1 WHERE id = ?").bind(card.id).run();
    return fail("兑换失败，请稍后重试");
  }
};
