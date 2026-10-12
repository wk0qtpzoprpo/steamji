// 登出：作废 refresh token（access 短时效自然过期）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { refresh_token?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const token = (body.refresh_token || "").trim();
  if (token) {
    await env.KV.delete(`refresh:${token}`);
  }
  return ok(null, "已登出");
};
