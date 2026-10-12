// 用户管理（仅管理员）：GET 列表 / POST 操作（调配额、重置密码、禁用/启用）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { hashPassword } from "../../lib/crypto.ts";
import { parseJson, requireAdmin } from "../../lib/http.ts";

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.quota, u.status, u.subscription_expires_at, u.subscription_status, u.created_at,
            (SELECT COUNT(*) FROM steam_accounts a WHERE a.user_id = u.id) AS account_count
     FROM users u ORDER BY u.id ASC`
  ).all();
  return ok(rows.results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { role: string };
  const denied = requireAdmin(user);
  if (denied) return denied;

  const body = await parseJson<{
    user_id?: number;
    action?: "set_quota" | "reset_password" | "disable" | "enable";
    quota?: number;
    new_password?: string;
  }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const targetId = Number(body.user_id);
  if (!targetId) return fail("缺少 user_id");
  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first<{ role: string }>();
  if (!target) return fail("用户不存在", 404);
  if (target.role === "admin") return fail("不能操作管理员账号", 403);

  switch (body.action) {
    case "set_quota": {
      const quota = Math.max(0, Math.min(1000, Math.floor(body.quota ?? 2)));
      await env.DB.prepare("UPDATE users SET quota = ? WHERE id = ?").bind(quota, targetId).run();
      // 配额增加时补建栏位（槽位）
      const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM account_slots WHERE user_id = ?")
        .bind(targetId).first<{ c: number }>();
      const need = quota - (cnt?.c ?? 0);
      if (need > 0) {
        const stmt = env.DB.prepare("INSERT INTO account_slots (user_id, slot_index) VALUES (?, ?)");
        for (let i = (cnt?.c ?? 0) + 1; i <= quota; i++) {
          await stmt.bind(targetId, i).run();
        }
      }
      return ok({ quota }, "配额已更新");
    }
    case "reset_password": {
      if (!body.new_password || body.new_password.length < 6) return fail("新密码至少 6 位");
      const hash = await hashPassword(body.new_password);
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, targetId).run();
      return ok(null, "密码已重置");
    }
    case "disable":
      await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind(targetId).run();
      return ok(null, "已禁用");
    case "enable":
      await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(targetId).run();
      return ok(null, "已启用");
    default:
      return fail("未知操作");
  }
};
