// 修改密码：POST { old_password, new_password }，校验原密码后更新
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { hashPassword, verifyPassword } from "../../lib/crypto.ts";
import { parseJson } from "../../lib/http.ts";
import { validatePassword } from "../../lib/validate.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as { id: number; username: string; role: string };

  const body = await parseJson<{ old_password?: string; new_password?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const oldPassword = body.old_password || "";
  const newPassword = body.new_password || "";

  if (!oldPassword || !newPassword) return fail("原密码和新密码不能为空");
  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return fail(passwordErr);
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
