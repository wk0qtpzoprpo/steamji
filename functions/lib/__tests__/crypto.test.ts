// 密码哈希 / AES-GCM / 账号密码解密 回归测试（Node 22: node --experimental-strip-types --test）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  encryptData,
  decryptData,
  decryptAccountPassword,
} from "../crypto.ts";

test("hashPassword/verifyPassword: 正确密码通过", async () => {
  const h = await hashPassword("secret123");
  assert.ok(h.startsWith("pbkdf2$100000$"));
  assert.equal(await verifyPassword("secret123", h), true);
});

test("hashPassword/verifyPassword: 错误密码拒绝", async () => {
  const h = await hashPassword("secret123");
  assert.equal(await verifyPassword("wrong", h), false);
});

test("hashPassword: 相同密码两次盐不同", async () => {
  const [a, b] = await Promise.all([hashPassword("pw"), hashPassword("pw")]);
  assert.notEqual(a, b);
});

test("hashPassword/verifyPassword: 非 pbkdf2 格式拒绝", async () => {
  assert.equal(await verifyPassword("pw", "md5$abc"), false);
  assert.equal(await verifyPassword("pw", "pbkdf2$100000$abc"), false);
});

test("encryptData/decryptData: 回环", async () => {
  const key = "00".repeat(32);
  const enc = await encryptData("steam-password-123", key);
  assert.equal(await decryptData(enc, key), "steam-password-123");
});

test("encryptData: 同明文两次 IV 不同", async () => {
  const key = "11".repeat(32);
  const [a, b] = await Promise.all([encryptData("same", key), encryptData("same", key)]);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test("decryptData: 错误 key 抛错", async () => {
  const key = "22".repeat(32);
  const enc = await encryptData("data", key);
  await assert.rejects(() => decryptData(enc, "33".repeat(32)));
});

test("decryptAccountPassword: 无密文回退空串", async () => {
  assert.equal(await decryptAccountPassword({}, "44".repeat(32)), "");
  assert.equal(await decryptAccountPassword({ password_iv: "a", password_ct: null }, "44".repeat(32)), "");
});

test("decryptAccountPassword: 解密失败回退空串", async () => {
  const key = "55".repeat(32);
  const enc = await encryptData("real", key);
  const out = await decryptAccountPassword({ password_iv: enc.iv, password_ct: enc.ct }, "66".repeat(32));
  assert.equal(out, "");
});
