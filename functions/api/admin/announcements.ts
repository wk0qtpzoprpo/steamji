// 公告管理（仅管理员）：GET 全量列表 / POST 发布纯文字公告
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { parseJson, requireAdmin } from "../../lib/http.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const rows = await env.DB.prepare(
    "SELECT id, content, created_at, updated_at FROM announcements ORDER BY id DESC LIMIT 200"
  ).all();
  return ok(rows.results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const body = await parseJson<{ content?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const content = (body.content || "").trim();
  if (!content) return fail("公告内容不能为空");
  if (content.length > 500) return fail("公告内容最多 500 字");

  const ins = await env.DB.prepare(
    "INSERT INTO announcements (content) VALUES (?)"
  ).bind(content).run();
  return ok({ id: ins.meta.last_row_id, content }, "公告已发布");
};
