// 账号字段白名单脱敏测试（核心安全不变量：敏感字段永不外泄）
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAccount } from "../sanitize.ts";

test("sanitizeAccount: 保留白名单字段", () => {
  const row = {
    id: 1, bot_name: "bot1", steam_username: "user1", status: "online",
    server_name: "srv", current_server_id: 2, expires_at: "2026-12-31T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z", display_name: null,
  };
  const out = sanitizeAccount(row);
  assert.equal(out.id, 1);
  assert.equal(out.bot_name, "bot1");
  assert.equal(out.steam_username, "user1");
  assert.equal(out.status, "online");
  assert.equal(out.server_name, "srv");
  assert.equal(out.server_id, 2);
  assert.equal(out.expires_at, "2026-12-31T00:00:00Z");
  assert.equal(out.display_name, null);
});

test("sanitizeAccount: 敏感字段不出现", () => {
  const row = {
    id: 1, bot_name: "bot1", steam_username: "user1", status: "online",
    server_name: null, current_server_id: null, expires_at: null,
    created_at: "2026-01-01T00:00:00Z", display_name: null,
    original_server_id: 5, password_iv: "iv", password_ct: "ct",
    migration_status: "migrated",
  };
  const out = sanitizeAccount(row) as Record<string, unknown>;
  assert.ok(!("original_server_id" in out));
  assert.ok(!("password_iv" in out));
  assert.ok(!("password_ct" in out));
  assert.ok(!("migration_status" in out));
  assert.ok(!("current_server_id" in out)); // 以 server_id 呈现，不暴露原始列名
});

test("sanitizeAccount: 缺失可选字段回退 null", () => {
  const row = { id: 1, bot_name: "b", steam_username: "u", status: "offline", created_at: "x" };
  const out = sanitizeAccount(row);
  assert.equal(out.server_name, null);
  assert.equal(out.expires_at, null);
  assert.equal(out.display_name, null);
});
