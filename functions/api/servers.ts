// 服务器管理（仅管理员）：GET 列表 / POST 创建（立即健康检查）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import { encryptData } from "../lib/crypto.ts";
import { pingAsf } from "../lib/asf.ts";

function sanitizeServer(row: ServerRow) {
  return {
    id: row.id,
    name: row.name,
    tunnel_url: row.tunnel_url,
    status: row.status,
    bot_count: row.bot_count,
    offline_since: row.offline_since,
    last_seen: row.last_seen,
    created_at: row.created_at,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);
  const rows = await env.DB.prepare("SELECT * FROM servers ORDER BY id ASC").all<ServerRow>();
  return ok(rows.results.map(sanitizeServer));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);

  let body: { name?: string; tunnel_url?: string; asf_password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const name = (body.name || "").trim();
  let tunnelUrl = (body.tunnel_url || "").trim();
  if (!name || !tunnelUrl) return fail("服务器名称与 Tunnel 地址不能为空");
  if (!/^https?:\/\//.test(tunnelUrl)) tunnelUrl = `https://${tunnelUrl}`;
  tunnelUrl = tunnelUrl.replace(/\/+$/, "");

  // 密码可选；提供则加密存储
  let iv: string | null = null;
  let ct: string | null = null;
  if (body.asf_password && body.asf_password.length > 0) {
    const enc = await encryptData(body.asf_password, env.ENCRYPT_KEY);
    iv = enc.iv;
    ct = enc.ct;
  }

  try {
    const ins = await env.DB.prepare(
      "INSERT INTO servers (name, tunnel_url, asf_password_iv, asf_password_ct) VALUES (?,?,?,?)"
    ).bind(name, tunnelUrl, iv, ct).run();
    if (ins.meta.changes !== 1) throw new Error("insert failed");
    const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?")
      .bind(ins.meta.last_row_id ?? 0).first<ServerRow>();
    // 立即健康检查
    const ping = await pingAsf(env, server!);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE servers SET status = ?, last_seen = ? WHERE id = ?"
    ).bind(ping.alive ? "online" : "offline", ping.alive ? now : null, server!.id).run();
    return ok({ ...sanitizeServer(server!), alive: ping.alive, version: ping.version }, ping.alive ? "已连接 ASF" : "服务器已添加，但无法连接 ASF");
  } catch {
    return fail("服务器名称可能已存在", 409);
  }
};
