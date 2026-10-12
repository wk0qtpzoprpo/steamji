// 挂时长模式：GET 查会话（惰性完成 pending）/ POST 创建（支持 Steam 状态切换，1 小时限 3 次）
// 状态切换流程：更新 BotConfig.OnlineStatus → 重启 bot（Stop+Start）→ 落库 pending → 登录后自动 play
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import { proxyToAsf } from "../lib/asf.ts";
import { decryptData } from "../lib/crypto.ts";

interface PlaySessionRow {
  id: number;
  account_id: number;
  user_id: number;
  bot_name: string;
  server_id: number;
  app_ids: string;
  online_status: number;
  display_name: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
}

function parseAppIds(s: string): number[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function sessionOut(r: PlaySessionRow) {
  return {
    id: r.id,
    account_id: r.account_id,
    bot_name: r.bot_name,
    server_id: r.server_id,
    app_ids: parseAppIds(r.app_ids),
    online_status: r.online_status,
    display_name: r.display_name,
    started_at: r.started_at,
    status: r.status,
  };
}

// 读取 bot 当前配置的 OnlineStatus（ASF IPC GET /Api/Bot/{bot}）
async function getBotOnlineStatus(env: Env, server: ServerRow, botName: string): Promise<number | null> {
  const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}`, { method: "GET" });
  if (!resp.ok) return null;
  const j = (await resp.json().catch(() => null)) as { Result?: Record<string, { BotConfig?: { OnlineStatus?: number } }> } | null;
  const cfg = j?.Result?.[botName]?.BotConfig;
  return typeof cfg?.OnlineStatus === "number" ? cfg.OnlineStatus : null;
}

// 向 ASF 发 play 命令（挂指定游戏；带自定义显示名称时好友看到"正在玩 <名称>"）
async function sendPlay(env: Env, server: ServerRow, botName: string, appIds: number[], displayName?: string | null): Promise<{ ok: boolean; msg: string }> {
  const cmd = displayName
    ? `play ${botName} ${appIds.join(",")} ${displayName}`
    : `play ${botName} ${appIds.join(",")}`;
  const resp = await proxyToAsf(env, server, "Api/Command", {
    method: "POST",
    body: JSON.stringify({ Command: cmd }),
  });
  if (!resp.ok) return { ok: false, msg: "ASF 响应异常" };
  const j = (await resp.json().catch(() => null)) as { Success?: boolean; Message?: string } | null;
  if (j && j.Success === false) return { ok: false, msg: j.Message ?? "ASF 执行 play 失败" };
  return { ok: true, msg: j?.Message ?? "" };
}

// 更新 bot 配置 OnlineStatus 并重启 bot（Stop+Start）
async function switchOnlineStatus(
  env: Env, server: ServerRow, botName: string, steamUsername: string, steamPassword: string, onlineStatus: number
): Promise<{ ok: boolean; msg: string }> {
  const cfgResp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}`, {
    method: "POST",
    body: JSON.stringify({
      BotConfig: {
        Enabled: true,
        SteamLogin: steamUsername,
        SteamPassword: steamPassword,
        OnlineStatus: onlineStatus,
        AutoStart: false,
      },
    }),
  });
  if (!cfgResp.ok) return { ok: false, msg: "更新配置失败（ASF 不可达）" };
  // 触发重启：Stop → Start
  const stopResp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}/Stop`, { method: "POST" });
  if (!stopResp.ok) return { ok: false, msg: "停止 bot 失败" };
  const startResp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}/Start`, { method: "POST" });
  if (!startResp.ok) return { ok: false, msg: "启动 bot 失败" };
  return { ok: true, msg: "" };
}

// 惰性完成 pending 会话：bot 已登录则补发 play
async function settlePending(env: Env, rows: PlaySessionRow[]): Promise<void> {
  for (const r of rows) {
    if (r.status !== "pending") continue;
    const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(r.server_id).first<ServerRow>();
    if (!server) continue;
    const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(r.bot_name)}`, { method: "GET" });
    if (!resp.ok) continue;
    const j = (await resp.json().catch(() => null)) as { Result?: Record<string, { IsConnectedAndLoggedOn?: boolean }> } | null;
    if (!j?.Result?.[r.bot_name]?.IsConnectedAndLoggedOn) continue;
    const res = await sendPlay(env, server, r.bot_name, parseAppIds(r.app_ids), r.display_name);
    if (res.ok) {
      await env.DB.prepare("UPDATE play_sessions SET status = 'active' WHERE id = ? AND status = 'pending'")
        .bind(r.id).run();
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const rows = await env.DB.prepare(
    user.role === "admin"
      ? "SELECT * FROM play_sessions WHERE status IN ('pending','active') ORDER BY id DESC"
      : "SELECT * FROM play_sessions WHERE user_id = ? AND status IN ('pending','active') ORDER BY id DESC"
  ).bind(...(user.role === "admin" ? [] : [user.id])).all<PlaySessionRow>();
  await settlePending(env, rows.results);
  const after = await env.DB.prepare(
    user.role === "admin"
      ? "SELECT * FROM play_sessions WHERE status IN ('pending','active') ORDER BY id DESC"
      : "SELECT * FROM play_sessions WHERE user_id = ? AND status IN ('pending','active') ORDER BY id DESC"
  ).bind(...(user.role === "admin" ? [] : [user.id])).all<PlaySessionRow>();
  return ok(after.results.map(sessionOut));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  try {
    return await handlePost(request, env, user);
  } catch (e) {
    return fail(`内部错误: ${(e as Error).message}`, 500);
  }
};

async function handlePost(request: Request, env: Env, user: { id: number; username: string; role: string }): Promise<Response> {
  let body: { account_id?: number; app_ids?: number[]; online_status?: number; display_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const accountId = Number(body.account_id || 0);
  if (!accountId) return fail("缺少 account_id");

  const rawIds = Array.isArray(body.app_ids) ? body.app_ids : [];
  const appIds = [...new Set(rawIds)].map(Number).filter((x) => Number.isInteger(x) && x > 0);
  if (appIds.length === 0) return fail("请至少填写 1 个 APPID");
  if (appIds.length > 32) return fail("APPID 最多 32 个");

  // 在线状态：0=离线 1=正在游戏中（在线），默认离线
  const onlineStatus = body.online_status === 1 ? 1 : 0;

  // 自定义显示名称（好友看到的"正在玩"文本，可选，最长 60 字符）
  const displayName = (body.display_name || "").trim() || null;
  if (displayName && displayName.length > 60) return fail("显示名称最长 60 字符");

  // 归属校验（管理员可操作任意账户）；时长取栏位（slot）到期时间
  const acc = await env.DB.prepare(
    user.role === "admin"
      ? `SELECT a.*, s.expires_at FROM steam_accounts a
         LEFT JOIN account_slots s ON a.slot_id = s.id WHERE a.id = ?`
      : `SELECT a.*, s.expires_at FROM steam_accounts a
         LEFT JOIN account_slots s ON a.slot_id = s.id WHERE a.id = ? AND a.user_id = ?`
  ).bind(accountId, ...(user.role === "admin" ? [] : [user.id])).first<{
    id: number; user_id: number; bot_name: string; steam_username: string;
    password_iv: string; password_ct: string;
    current_server_id: number | null; expires_at: string | null;
  }>();
  if (!acc) return fail("账户不存在", 404);
  if (acc.current_server_id == null) return fail("账户未分配服务器");

  // 有效期强制校验（无可用时间/已到期禁止挂时长）
  if (!acc.expires_at || new Date(acc.expires_at).getTime() < Date.now()) {
    return fail(acc.expires_at ? "该账户使用时间已到期，请先兑换卡密" : "该账户暂无可用时间，请先兑换卡密", 409);
  }

  const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(acc.current_server_id).first<ServerRow>();
  if (!server) return fail("服务器不存在", 404);
  if (user.role !== "admin" && server.status !== "online") return fail("服务器当前离线", 503);

  // 读取 bot 当前配置的 OnlineStatus
  const curStatus = await getBotOnlineStatus(env, server, acc.bot_name);
  if (curStatus === null) return fail("无法读取 bot 当前状态，请检查 ASF", 502);

  const needSwitch = curStatus !== onlineStatus;
  const now = new Date().toISOString();

  if (needSwitch) {
    // 1 小时切换次数限制（最多 3 次）
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const cnt = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM status_switches WHERE account_id = ? AND switched_at >= ?"
    ).bind(accountId, hourAgo).first<{ c: number }>();
    if (!cnt || cnt.c >= 3) {
      return fail("1 小时内最多切换 3 次 Steam 状态（切换需重启 bot），请稍后再试", 429);
    }
    await env.DB.prepare(
      "INSERT INTO status_switches (account_id, switched_at) VALUES (?, ?)"
    ).bind(accountId, now).run();

    // 解密 Steam 密码（用于重建 BotConfig；扫码登录账号无密码则用空串，ASF 凭 refresh token 自动登录）
    let password = "";
    if (acc.password_ct) {
      try {
        password = await decryptData({ iv: acc.password_iv, ct: acc.password_ct }, env.ENCRYPT_KEY);
      } catch {
        password = "";
      }
    }

    // 更新配置 + 重启 bot
    const sw = await switchOnlineStatus(env, server, acc.bot_name, acc.steam_username, password, onlineStatus);
    if (!sw.ok) return fail(sw.msg, 502);

    // 落库 pending（登录后由轮询/Cron 自动补 play）
    const existing = await env.DB.prepare(
      "SELECT id FROM play_sessions WHERE account_id = ? AND status IN ('pending','active') LIMIT 1"
    ).bind(accountId).first<{ id: number }>();
    if (existing) {
      await env.DB.prepare(
        "UPDATE play_sessions SET app_ids = ?, online_status = ?, display_name = ?, started_at = ?, ended_at = NULL, status = 'pending' WHERE id = ?"
      ).bind(JSON.stringify(appIds), onlineStatus, displayName, now, existing.id).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO play_sessions (account_id, user_id, bot_name, server_id, app_ids, online_status, display_name, started_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(accountId, acc.user_id, acc.bot_name, server.id, JSON.stringify(appIds), onlineStatus, displayName, now).run();
    }
    const fresh = await env.DB.prepare(
      "SELECT * FROM play_sessions WHERE account_id = ? AND status = 'pending' LIMIT 1"
    ).bind(accountId).first<PlaySessionRow>();
    return ok(fresh ? sessionOut(fresh) : null, "正在重启 bot 应用状态，登录后自动开始挂时长");
  }

  // 状态相同：直接 play（带自定义显示名称）
  const res = await sendPlay(env, server, acc.bot_name, appIds, displayName);
  if (!res.ok) return fail(res.msg || "ASF 执行 play 失败，请检查 bot 是否已登录", 502);

  const existing = await env.DB.prepare(
    "SELECT id FROM play_sessions WHERE account_id = ? AND status IN ('pending','active') LIMIT 1"
  ).bind(accountId).first<{ id: number }>();
  if (existing) {
    await env.DB.prepare(
      "UPDATE play_sessions SET app_ids = ?, online_status = ?, display_name = ?, started_at = ?, ended_at = NULL, status = 'active' WHERE id = ?"
    ).bind(JSON.stringify(appIds), onlineStatus, displayName, now, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO play_sessions (account_id, user_id, bot_name, server_id, app_ids, online_status, display_name, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(accountId, acc.user_id, acc.bot_name, server.id, JSON.stringify(appIds), onlineStatus, displayName, now).run();
  }
  const fresh = await env.DB.prepare(
    "SELECT * FROM play_sessions WHERE account_id = ? AND status = 'active' LIMIT 1"
  ).bind(accountId).first<PlaySessionRow>();
  return ok(fresh ? sessionOut(fresh) : null, "已开始挂时长，切换回挂卡模式前将持续保持");
}
