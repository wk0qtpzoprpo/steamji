// 我的栏位（槽位）：GET 返回当前用户全部栏位及绑定账户、到期时间
// 卡密时长绑定栏位而非账户：空栏位也可直接续费，删除账户后新账户继承
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok } from "../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const rows = await env.DB.prepare(
    `SELECT s.id, s.slot_index, s.expires_at,
            (SELECT a.bot_name FROM steam_accounts a WHERE a.slot_id = s.id AND a.user_id = s.user_id LIMIT 1) AS bot_name,
            (SELECT a.id FROM steam_accounts a WHERE a.slot_id = s.id AND a.user_id = s.user_id LIMIT 1) AS account_id
     FROM account_slots s
     WHERE s.user_id = ?
     ORDER BY s.slot_index`
  ).bind(user.id).all();
  return ok(rows.results);
};
