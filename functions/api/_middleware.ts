// /api/* 认证中间件：JWT 校验 + 订阅状态检查
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../lib/db.ts";
import { json } from "../lib/db.ts";
import { authenticate } from "../lib/auth.ts";

const PUBLIC_PATHS = ["/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/renew", "/api/auth/logout", "/api/cron"];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (isPublic) {
    return next();
  }

  const user = await authenticate(request, env.JWT_SECRET);
  if (!user) {
    return json({ Success: false, Message: "未认证或登录已过期，请重新登录" }, 401);
  }

  if (user.role !== "admin") {
    const row = await env.DB.prepare(
      "SELECT status, subscription_status FROM users WHERE id = ?"
    ).bind(user.id).first<{ status: string; subscription_status: string }>();
    if (!row || row.status === "disabled") {
      return json({ Success: false, Message: "账号已被禁用" }, 403);
    }
    if (row.subscription_status === "expired") {
      return json({ Success: false, Message: "服务已到期，请续期" }, 403);
    }
  }

  context.data.user = user;
  return next();
};
