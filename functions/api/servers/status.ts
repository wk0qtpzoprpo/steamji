// 服务器健康状态（管理员后台卡片用）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);
  const rows = await env.DB.prepare(
    "SELECT id, name, status, bot_count, offline_since, last_seen FROM servers ORDER BY id ASC"
  ).all<ServerRow>();
  return ok(rows.results);
};
