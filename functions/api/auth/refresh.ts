// 刷新：用 refresh token 换新 access token（轮换 refresh）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, UserRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { signJwt } from "../../lib/jwt.ts";

const REFRESH_TTL = 30 * 24 * 3600;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { refresh_token?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("请求体必须是 JSON");
  }
  const token = (body.refresh_token || "").trim();
  if (!token) return fail("缺少 refresh_token");

  const userIdStr = await env.KV.get(`refresh:${token}`);
  if (!userIdStr) return fail("refresh_token 无效或已过期", 401);

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(userIdStr)).first<UserRow>();
  if (!user || user.status === "disabled") {
    await env.KV.delete(`refresh:${token}`);
    return fail("用户不存在或已被禁用", 401);
  }
  if (
    user.role !== "admin" &&
    (user.subscription_status === "expired" ||
      (user.subscription_expires_at && user.subscription_expires_at < new Date().toISOString()))
  ) {
    await env.KV.delete(`refresh:${token}`);
    return fail("服务已到期，请重新登录并续期", 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    { sub: String(user.id), username: user.username, role: user.role, iat: now, exp: now + 15 * 60 },
    env.JWT_SECRET
  );

  // 轮换：旧 refresh 作废，签发新 refresh
  await env.KV.delete(`refresh:${token}`);
  const refreshToken = crypto.randomUUID();
  await env.KV.put(`refresh:${refreshToken}`, String(user.id), { expirationTtl: REFRESH_TTL });

  return ok({ access_token: accessToken, refresh_token: refreshToken });
};
