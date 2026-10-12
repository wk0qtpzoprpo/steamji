// 当前用户信息（含配额使用情况与订阅有效期）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok } from "../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const row = await env.DB.prepare(
    "SELECT id, username, role, quota, subscription_expires_at, subscription_status, created_at FROM users WHERE id = ?"
  ).bind(user.id).first();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM steam_accounts WHERE user_id = ?"
  ).bind(user.id).first<{ c: number }>();

  return ok({
    user: row,
    account_count: count?.c ?? 0,
  });
};
