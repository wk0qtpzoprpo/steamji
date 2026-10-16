// 刷新：用 refresh token 换新 access token（轮换 refresh）
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, UserRow } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { signJwt } from "../../lib/jwt.ts";
import { parseJson } from "../../lib/http.ts";

const REFRESH_TTL = 30 * 24 * 3600;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await parseJson<{ refresh_token?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const token = (body.refresh_token || "").trim();
  if (!token) return fail("缺少 refresh_token");

  const raw = await env.KV.get(`refresh:${token}`);
  if (!raw) return fail("refresh_token 无效或已过期", 401);

  // 解析 KV value：新格式 JSON {uid, iat}；兼容旧格式纯数字（视为 iat=0，一律失效）
  let userId: number;
  let issuedAt: number;
  try {
    const obj = JSON.parse(raw);
    userId = Number(obj.uid);
    issuedAt = Number(obj.iat) || 0;
  } catch {
    userId = Number(raw);
    issuedAt = 0;
  }
  if (!userId) return fail("refresh_token 无效或已过期", 401);

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
  if (!user || user.status === "disabled") {
    await env.KV.delete(`refresh:${token}`);
    return fail("用户不存在或已被禁用", 401);
  }
  // 改密后旧 refresh_token 失效：签发时间早于 refresh_valid_after 一律拒绝
  if (user.refresh_valid_after && issuedAt < Math.floor(new Date(user.refresh_valid_after).getTime() / 1000)) {
    await env.KV.delete(`refresh:${token}`);
    return fail("密码已修改，请重新登录", 401);
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

  // 轮换：旧 refresh 作废，签发新 refresh（同样存 JSON {uid, iat}）
  await env.KV.delete(`refresh:${token}`);
  const refreshToken = crypto.randomUUID();
  await env.KV.put(
    `refresh:${refreshToken}`,
    JSON.stringify({ uid: user.id, iat: now }),
    { expirationTtl: REFRESH_TTL }
  );

  return ok({ access_token: accessToken, refresh_token: refreshToken });
};
