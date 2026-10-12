// APPID 解析纯函数测试
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppIds } from "../ids.ts";

test("parseAppIds: 正常 JSON 数组", () => {
  assert.deepEqual(parseAppIds("[730, 440, 570]"), [730, 440, 570]);
});

test("parseAppIds: 过滤非数字", () => {
  assert.deepEqual(parseAppIds('[730, "abc", 440, null]'), [730, 440]);
});

test("parseAppIds: 非法 JSON 返回空数组", () => {
  assert.deepEqual(parseAppIds("not-json"), []);
  assert.deepEqual(parseAppIds(""), []);
});

test("parseAppIds: 非数组对象返回空数组", () => {
  assert.deepEqual(parseAppIds('{"a":1}'), []);
});
