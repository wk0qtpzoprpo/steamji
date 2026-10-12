// 迁移记录（仅管理员可见，普通用户不可见）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { requireAdmin } from "../../lib/http.ts";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;

  const url = new URL(request.url);
  const serverId = Number(url.searchParams.get("server_id") || "0");

  const rows = await env.DB.prepare(
    `SELECT m.id, m.account_id, m.action, m.detail, m.created_at,
            a.bot_name, a.steam_username, u.username AS owner,
            fs.name AS from_server, ts.name AS to_server
     FROM migration_logs m
     LEFT JOIN steam_accounts a ON m.account_id = a.id
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN servers fs ON m.from_server = fs.id
     LEFT JOIN servers ts ON m.to_server = ts.id
     ${serverId > 0 ? "WHERE m.from_server = ? OR m.to_server = ?" : ""}
     ORDER BY m.id DESC LIMIT 200`
  ).bind(...(serverId > 0 ? [serverId, serverId] : [])).all();

  return ok(rows.results);
};
