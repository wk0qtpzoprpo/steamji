// ASF IPC 代理：/api/proxy/{serverId}/{path...}
// 权限：管理员全部；普通用户仅限自己账号所在服务器
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../../../lib/db.ts";
import { fail } from "../../../lib/db.ts";
import { proxyToAsf } from "../../../lib/asf.ts";

type Params = { serverId: string; path: string[] };

export const onRequest: PagesFunction<Env, Params> = async ({ request, env, data, params }) => {
  const user = data.user as { id: number; role: string };
  const serverId = Number(params.serverId);
  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(serverId).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);

  if (user.role !== "admin") {
    if (server.status !== "online") return fail("服务器当前离线", 503);
    const mine = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM steam_accounts WHERE user_id = ? AND current_server_id = ?"
    ).bind(user.id, server.id).first<{ c: number }>();
    if (!mine || mine.c === 0) return fail("无权访问该服务器", 403);
  }

  const path = (params.path || []).join("/");
  const search = new URL(request.url).search;
  const targetPath = path + search;

  // 挂卡启动强制校验：无可用时间/已到期的账户禁止 Start（防止绕过前端直接调 API）；时长取栏位
  const startMatch = /^Api\/Bot\/([^/]+)\/Start$/.exec(path);
  if (request.method === "POST" && startMatch) {
    const botName = decodeURIComponent(startMatch[1]);
    if (user.role === "admin") {
      // 管理员：仍校验库内有归属记录的账户；无记录（自建测试 bot）放行
      const acc = await env.DB.prepare(
        `SELECT s.expires_at FROM steam_accounts a
         LEFT JOIN account_slots s ON a.slot_id = s.id
         WHERE a.current_server_id = ? AND a.bot_name = ?`
      ).bind(serverId, botName).first<{ expires_at: string | null }>();
      if (acc && (!acc.expires_at || new Date(acc.expires_at).getTime() < Date.now())) {
        return fail(acc.expires_at ? "该账户使用时间已到期，请先兑换卡密" : "该账户暂无可用时间，请先兑换卡密", 409);
      }
    } else {
      const acc = await env.DB.prepare(
        `SELECT s.expires_at FROM steam_accounts a
         LEFT JOIN account_slots s ON a.slot_id = s.id
         WHERE a.current_server_id = ? AND a.bot_name = ? AND a.user_id = ?`
      ).bind(serverId, botName, user.id).first<{ expires_at: string | null }>();
      if (!acc) return fail("无权操作该 Bot", 403);
      if (!acc.expires_at || new Date(acc.expires_at).getTime() < Date.now()) {
        return fail(acc.expires_at ? "该账户使用时间已到期，请先兑换卡密" : "该账户暂无可用时间，请先兑换卡密", 409);
      }
    }
  }

  const method = request.method;
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    try {
      body = await request.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const resp = await proxyToAsf(env, server, targetPath, { method, headers, body });

  const outHeaders = new Headers();
  const respType = resp.headers.get("Content-Type") || "application/json";
  outHeaders.set("Content-Type", respType);
  // WebSocket 不支持代理时降级：NLog 轮询用 File 端点，不依赖 WS
  return new Response(resp.body, { status: resp.status, headers: outHeaders });
};
