// 续期：支持两种调用方式
// 1) 已登录：仅传 invite_code（JWT 已由中间件校验）
// 2) 未登录（服务已到期）：传 {username, password, invite_code}，先校验凭据再续期
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, UserRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { verifyPassword } from "../../lib/crypto.ts";
import { parseJson } from "../../lib/http.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const body = await parseJson<{ invite_code?: string; username?: string; password?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const inviteCode = (body.invite_code || "").trim();
  if (!inviteCode) return fail("缺少月卡邀请码");

  const dataUser = data.user as { id: number; username: string; role: string } | undefined;

  let userId: number;
  if (dataUser) {
    userId = dataUser.id;
  } else {
    const username = (body.username || "").trim();
    const password = body.password || "";
    if (!username || !password) return fail("到期续期需要提供用户名和密码");

    // 与登录共用同一失败限流键（login_fail:{username}）：
    // 否则本接口成为密码爆破旁路——未登录续期直接校验凭据且无锁定
    const failKey = `login_fail:${username}`;
    const fails = Number((await env.KV.get(failKey)) || "0");
    if (fails >= 5) return fail("登录失败次数过多，请 15 分钟后再试", 429);

    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await env.KV.put(failKey, String(fails + 1), { expirationTtl: 15 * 60 });
      return fail("用户名或密码错误", 401);
    }
    await env.KV.delete(failKey);
    if (user.status === "disabled") return fail("账号已被禁用", 403);
    userId = user.id;
  }

  const card = await env.DB.prepare("SELECT * FROM invite_codes WHERE code = ?").bind(inviteCode).first<{
    id: number; duration_days: number; max_uses: number; used_count: number; expires_at: string | null; status: string;
  }>();
  if (!card || card.status !== "active") return fail("邀请码不存在或已作废");
  if (card.expires_at && card.expires_at < new Date().toISOString()) return fail("邀请码已过有效期");

  const consume = await env.DB.prepare(
    `UPDATE invite_codes SET used_count = used_count + 1
     WHERE id = ? AND status = 'active' AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(card.id, new Date().toISOString()).run();
  if (consume.meta.changes === 0) return fail("邀请码已被用完");

  const current = await env.DB.prepare("SELECT subscription_expires_at FROM users WHERE id = ?")
    .bind(userId).first<{ subscription_expires_at: string | null }>();
  const now = Date.now();
  const base = current?.subscription_expires_at && current.subscription_expires_at > new Date(now).toISOString()
    ? new Date(current.subscription_expires_at).getTime()
    : now;
  const newExpires = new Date(base + card.duration_days * 86400_000).toISOString();

  const upd = await env.DB.prepare(
    "UPDATE users SET subscription_expires_at = ?, subscription_status = 'active' WHERE id = ?"
  ).bind(newExpires, userId).run();
  if (upd.meta.changes === 0) {
    await env.DB.prepare("UPDATE invite_codes SET used_count = used_count - 1 WHERE id = ?").bind(card.id).run();
    return fail("续期失败，请重试");
  }

  // 同步槽位级到期：账号级续期后，该用户所有栏位到期时间对齐到新到期
  // （取较晚者，已更长的栏位不动）——消除"能登录但无法挂卡"的双轨割裂
  await env.DB.prepare(
    `UPDATE account_slots SET expires_at = ?
     WHERE user_id = ? AND (expires_at IS NULL OR expires_at < ?)`
  ).bind(newExpires, userId, newExpires).run();

  return ok({ expires_at: newExpires }, "续期成功");
};
