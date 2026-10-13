// 展示格式化纯函数测试（format.ts 位于 src，从 functions 侧 import 以纳入 npm test）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtExpireSlash,
  fmtExpireDash,
  fmtDuration,
  steamCover,
} from "../../../src/lib/format.ts";

test("fmtExpireSlash: 正常日期与空值", () => {
  assert.equal(fmtExpireSlash("2026-11-12T00:00:00Z"), "2026/11/12");
  assert.equal(fmtExpireSlash(null), "无可用时间");
  assert.equal(fmtExpireSlash("not-a-date"), "无可用时间");
});

test("fmtExpireDash: 正常日期与非法输入", () => {
  assert.equal(fmtExpireDash("2026-11-12T00:00:00Z"), "2026-11-12");
  assert.equal(fmtExpireDash("garbage"), "garbage".slice(0, 10));
});

test("fmtDuration: 秒数格式化", () => {
  assert.equal(fmtDuration(0), "00:00:00");
  assert.equal(fmtDuration(3661), "01:01:01");
  assert.equal(fmtDuration(-5), "00:00:00");
  assert.equal(fmtDuration(86400), "24:00:00");
});

test("steamCover: AppID 映射与空值", () => {
  assert.equal(steamCover(730), "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg");
  assert.equal(steamCover(undefined), null);
});
