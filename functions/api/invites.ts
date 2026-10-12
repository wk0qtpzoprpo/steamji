// 月卡管理（仅管理员）：GET 列表 / POST 创建
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { ok, fail } from "../lib/db.ts";
import { parseJson, requireAdmin } from "../lib/http.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混字符 I/O/0/1

function generateCode(len = 12): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT c.*, u.username AS created_by_name
     FROM invite_codes c LEFT JOIN users u ON c.created_by = u.id
     ORDER BY c.id DESC LIMIT 200`
  ).all();
  return ok(rows.results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const body = await parseJson<{
    duration_days?: number; max_uses?: number; role?: string; expires_at?: string; remark?: string;
  }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const durationDays = Math.max(1, Math.min(3650, Math.floor(body.duration_days ?? 30)));
  const maxUses = Math.max(1, Math.min(1000, Math.floor(body.max_uses ?? 1)));
  const role = body.role === "admin" ? "admin" : "user";
  const expiresAt = body.expires_at && body.expires_at.length > 0 ? body.expires_at : null;
  const remark = (body.remark || "").trim();

  const code = generateCode();
  const ins = await env.DB.prepare(
    `INSERT INTO invite_codes (code, duration_days, role, max_uses, expires_at, status, created_by, remark)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
  ).bind(code, durationDays, role, maxUses, expiresAt, user.id, remark).run();
  if (ins.meta.changes !== 1) return fail("创建失败");

  return ok(
    {
      code,
      duration_days: durationDays,
      role,
      max_uses: maxUses,
      expires_at: expiresAt,
      remark,
    },
    "月卡创建成功"
  );
};
