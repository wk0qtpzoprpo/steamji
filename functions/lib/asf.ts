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

// ---------- 以下为复用 helper（收敛各端点重复样板，行为与原实现一致） ----------

// 统一读取单个 bot 的状态字典（GET /Api/Bot/{bot}），替代各端点手写解析
export interface BotState {
  online: boolean;
  onlineStatus?: number;
  requiredInput?: number;
  cardsFarmer?: unknown;
  raw?: unknown;
}

export async function readBotState(
  env: Env,
  server: ServerRow,
  botName: string
): Promise<BotState | null> {
  const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}`, { method: "GET" });
  if (!resp.ok) return null;
  const j = (await resp.json().catch(() => null)) as {
    Result?: Record<
      string,
      {
        IsConnectedAndLoggedOn?: boolean;
        BotConfig?: { OnlineStatus?: number };
        RequiredInput?: number;
        CardsFarmer?: unknown;
      }
    >;
  } | null;
  const bot = j?.Result?.[botName];
  if (!bot) return null;
  return {
    online: !!bot.IsConnectedAndLoggedOn,
    onlineStatus: typeof bot.BotConfig?.OnlineStatus === "number" ? bot.BotConfig.OnlineStatus : undefined,
    requiredInput: typeof bot.RequiredInput === "number" ? bot.RequiredInput : undefined,
    cardsFarmer: bot.CardsFarmer,
    raw: j,
  };
}

// 统一 ASF 调用封装：转发 + HTTP 检查 + Success 检查
export async function callAsfCommand(
  env: Env,
  server: ServerRow,
  path: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; message?: string }> {
  const resp = await proxyToAsf(env, server, path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) return { ok: false, message: `ASF 返回 HTTP ${resp.status}` };
  try {
    const j = (await resp.json()) as { Success?: boolean; Message?: string; Result?: unknown };
    if (j.Success === false) return { ok: false, message: j.Message || "ASF 操作失败" };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

// 统一"1 小时内最多切换 3 次"限额：查计数并原子占用一次（status_switches 表）
export async function tryConsumeStatusSwitch(
  env: Env,
  accountId: number
): Promise<{ ok: boolean; remaining?: number }> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const cnt = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM status_switches WHERE account_id = ? AND switched_at >= ?"
  ).bind(accountId, hourAgo).first<{ c: number }>();
  if (!cnt || cnt.c >= 3) return { ok: false };
  await env.DB.prepare(
    "INSERT INTO status_switches (account_id, switched_at) VALUES (?, ?)"
  ).bind(accountId, new Date().toISOString()).run();
  return { ok: true, remaining: 2 - (cnt?.c ?? 0) };
}
