// 登录成功后立即将账号标记为在线，消除 D1 低频同步（10 分钟）造成的状态滞后
// 仅允许用户标记自己的账号；真实状态由 scheduled 同步任务后续校准
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { parseJson } from "../../lib/http.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const body = await parseJson<{ bot_name?: string }>(request);
  const botName = (body?.bot_name || "").trim();
  if (!botName) return fail("bot_name 不能为空");
  await env.DB.prepare(
    "UPDATE steam_accounts SET status = 'online', auth_state = NULL, login_fail_count = 0 WHERE user_id = ? AND bot_name = ?"
  ).bind(user.id, botName).run();
  return ok({ updated: true });
};
