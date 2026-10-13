// Cron 处理器（Pages Functions onScheduled）
// cron 时间表见 wrangler.toml [triggers]
//  */10 * * * *  健康检查 + 回迁禁用
//  0 * * * *    故障转移 + bot_count 校准 + 挂时长兜底
//  0 3 * * *    订阅到期标记
// 若事件不含 cron 字段（兼容兜底），则全量执行（所有任务幂等）
import type { Env, ServerRow, AccountRow } from "./lib/db.ts";
import { pingAsf, proxyToAsf, readBotState, callAsfCommand } from "./lib/asf.ts";
import { decryptData, decryptAccountPassword } from "./lib/crypto.ts";
import { parseAppIds } from "./lib/ids.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function logMigration(
  env: Env,
  accountId: number,
  fromServer: number | null,
  toServer: number | null,
  action: string,
  detail: string
) {
  await env.DB.prepare(
    "INSERT INTO migration_logs (account_id, from_server, to_server, action, detail) VALUES (?,?,?,?,?)"
  ).bind(accountId, fromServer, toServer, action, detail).run();
}

// ---------- 健康检查 + 回迁禁用 ----------
export async function runHealthCheck(env: Env) {
  const servers = await env.DB.prepare("SELECT * FROM servers").all<ServerRow>();
  const now = new Date().toISOString();
  for (const server of servers.results) {
    const ping = await pingAsf(env, server);
    if (ping.alive) {
      const wasOffline = server.status === "offline";
      await env.DB.prepare(
        "UPDATE servers SET status = 'online', last_seen = ?, offline_since = NULL WHERE id = ?"
      ).bind(now, server.id).run();
      if (wasOffline) {
        await disableMigratedCopies(env, server);
      }
    } else {
      if (server.status === "online" || !server.offline_since) {
        // 首次掉线时记录离线起始时间（之后保持首次时间，用于"离线 1 天"判断）
        await env.DB.prepare("UPDATE servers SET status = 'offline', offline_since = ? WHERE id = ?")
          .bind(now, server.id).run();
      }
    }
  }
}

// 回迁禁用：原服务器恢复上线后，禁用该服务器上已被迁移走的账号副本（避免同一 Steam 账号双端在线）
async function disableMigratedCopies(env: Env, server: ServerRow) {
  const accounts = await env.DB.prepare(
    "SELECT * FROM steam_accounts WHERE original_server_id = ? AND migration_status IN ('migrated','disabled')"
  ).bind(server.id).all<AccountRow>();
  for (const acc of accounts.results) {
    let ok_ = false;
    try {
      const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(acc.bot_name)}`, {
        method: "POST",
        body: JSON.stringify({ BotConfig: { Enabled: false } }),
      });
      if (resp.ok) {
        try {
          const j = (await resp.json()) as { Success?: boolean };
          ok_ = j.Success !== false;
        } catch {
          ok_ = true;
        }
      }
    } catch {
      ok_ = false;
    }
    await logMigration(
      env,
      acc.id,
      server.id,
      acc.current_server_id,
      ok_ ? "disable" : "disable_failed",
      ok_ ? "原服务器恢复上线，已禁用迁移副本" : "禁用原侧副本失败，下轮重试"
    );
    if (ok_) {
      await env.DB.prepare("UPDATE steam_accounts SET migration_status = 'disabled' WHERE id = ?").bind(acc.id).run();
    }
  }
}

// 挂时长会话优先取在线状态与显示名称（重建/迁移时恢复"正在游戏中"）
async function getPlayState(env: Env, accountId: number): Promise<{ online_status: number; display_name: string | null }> {
  const s = await env.DB.prepare(
    "SELECT online_status, display_name FROM play_sessions WHERE account_id = ? AND status IN ('pending','active') ORDER BY id DESC LIMIT 1"
  ).bind(accountId).first<{ online_status: number; display_name: string | null }>();
  return { online_status: s?.online_status ?? 0, display_name: s?.display_name ?? null };
}

// 服务器在线但 ASF 侧 bot 缺失（如 Render 无持久化磁盘重启丢数据）→ 按 D1 凭据自动重建
// 仅在账号正常归属（migration_status=active）时重建；已迁走/已禁用的副本不重建，避免双端在线
async function restoreMissingBot(env: Env, server: ServerRow, acc: AccountRow): Promise<void> {
  if (acc.migration_status !== "active") return;
  let password: string;
  try {
    password = await decryptAccountPassword(acc, env.ENCRYPT_KEY);
  } catch {
    await logMigration(env, acc.id, server.id, server.id, "restore_failed", "密码解密失败，需人工处理");
    return;
  }
  const play = await getPlayState(env, acc.id);
  let ok_ = false;
  try {
    const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(acc.bot_name)}`, {
      method: "POST",
      body: JSON.stringify({
        BotConfig: {
          Enabled: true,
          SteamLogin: acc.steam_username,
          SteamPassword: password,
          OnlineStatus: play.online_status,
          CustomGamePlayedWhileFarming: play.display_name || acc.display_name || null,
          // 禁止自动挂卡：挂卡必须由用户手动发起（经"无可用时间"校验）
          AutoStart: false,
        },
      }),
    });
    if (resp.ok) {
      try {
        const j = (await resp.json()) as { Success?: boolean };
        ok_ = j.Success !== false;
      } catch {
        ok_ = true;
      }
    }
  } catch {
    ok_ = false;
  }
  if (!ok_) {
    await logMigration(env, acc.id, server.id, server.id, "restore_failed", "在服务器重建 bot 失败，下轮重试");
    return;
  }
  await logMigration(env, acc.id, server.id, server.id, "restore", `服务器数据丢失后已自动重建 bot ${acc.bot_name}`);
  // 自动拒绝二维码登录（ASF 重建后默认询问 QrCodeLogin），让 bot 用已存凭据走密码登录
  try {
    await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
      method: "POST",
      body: JSON.stringify({ Type: 8, Value: "N" }),
    });
  } catch {
    // 提交失败由 runSettlePendingPlays 兜底
  }
  // 恢复挂时长：会话指向本服务器并置 pending，由 runSettlePendingPlays 补发 play
  await env.DB.prepare(
    "UPDATE play_sessions SET server_id = ?, status = 'pending' WHERE account_id = ? AND status IN ('pending','active')"
  ).bind(server.id, acc.id).run();
  // 有挂时长会话时自动 Start（ASF 重建后 bot 处于停止态，不 Start 不会登录；
  // 无会话则保持停止，挂卡模式仍由用户手动发起，遵守"无可用时间禁挂卡"规则）
  const hasPlay = await env.DB.prepare(
    "SELECT id FROM play_sessions WHERE account_id = ? AND status = 'pending' LIMIT 1"
  ).bind(acc.id).first<{ id: number }>();
  if (hasPlay) {
    // 无可用时间/已到期不自动 Start（与 stopExpiredBots 语义一致，避免短暂拉起无时长 bot）
    const slotRow = await env.DB.prepare(
      `SELECT s.expires_at FROM account_slots s JOIN steam_accounts a ON a.slot_id = s.id WHERE a.id = ?`
    ).bind(acc.id).first<{ expires_at: string | null }>();
    const noTime = !slotRow?.expires_at || new Date(slotRow.expires_at).getTime() < Date.now();
    if (noTime) {
      // 到期仅禁登录：终止挂时长会话并保持 bot 停止
      await env.DB.prepare(
        "UPDATE play_sessions SET status = 'ended', ended_at = ? WHERE account_id = ? AND status IN ('pending','active')"
      ).bind(new Date().toISOString(), acc.id).run();
    } else {
      try {
        await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(acc.bot_name)}/Start`, { method: "POST" });
      } catch {
        // 启动失败由用户手动重试
      }
    }
  }
}

// ---------- 故障转移：迁移离线 ≥24h 服务器上的账号 ----------
export async function runMigration(env: Env) {
  const cutoff = new Date(Date.now() - DAY).toISOString();
  const offlineServers = await env.DB.prepare(
    "SELECT * FROM servers WHERE status = 'offline' AND offline_since IS NOT NULL AND offline_since <= ?"
  ).bind(cutoff).all<ServerRow>();

  for (const source of offlineServers.results) {
    const accounts = await env.DB.prepare(
      "SELECT * FROM steam_accounts WHERE current_server_id = ? AND migration_status = 'active'"
    ).bind(source.id).all<AccountRow>();

    for (const acc of accounts.results) {
      // 目标：在线服务器中账号数最少（最少连接，排除源）
      const target = await env.DB.prepare(
        "SELECT * FROM servers WHERE status = 'online' AND id != ? ORDER BY bot_count ASC, id ASC LIMIT 1"
      ).bind(source.id).first<ServerRow>();
      if (!target) {
        await logMigration(env, acc.id, source.id, null, "migrate_skipped", "暂无可用的在线服务器，下轮重试");
        continue;
      }

      let password: string;
      try {
        password = await decryptData({ iv: acc.password_iv, ct: acc.password_ct }, env.ENCRYPT_KEY);
      } catch {
        await logMigration(env, acc.id, source.id, target.id, "migrate_failed", "密码解密失败，需人工处理");
        continue;
      }

      const play = await getPlayState(env, acc.id);
      let success = false;
      try {
        const resp = await proxyToAsf(env, target, `Api/Bot/${encodeURIComponent(acc.bot_name)}`, {
          method: "POST",
          body: JSON.stringify({
            BotConfig: {
              Enabled: true,
              SteamLogin: acc.steam_username,
              SteamPassword: password,
              OnlineStatus: play.online_status,
              CustomGamePlayedWhileFarming: play.display_name || acc.display_name || null,
              AutoStart: false,
            },
          }),
        });
        if (resp.ok) {
          try {
            const j = (await resp.json()) as { Success?: boolean };
            success = j.Success !== false;
          } catch {
            success = true;
          }
        }
      } catch {
        success = false;
      }
      if (!success) {
        await logMigration(env, acc.id, source.id, target.id, "migrate_failed", "在目标服务器重建 bot 失败，下轮重试");
        continue;
      }

      // 迁移成功：更新归属与计数
      await env.DB.prepare(
        "UPDATE steam_accounts SET current_server_id = ?, migration_status = 'migrated' WHERE id = ?"
      ).bind(target.id, acc.id).run();
      await env.DB.prepare("UPDATE servers SET bot_count = bot_count - 1 WHERE id = ?").bind(source.id).run();
      await env.DB.prepare("UPDATE servers SET bot_count = bot_count + 1 WHERE id = ?").bind(target.id).run();
      // 挂时长会话随账号迁移到新服务器并置 pending，由 runSettlePendingPlays 补发 play
      await env.DB.prepare(
        "UPDATE play_sessions SET server_id = ?, status = 'pending' WHERE account_id = ? AND status IN ('pending','active')"
      ).bind(target.id, acc.id).run();
      await logMigration(
        env,
        acc.id,
        source.id,
        target.id,
        "migrate",
        `账号 ${acc.bot_name} 已从 ${source.name} 迁移到 ${target.name}`
      );
    }
  }
}

// ---------- 账号状态同步：查询在线服务器上 bot 的实时状态（online/offline） ----------
export async function syncAccountStatus(env: Env) {
  const servers = await env.DB.prepare("SELECT * FROM servers WHERE status = 'online'").all<ServerRow>();
  for (const server of servers.results) {
    // ASF V6：GET /Api/Bot/ASF 返回该服务器全部 bot 的字典 {botName: {IsConnectedAndLoggedOn, ...}}
    let botMap: Record<string, { IsConnectedAndLoggedOn?: boolean }> | null = null;
    try {
      const resp = await proxyToAsf(env, server, "Api/Bot/ASF", { method: "GET" });
      if (resp.ok) {
        const j = (await resp.json()) as {
          Success?: boolean;
          Result?: Record<string, { IsConnectedAndLoggedOn?: boolean }>;
        };
        if (j.Success !== false && j.Result) botMap = j.Result;
      }
    } catch {
      botMap = null;
    }
    if (!botMap) continue; // 查询失败（服务器刚掉线）则本轮跳过

    const accounts = await env.DB.prepare(
      "SELECT * FROM steam_accounts WHERE current_server_id = ?"
    ).bind(server.id).all<AccountRow>();

    for (const acc of accounts.results) {
      const bot = botMap[acc.bot_name];
      if (!bot) {
        // ASF 侧 bot 缺失（服务器重启/数据丢失）→ 自动重建，状态由下轮同步更新
        await restoreMissingBot(env, server, acc);
        continue;
      }
      const newStatus = bot.IsConnectedAndLoggedOn ? "online" : "offline";
      await env.DB.prepare(
        "UPDATE steam_accounts SET status = ? WHERE id = ? AND status != ?"
      ).bind(newStatus, acc.id, newStatus).run();
    }
  }
}

// ---------- 停止无可用时间/已到期的在线 bot（强制禁止挂卡） ----------
export async function stopExpiredBots(env: Env) {
  const now = Date.now();
  const accounts = await env.DB.prepare(
    `SELECT a.id, a.bot_name, a.current_server_id, s.expires_at
     FROM steam_accounts a
     LEFT JOIN account_slots s ON a.slot_id = s.id
     JOIN servers sv ON a.current_server_id = sv.id
     WHERE sv.status = 'online' AND a.status = 'online'`
  ).all<{ id: number; bot_name: string; current_server_id: number; expires_at: string | null }>();

  for (const acc of accounts.results) {
    const noTime = !acc.expires_at || new Date(acc.expires_at).getTime() < now;
    if (!noTime) continue;
    const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(acc.current_server_id).first<ServerRow>();
    if (!server) continue;
    // B：先终止该账号的挂时长会话（status→ended），从源头消除 runSettlePendingPlays 的竞争源
    await env.DB.prepare(
      "UPDATE play_sessions SET status = 'ended', ended_at = ? WHERE account_id = ? AND status IN ('pending','active')"
    ).bind(new Date(now).toISOString(), acc.id).run();
    try {
      const resp = await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(acc.bot_name)}/Stop`, {
        method: "POST",
      });
      if (resp.ok) {
        await env.DB.prepare("UPDATE steam_accounts SET status = 'offline' WHERE id = ? AND status = 'online'").bind(acc.id).run();
      }
    } catch {
      // 单次失败下轮重试
    }
  }
}

// ---------- bot_count 校准：按库内真实归属重算 ----------
export async function runCalibration(env: Env) {
  await env.DB.prepare("UPDATE servers SET bot_count = 0").run();
  const rows = await env.DB.prepare(
    "SELECT current_server_id AS sid, COUNT(*) AS c FROM steam_accounts WHERE current_server_id IS NOT NULL GROUP BY current_server_id"
  ).all<{ sid: number; c: number }>();
  for (const r of rows.results) {
    await env.DB.prepare("UPDATE servers SET bot_count = ? WHERE id = ?").bind(r.c, r.sid).run();
  }
}

// ---------- 挂时长 pending 兜底：bot 已登录则补发 play ----------
export async function runSettlePendingPlays(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM play_sessions WHERE status IN ('pending','active')"
  ).all<{ id: number; account_id: number; bot_name: string; server_id: number; app_ids: string; display_name: string | null }>();
  for (const r of rows.results) {
    try {
      // A：先查账号绑定的栏位时长，无可用时间/已到期则终止会话并跳过（与 stopExpiredBots 语义一致，避免 Start/Stop 竞争）
      const accRow = await env.DB.prepare(
        `SELECT a.id, s.expires_at FROM steam_accounts a
         LEFT JOIN account_slots s ON a.slot_id = s.id WHERE a.id = ?`
      ).bind(r.account_id).first<{ id: number; expires_at: string | null }>();
      if (!accRow) continue;
      const noTime = !accRow.expires_at || new Date(accRow.expires_at).getTime() < Date.now();
      if (noTime) {
        await env.DB.prepare(
          "UPDATE play_sessions SET status = 'ended', ended_at = ? WHERE id = ? AND status IN ('pending','active')"
        ).bind(new Date().toISOString(), r.id).run();
        continue;
      }
      const server = await env.DB.prepare("SELECT * FROM servers WHERE id = ?").bind(r.server_id).first<ServerRow>();
      if (!server || server.status !== "online") continue;
      const st = await readBotState(env, server, r.bot_name);
      if (!st) continue;
      if (st.requiredInput === 8) {
        // ASF 询问二维码登录 → 自动拒绝，走密码登录（凭据存于 D1）
        try {
          await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(r.bot_name)}/Input`, {
            method: "POST",
            body: JSON.stringify({ Type: 8, Value: "N" }),
          });
        } catch {
          // 忽略，下轮重试
        }
        continue;
      }
      if (!st.online) {
        // 未登录且无待处理输入（拒绝二维码后 bot 中止）→ 重新 Start，走密码登录；
        // 收敛路径：Start → 问二维码 → N → Start → 密码登录（实测）
        try {
          await proxyToAsf(env, server, `Api/Bot/${encodeURIComponent(r.bot_name)}/Start`, { method: "POST" });
        } catch {
          // 忽略，下轮重试
        }
        continue;
      }
      const appIds = parseAppIds(r.app_ids);
      if (appIds.length === 0) continue;
      // 补发 play 时携带挂时长会话的自定义显示名（否则显示名丢失，好友看到默认游戏名）
      const displayName = (r.display_name || "").trim() || null;
      const playResp = await callAsfCommand(env, server, "Api/Command", "POST", {
        Command: displayName
          ? `play ${r.bot_name} ${appIds.join(",")} ${displayName}`
          : `play ${r.bot_name} ${appIds.join(",")}`,
      });
      if (!playResp.ok) continue;
      await env.DB.prepare(
        "UPDATE play_sessions SET status = 'active' WHERE id = ? AND status = 'pending'"
      ).bind(r.id).run();
    } catch {
      // 单条失败不阻塞其他
    }
  }
}

// ---------- 订阅到期标记（仅禁登录，bot 保留运行） ----------
export async function runExpiry(env: Env) {
  await env.DB.prepare(
    `UPDATE users SET subscription_status = 'expired'
     WHERE role != 'admin' AND subscription_status = 'active'
       AND subscription_expires_at IS NOT NULL AND subscription_expires_at < ?`
  ).bind(new Date().toISOString()).run();
}

export const onScheduled = async (event: unknown, env: Env) => {
  const cron = (event as { cron?: string } | null)?.cron;
  try {
    if (!cron || cron === "*/10 * * * *") {
      await runHealthCheck(env);
      await syncAccountStatus(env);
      await runSettlePendingPlays(env);
    }
    if (!cron || cron === "0 * * * *") {
      await runMigration(env);
      await runCalibration(env);
      await runSettlePendingPlays(env);
    }
    if (!cron || cron === "0 3 * * *") {
      await runExpiry(env);
    }
  } catch (err) {
    console.error("ASF 控制台 scheduled 任务异常:", err);
  }
};
