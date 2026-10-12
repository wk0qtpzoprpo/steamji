// 修改密码：POST { old_password, new_password }，校验原密码后更新
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { hashPassword, verifyPassword } from "../../lib/crypto.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };

  let body: { old_password?: string; new_password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const oldPassword = body.old_password || "";
  const newPassword = body.new_password || "";

  if (!oldPassword || !newPassword) return fail("原密码和新密码不能为空");
  if (newPassword.length < 6) return fail("新密码至少 6 位");
  if (oldPassword === newPassword) return fail("新密码不能与原密码相同");

  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id).first<{ password_hash: string }>();
  if (!row) return fail("用户不存在", 404);

  const valid = await verifyPassword(oldPassword, row.password_hash);
  if (!valid) return fail("原密码不正确");

  const newHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id).run();

  return ok({}, "密码已修改，下次登录请使用新密码");
};
