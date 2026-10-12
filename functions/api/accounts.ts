// 我的 Steam 账号：GET 列表（字段白名单，不含迁移记录与敏感信息） / POST 添加（配额+最少连接分配）
// 账户列表：到期时间取自栏位（account_slots.expires_at），时长绑定栏位不随账户走
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import { encryptData } from "../lib/crypto.ts";
import { proxyToAsf } from "../lib/asf.ts";
import { parseJson } from "../lib/http.ts";

// 普通用户可见的账号字段白名单（隐藏 original_server_id / migration_logs / 密码）
function sanitizeAccount(row: Record<string, unknown>) {
  return {
    id: row.id,
    bot_name: row.bot_name,
    steam_username: row.steam_username,
    status: row.status,
    server_name: row.server_name ?? null,
    server_id: row.current_server_id ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at,
    display_name: row.display_name ?? null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const rows = await env.DB.prepare(
    `SELECT a.id, a.bot_name, a.steam_username, a.status, a.created_at, a.current_server_id,
            a.display_name, s.expires_at, sv.name AS server_name
     FROM steam_accounts a
     LEFT JOIN servers sv ON a.current_server_id = sv.id
     LEFT JOIN account_slots s ON a.slot_id = s.id
     WHERE a.user_id = ? ORDER BY a.id DESC`
  ).bind(user.id).all();
  return ok(rows.results.map(sanitizeAccount));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };
  const body = await parseJson<{ bot_name?: string; steam_username?: string; password?: string; online_status?: number }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const botName = (body.bot_name || "").trim();
  const steamUsername = (body.steam_username || "").trim();
  const password = body.password || "";
  // 在线状态：EPersonaState 0=离线 1=在线 2=忙碌 7=隐身，默认离线
  const onlineStatus = body.online_status ?? 0;
  if (![0, 1, 2, 7].includes(onlineStatus)) return fail("在线状态取值无效（0=离线 1=在线 2=忙碌 7=隐身）");
  if (!botName || !steamUsername || !password) return fail("bot 名称、Steam 用户名、密码都不能为空");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(botName)) return fail("bot 名称仅允许字母、数字、下划线、连字符，最长 32 字符");

  // 1) 选择目标服务器：在线 + 账号数最少（最少连接算法）
  const server = await env.DB.prepare(
    "SELECT * FROM servers WHERE status = 'online' ORDER BY bot_count ASC, id ASC LIMIT 1"
  ).first<ServerRow>();
  if (!server) return fail("暂无可分配的在线服务器，请联系管理员");

  // 2) 加密 Steam 密码
  const enc = await encryptData(password, env.ENCRYPT_KEY);

  // 3) 绑定栏位（槽位）：优先复用空槽位（继承其剩余时长），否则在配额内新建槽位
  const slot = await env.DB.prepare(
    `SELECT s.* FROM account_slots s
     WHERE s.user_id = ? AND s.id NOT IN (
       SELECT a.slot_id FROM steam_accounts a WHERE a.user_id = ? AND a.slot_id IS NOT NULL
     )
     ORDER BY s.slot_index LIMIT 1`
  ).bind(user.id, user.id).first<{ id: number; slot_index: number; expires_at: string | null }>();
  if (!slot) {
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM account_slots WHERE user_id = ?")
      .bind(user.id).first<{ c: number }>();
    const quotaRow = await env.DB.prepare("SELECT quota FROM users WHERE id = ?")
      .bind(user.id).first<{ quota: number }>();
    if (!quotaRow || (cnt?.c ?? 0) >= quotaRow.quota) return fail("已达账户额度上限，请在「兑换卡密」中增加额度", 409);
    const idx = (cnt?.c ?? 0) + 1;
    const insS = await env.DB.prepare("INSERT INTO account_slots (user_id, slot_index) VALUES (?, ?)")
      .bind(user.id, idx).run();
    return await insertAccount(env, user, botName, steamUsername, password, enc, server, onlineStatus, {
      id: Number(insS.meta.last_row_id), slot_index: idx, expires_at: null,
    });
  }
  return await insertAccount(env, user, botName, steamUsername, password, enc, server, onlineStatus, slot);
}

async function insertAccount(
  env: Env, user: { id: number }, botName: string, steamUsername: string, password: string,
  enc: { iv: string; ct: string }, server: ServerRow, onlineStatus: number,
  slot: { id: number; slot_index: number; expires_at: string | null }
): Promise<Response> {
  // 原子配额校验 + 插入（条件 INSERT，防并发超配；绑定 slot_id）
  const ins = await env.DB.prepare(
    `INSERT INTO steam_accounts (user_id, bot_name, steam_username, password_iv, password_ct, current_server_id, original_server_id, online_status, slot_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? FROM users
     WHERE id = ? AND quota > (SELECT COUNT(*) FROM steam_accounts WHERE user_id = ?)`
  ).bind(user.id, botName, steamUsername, enc.iv, enc.ct, server.id, server.id, onlineStatus, slot.id, user.id, user.id).run();
  if (ins.meta.changes === 0) return fail("已达账户额度上限，请在「兑换卡密」中增加额度", 409);

  // 4) 通过 IPC 在目标服务器创建 bot（ASF V6：请求体为 BotConfig 对象）
  const createResp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(botName)}`, {
    method: "POST",
    body: JSON.stringify({
      BotConfig: {
        Enabled: true,
        SteamLogin: steamUsername,
        SteamPassword: password,
        OnlineStatus: onlineStatus,
        // 禁止 ASF 服务器重启后自动挂卡：挂卡必须由用户手动发起（经"无可用时间"校验）
        AutoStart: false,
      },
    }),
  });
  let createSuccess = false;
  if (createResp.ok) {
    try {
      const j = (await createResp.json()) as { Success?: boolean };
      createSuccess = j.Success !== false;
    } catch {
      createSuccess = true; // 非 JSON 响应按成功处理
    }
  }
  if (!createSuccess) {
    // 回滚落库记录
    await env.DB.prepare("DELETE FROM steam_accounts WHERE id = ?")
      .bind(ins.meta.last_row_id ?? 0).run();
    return fail("在目标服务器创建 bot 失败，请检查 ASF 状态或稍后重试", 502);
  }

  // 5) 更新服务器账号计数
  await env.DB.prepare("UPDATE servers SET bot_count = bot_count + 1 WHERE id = ?").bind(server.id).run();

  return ok(
    { id: ins.meta.last_row_id, bot_name: botName, server_id: server.id, server_name: server.name, slot_id: slot.id, expires_at: slot.expires_at },
    `已自动分配到服务器（账号数最少），占用栏位 #${slot.slot_index}${slot.expires_at ? `（剩余时长至 ${slot.expires_at.slice(0, 10)}）` : "（无可用时间）"}`
  );
}
