// D1 / KV 环境类型与公共响应工具
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  ENCRYPT_KEY: string;
  INIT_ADMIN_USERNAME?: string;
  INIT_ADMIN_PASSWORD?: string;
  CRON_TOKEN?: string;
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  quota: number;
  status: string;
  subscription_expires_at: string | null;
  subscription_status: string;
  created_at: string;
}

export interface ServerRow {
  id: number;
  name: string;
  tunnel_url: string;
  asf_password_iv: string | null;
  asf_password_ct: string | null;
  status: string;
  bot_count: number;
  offline_since: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface AccountRow {
  id: number;
  user_id: number;
  bot_name: string;
  steam_username: string;
  password_iv: string;
  password_ct: string;
  current_server_id: number | null;
  original_server_id: number | null;
  migration_status: string;
  status: string;
  created_at: string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function ok(result: unknown, message = "OK") {
  return json({ Success: true, Message: message, Result: result });
}

export function fail(message: string, status = 400) {
  return json({ Success: false, Message: message }, status);
}
