// 注册：免费注册（无需邀请码）；新用户 Steam 账户配额为 0，需兑换卡密获得配额/订阅
// 支持 INIT_ADMIN 引导创建管理员
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../lib/db.ts";
import { ok, fail } from "../../lib/db.ts";
import { hashPassword } from "../../lib/crypto.ts";
import { signJwt } from "../../lib/jwt.ts";
import { parseJson } from "../../lib/http.ts";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await parseJson<{ username?: string; password?: string }>(request);
  if (!body) return fail("请求体必须是 JSON");
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) return fail("用户名和密码不能为空");
  if (username.length > 32) return fail("用户名过长（最多 32 字符）");
  if (password.length < 6) return fail("密码至少 6 位");

  // 引导管理员：环境变量 INIT_ADMIN_USERNAME / INIT_ADMIN_PASSWORD 匹配时创建 admin
  const isBootstrapAdmin =
    !!env.INIT_ADMIN_USERNAME && username === env.INIT_ADMIN_USERNAME && password === env.INIT_ADMIN_PASSWORD;

  const role = isBootstrapAdmin ? "admin" : "user";
  // 普通用户默认配额 2（可添加 2 个 Steam 账号）；订阅状态 active（可登录），无到期时间（"无可用时间"，兑换卡密后获得）
  const quota = isBootstrapAdmin ? 1000 : 2;
  const subscriptionExpiresAt: string | null = null;

  const passwordHash = await hashPassword(password);

  try {
    const ins = await env.DB.prepare(
      "INSERT INTO users (username, password_hash, role, quota, subscription_expires_at) VALUES (?,?,?,?,?)"
    ).bind(username, passwordHash, role, quota, subscriptionExpiresAt).run();
    if (ins.meta.changes !== 1) throw new Error("insert failed");
  } catch {
    return fail("注册失败（用户名可能已存在）", 409);
  }

  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: number }>();

  // 普通用户预建 quota 个栏位（槽位）：卡密时长绑定栏位，账户绑定栏位继承时长
  if (!isBootstrapAdmin && row) {
    const stmt = env.DB.prepare("INSERT INTO account_slots (user_id, slot_index) VALUES (?, ?)");
    for (let i = 1; i <= quota; i++) {
      await stmt.bind(row.id, i).run();
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    { sub: String(row!.id), username, role, iat: now, exp: now + 15 * 60 },
    env.JWT_SECRET
  );
  // 签发 refresh token（30 天，KV 存储）
  const refreshToken = crypto.randomUUID();
  await env.KV.put(`refresh:${refreshToken}`, String(row!.id), { expirationTtl: 30 * 24 * 3600 });

  return ok(
    { access_token: accessToken, refresh_token: refreshToken, role, quota, expires_at: subscriptionExpiresAt },
    "注册成功"
  );
};
