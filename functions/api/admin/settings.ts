// 系统设置（仅管理员）：GET 全部设置 / PUT 更新购买渠道等
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);
  const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
  const map: Record<string, string> = {};
  for (const r of rows.results as { key: string; value: string }[]) map[r.key] = r.value;
  return ok(map);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);
  let body: { purchase_channel?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const channel = (body.purchase_channel || "").trim().slice(0, 60);
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('purchase_channel', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(channel).run();
  return ok({ purchase_channel: channel }, "已保存");
};
