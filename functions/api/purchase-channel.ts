// 卡密购买渠道（公开读）：GET /api/purchase-channel
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok } from "../lib/db.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  // 需登录（data.user 由中间件注入）；渠道名未设置时返回 null，前端显示默认文案
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'purchase_channel'")
    .first<{ value: string }>();
  return ok({ purchase_channel: row?.value || null });
};
