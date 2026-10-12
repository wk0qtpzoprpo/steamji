// 登录：校验密码 + 订阅状态，签发 access token 与 refresh token
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, UserRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { verifyPassword } from "../../lib/crypto.ts";
import { signJwt } from "../../lib/jwt.ts";
import { parseJson } from "../../lib/http.ts";

const REFRESH_TTL = 30 * 24 * 3600; // 30 天

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await parseJson<{ username?: string; password?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) return fail("用户名和密码不能为空");

  // 登录失败限流：15 分钟内 5 次锁定
  const failKey = `login_fail:${username}`;
  const fails = Number((await env.KV.get(failKey)) || "0");
  if (fails >= 5) return fail("登录失败次数过多，请 15 分钟后再试", 429);

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: 15 * 60 });
    return fail("用户名或密码错误", 401);
  }
  await env.KV.delete(failKey);

  if (user.status === "disabled") return fail("账号已被禁用", 403);
  if (user.role !== "admin" && user.subscription_status === "expired") {
    return fail("服务已到期，请续期", 403);
  }
  // 到期时间自然过去但未标记：登录时兜底判断（bot 保留，仅禁登录）
  if (
    user.role !== "admin" &&
    user.subscription_expires_at &&
    user.subscription_expires_at < new Date().toISOString()
  ) {
    await env.DB.prepare("UPDATE users SET subscription_status = 'expired' WHERE id = ?").bind(user.id).run();
    return fail("服务已到期，请续期", 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    { sub: String(user.id), username: user.username, role: user.role, iat: now, exp: now + 15 * 60 },
    env.JWT_SECRET
  );

  const refreshToken = crypto.randomUUID();
  await env.KV.put(`refresh:${refreshToken}`, String(user.id), { expirationTtl: REFRESH_TTL });

  return ok(
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      role: user.role,
      subscription_expires_at: user.subscription_expires_at,
    },
    "登录成功"
  );
};
