// 取消挂时长：bot 在线则 resume 恢复自动挂卡；重启中（pending）则仅标记结束
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { readBotState, callAsfCommand } from "../../lib/asf.ts";
import { parseJson } from "../../lib/http.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const body = await parseJson<{ account_id?: number }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const accountId = Number(body.account_id || 0);
  if (!accountId) return fail("缺少 account_id");

  const session = await env.DB.prepare(
    user.role === "admin"
      ? "SELECT * FROM play_sessions WHERE account_id = ? AND status IN ('pending','active') LIMIT 1"
      : "SELECT * FROM play_sessions WHERE account_id = ? AND user_id = ? AND status IN ('pending','active') LIMIT 1"
  ).bind(accountId, ...(user.role === "admin" ? [] : [user.id])).first<{
    id: number; bot_name: string; server_id: number; status: string;
  }>();
  if (!session) return fail("当前没有挂时长会话");

  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(session.server_id).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);

  // bot 在线时 resume（重启中/离线则跳过，仅结束会话，避免 play 残留）
  if (server.status === "online") {
    const st = await readBotState(env, server, session.bot_name);
    if (st?.online) {
      const cmd = await callAsfCommand(env, server, "Api/Command", "POST", { Command: `resume ${session.bot_name}` });
      if (!cmd.ok) {
        return fail(cmd.message || "ASF 执行 resume 失败，请稍后重试", 502);
      }
    }
  }

  await env.DB.prepare(
    "UPDATE play_sessions SET status = 'ended', ended_at = ? WHERE id = ?"
  ).bind(new Date().toISOString(), session.id).run();

  return ok(null, "已结束挂时长，恢复自动挂卡");
};
