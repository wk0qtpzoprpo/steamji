// 账号编辑/重命名/删除：仅账号所属用户（或管理员）
// PUT /api/accounts/:id  编辑（bot_name 重命名 / password 更新密码）
// DELETE /api/accounts/:id  删除（同步删除 ASF bot）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, ServerRow, AccountRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { encryptData, decryptData } from "../../lib/crypto.ts";
import { proxyToAsf } from "../../lib/asf.ts";

type Params = { id: string };

async function getOwnedAccount(env: Env, userId: number, accountId: number): Promise<AccountRow | null> {
  return env.DB.prepare(
    "SELECT * FROM steam_accounts WHERE id = ? AND user_id = ?"
  ).bind(accountId, userId).first<AccountRow>();
}

async function callAsf(
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

export const onRequestPut: PagesFunction<Env, Params> = async ({ request, env, data, params }) => {
  const user = data.user as { id: number; role: string };
  const account = await getOwnedAccount(env, user.id, Number(params.id));
  if (!account) return fail("账号不存在", 404);

  let body: { bot_name?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }

  const server = account.current_server_id
    ? await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(account.current_server_id).first<ServerRow>()
    : null;
  const serverOnline = !!server && server.status === "online";

  // 重命名
  if (body.bot_name !== undefined) {
    const newName = (body.bot_name || "").trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(newName)) return fail("bot 名称仅允许字母、数字、下划线、连字符，最长 32 字符");
    if (!serverOnline) return fail("所在服务器当前离线，无法重命名");
    const r = await callAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}/Rename`, "POST", { NewName: newName });
    if (!r.ok) return fail(r.message || "重命名失败", 502);
    await env.DB.prepare("UPDATE steam_accounts SET bot_name = ? WHERE id = ?").bind(newName, account.id).run();
    return ok({ bot_name: newName }, "已重命名");
  }

  // 更新密码
  if (body.password !== undefined) {
    if (!body.password) return fail("密码不能为空");
    if (!serverOnline) return fail("所在服务器当前离线，无法更新密码");
    const r = await callAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}`, "POST", {
      BotConfig: { SteamPassword: body.password },
    });
    if (!r.ok) return fail(r.message || "更新 ASF 密码失败", 502);
    const enc = await encryptData(body.password, env.ENCRYPT_KEY);
    await env.DB.prepare("UPDATE steam_accounts SET password_iv = ?, password_ct = ? WHERE id = ?")
      .bind(enc.iv, enc.ct, account.id).run();
    return ok({}, "密码已更新");
  }

  // 自定义显示名称（挂卡模式 "正在玩" 名称）
  // 立即生效需重启 bot → 与 Steam 状态切换共用 1 小时 3 次限制
  if (body.display_name !== undefined) {
    const name = (body.display_name || "").trim();
    if (name.length > 60) return fail("显示名称最长 60 字符");
    if (!serverOnline) return fail("所在服务器当前离线，无法应用");
    // 1 小时切换次数限制（与状态切换共用 status_switches）
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const cnt = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM status_switches WHERE account_id = ? AND switched_at >= ?"
    ).bind(account.id, hourAgo).first<{ c: number }>();
    if (!cnt || cnt.c >= 3) {
      return fail("1 小时内最多切换 3 次（应用显示名称需重启 bot），请稍后再试", 429);
    }
    await env.DB.prepare(
      "INSERT INTO status_switches (account_id, switched_at) VALUES (?, ?)"
    ).bind(account.id, new Date().toISOString()).run();

    // 解密 Steam 密码（重建完整 BotConfig；扫码登录账号无密码则用空串，ASF 凭 refresh token 自动登录）
    let password = "";
    if (account.password_ct) {
      try {
        password = await decryptData({ iv: account.password_iv, ct: account.password_ct }, env.ENCRYPT_KEY);
      } catch {
        password = "";
      }
    }

    // 保持当前 OnlineStatus，只改 CustomGamePlayedWhileFarming
    let onlineStatus = 0;
    try {
      const cfgResp = await proxyToAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}`, { method: "GET" });
      if (cfgResp.ok) {
        const cfg = (await cfgResp.json().catch(() => null)) as
          { Result?: Record<string, { BotConfig?: { OnlineStatus?: number } }> } | null;
        if (typeof cfg?.Result?.[account.bot_name]?.BotConfig?.OnlineStatus === "number") {
          onlineStatus = cfg.Result[account.bot_name].BotConfig.OnlineStatus;
        }
      }
    } catch {
      // 保持默认 0
    }

    // 更新 BotConfig（含自定义显示名称）+ 重启 bot
    const up = await proxyToAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}`, {
      method: "POST",
      body: JSON.stringify({
        BotConfig: {
          Enabled: true,
          SteamLogin: account.steam_username,
          SteamPassword: password,
          OnlineStatus: onlineStatus,
          CustomGamePlayedWhileFarming: name || null,
          AutoStart: false,
        },
      }),
    });
    if (!up.ok) return fail("更新配置失败（ASF 不可达）", 502);
    const stopR = await proxyToAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}/Stop`, { method: "POST" });
    if (!stopR.ok) return fail("停止 bot 失败", 502);
    const startR = await proxyToAsf(env, server!, `Api/Bot/${encodeURIComponent(account.bot_name)}/Start`, { method: "POST" });
    if (!startR.ok) return fail("启动 bot 失败", 502);

    await env.DB.prepare("UPDATE steam_accounts SET display_name = ? WHERE id = ?").bind(name, account.id).run();
    return ok({ display_name: name }, name ? "显示名称已应用，正在重启 bot（约 10-60 秒）" : "已清除显示名称，正在重启 bot（约 10-60 秒）");
  }

  return fail("没有可更新的字段");
};

export const onRequestDelete: PagesFunction<Env, Params> = async ({ env, data, params }) => {
  const user = data.user as { id: number; role: string };
  const account = await getOwnedAccount(env, user.id, Number(params.id));
  if (!account) return fail("账号不存在", 404);

  // 尽力删除 ASF bot（服务器离线则跳过，不影响删除本地记录）
  const server = account.current_server_id
    ? await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(account.current_server_id).first<ServerRow>()
    : null;
  if (server && server.status === "online") {
    await callAsf(env, server, `Api/Bot/${encodeURIComponent(account.bot_name)}`, "DELETE");
  }

  await env.DB.prepare("DELETE FROM steam_accounts WHERE id = ?").bind(account.id).run();
  await env.DB.prepare("UPDATE servers SET bot_count = bot_count - 1 WHERE id = ?").bind(account.current_server_id).run();
  return ok({}, "已删除");
};
