// JWT（HS256，WebCrypto 手写实现）回归测试
import { test } from "node:test";
import assert from "node:assert/strict";
import { signJwt, verifyJwt } from "../jwt.ts";

const SECRET = "test-secret-key";

test("signJwt/verifyJwt: 回环", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: "1", username: "admin", role: "admin", iat: now, exp: now + 900 }, SECRET);
  const payload = await verifyJwt(token, SECRET);
  assert.ok(payload);
  assert.equal(payload!.username, "admin");
  assert.equal(payload!.role, "admin");
  assert.equal(payload!.sub, "1");
});

test("verifyJwt: 篡改签名拒绝", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: "1", username: "admin", role: "admin", iat: now, exp: now + 900 }, SECRET);
  const [h, b, s] = token.split(".");
  const forged = `${h}.${b}.${s[0] === "A" ? "B" + s.slice(1) : "A" + s.slice(1)}`;
  assert.equal(await verifyJwt(forged, SECRET), null);
});

test("verifyJwt: 过期 token 拒绝", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: "1", username: "u", role: "user", iat: now - 2000, exp: now - 1000 }, SECRET);
  assert.equal(await verifyJwt(token, SECRET), null);
});

test("verifyJwt: 错误 secret 拒绝", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: "1", username: "u", role: "user", iat: now, exp: now + 900 }, SECRET);
  assert.equal(await verifyJwt(token, "other-secret"), null);
});

test("verifyJwt: 格式错误拒绝", async () => {
  assert.equal(await verifyJwt("only-two-parts", SECRET), null);
  assert.equal(await verifyJwt("", SECRET), null);
  assert.equal(await verifyJwt("a.b.c.d", SECRET), null);
});
