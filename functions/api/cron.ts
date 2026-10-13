// Cron 执行端点：由独立 Cron Worker 定时调用（Pages 本身不支持 Cron Triggers）
// 鉴权：请求头 X-Cron-Token 必须匹配 secret CRON_TOKEN
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import {
  runHealthCheck,
  syncAccountStatus,
  stopExpiredBots,
  runMigration,
  runCalibration,
  runExpiry,
  runSettlePendingPlays,
} from "../scheduled.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = request.headers.get("X-Cron-Token");
  if (!env.CRON_TOKEN || token !== env.CRON_TOKEN) return fail("未授权", 401);

  const cron = request.headers.get("X-Cron") || "";
  if (!cron || cron === "*/10 * * * *") {
    await runHealthCheck(env);
    await syncAccountStatus(env);
    await runSettlePendingPlays(env);
    await stopExpiredBots(env);
  }
  if (!cron || cron === "0 * * * *") {
    await runMigration(env);
    await runCalibration(env);
    await runSettlePendingPlays(env);
  }
  if (!cron || cron === "0 3 * * *") {
    await runExpiry(env);
  }
  return ok({ executed: true, cron });
};
