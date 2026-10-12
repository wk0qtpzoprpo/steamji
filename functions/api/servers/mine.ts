// 我的服务器（普通用户：自己账号所在服务器，受限信息）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok } from "../../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { id: number };
  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.name, s.status, s.bot_count
     FROM servers s JOIN steam_accounts a ON a.current_server_id = s.id
     WHERE a.user_id = ? ORDER BY s.id ASC`
  ).bind(user.id).all();
  return ok(rows.results);
};
