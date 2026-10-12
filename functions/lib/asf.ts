// ASF IPC 代理转发：解密服务器密码并转发请求
import type { Env, ServerRow } from "./db.ts";
import { decryptData } from "./crypto.ts";

export interface BotInfo {
  botName: string;
  enabled: boolean;
  online: boolean;
  playing: boolean;
  cardsRemaining: number | null;
  gamesRemaining: number | null;
}

export async function proxyToAsf(
  env: Env,
  server: ServerRow,
  targetPathWithQuery: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = server.tunnel_url.replace(/\/+$/, "");
  let target = base;
  if (targetPathWithQuery) {
    target = `${base}/${targetPathWithQuery.replace(/^\//, "")}`;
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json, text/plain, */*");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (server.asf_password_iv && server.asf_password_ct) {
    const password = await decryptData(
      { iv: server.asf_password_iv, ct: server.asf_password_ct },
      env.ENCRYPT_KEY
    );
    headers.set("Authentication", password);
  }
  try {
    return await fetch(target, { ...init, headers });
  } catch {
    return new Response(
      JSON.stringify({ Success: false, Message: "ASF 服务器不可达（Tunnel 或 ASF 进程可能离线）" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

// 从 GET /Api/ASF 响应中读取版本号用于健康检查
export async function pingAsf(env: Env, server: ServerRow): Promise<{ alive: boolean; version?: string }> {
  try {
    const resp = await proxyToAsf(env, server, "Api/ASF", { method: "GET" });
    if (!resp.ok) return { alive: false };
    const data = (await resp.json()) as { Success?: boolean; Result?: { Version?: string } };
    if (data.Success === false) return { alive: false };
    return { alive: true, version: data.Result?.Version };
  } catch {
    return { alive: false };
  }
}
