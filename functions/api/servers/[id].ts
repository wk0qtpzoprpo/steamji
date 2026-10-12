// 服务器详情 / 更新 / 删除（管理员）；普通用户仅可查看自己账号所在服务器（受限）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { encryptData } from "../../lib/crypto.ts";
import { pingAsf, proxyToAsf } from "../../lib/asf.ts";
import { parseJson, requireAdmin } from "../../lib/http.ts";

type Params = { id: string };

export const onRequestGet: PagesFunction<Env, Params> = async ({ env, data, params }) => {
  const user = data.user as { id: number; role: string };
  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(Number(params.id)).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);

  if (user.role !== "admin") {
    // 普通用户：必须在该服务器上有账号才可见
    const mine = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM steam_accounts WHERE user_id = ? AND current_server_id = ?"
    ).bind(user.id, server.id).first<{ c: number }>();
    if (!mine || mine.c === 0) return fail("无权访问该服务器", 403);
    return ok({
      id: server.id,
      name: server.name,
      status: server.status,
      bot_count: server.bot_count,
    });
  }

  // 管理员：服务器详情 + 该服务器上的账号（含迁移状态，供运维使用）
  const accounts = await env.DB.prepare(
    `SELECT a.id, a.bot_name, a.steam_username, a.status, a.migration_status,
            a.current_server_id, a.original_server_id, a.created_at, u.username AS owner
     FROM steam_accounts a LEFT JOIN users u ON a.user_id = u.id
     WHERE a.current_server_id = ? ORDER BY a.id DESC`
  ).bind(server.id).all();

  return ok({
    server: {
      id: server.id,
      name: server.name,
      tunnel_url: server.tunnel_url,
      status: server.status,
      bot_count: server.bot_count,
      offline_since: server.offline_since,
      last_seen: server.last_seen,
      created_at: server.created_at,
    },
    accounts: accounts.results,
  });
};

export const onRequestPut: PagesFunction<Env, Params> = async ({ request, env, data, params }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(Number(params.id)).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);

  let body: { name?: string; tunnel_url?: string; asf_password?: string };
  const parsed = await parseJson<{ name?: string; tunnel_url?: string; asf_password?: string }>(request);
  if (!parsed) return fail("请求体必须是 JSON");
  body = parsed;
  const name = body.name !== undefined ? (body.name || "").trim() : server.name;
  let tunnelUrl = body.tunnel_url !== undefined ? (body.tunnel_url || "").trim() : server.tunnel_url;
  if (tunnelUrl && !/^https?:\/\//.test(tunnelUrl)) tunnelUrl = `https://${tunnelUrl}`;
  tunnelUrl = tunnelUrl.replace(/\/+$/, "");

  let iv = server.asf_password_iv;
  let ct = server.asf_password_ct;
  if (body.asf_password !== undefined) {
    if (body.asf_password.length > 0) {
      const enc = await encryptData(body.asf_password, env.ENCRYPT_KEY);
      iv = enc.iv;
      ct = enc.ct;
    } else {
      iv = null;
      ct = null;
    }
  }

  await env.DB.prepare(
    "UPDATE servers SET name = ?, tunnel_url = ?, asf_password_iv = ?, asf_password_ct = ? WHERE id = ?"
  ).bind(name, tunnelUrl, iv, ct, server.id).run();

  const updated = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(server.id).first<ServerRow>();
  const ping = await pingAsf(env, updated!);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE servers SET status = ?, last_seen = ? WHERE id = ?")
    .bind(ping.alive ? "online" : "offline", ping.alive ? now : null, server.id).run();
  return ok({ id: server.id, name, tunnel_url: tunnelUrl, alive: ping.alive }, "已更新");
};

export const onRequestDelete: PagesFunction<Env, Params> = async ({ env, data, params }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(Number(params.id)).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);

  const active = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM steam_accounts WHERE current_server_id = ?"
  ).bind(server.id).first<{ c: number }>();
  if (active && active.c > 0) return fail("该服务器上仍有账号，请先迁移后再删除", 409);

  await env.DB.prepare("DELETE FROM servers WHERE id = ?").bind(server.id).run();
  return ok(null, "已删除");
};

// 供管理员测试连接
export const onRequestPost: PagesFunction<Env, Params> = async ({ env, data, params }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(Number(params.id)).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);
  const ping = await pingAsf(env, server);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE servers SET status = ?, last_seen = ? WHERE id = ?")
    .bind(ping.alive ? "online" : "offline", ping.alive ? now : null, server.id).run();
  return ok({ alive: ping.alive, version: ping.version }, ping.alive ? "连接正常" : "无法连接");
};
