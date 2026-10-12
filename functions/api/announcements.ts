// 公告（用户端只读）：GET 返回最新 5 条，按时间倒序
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok } from "../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await env.DB.prepare(
    "SELECT id, content, created_at FROM announcements ORDER BY id DESC LIMIT 5"
  ).all();
  return ok(rows.results);
};
