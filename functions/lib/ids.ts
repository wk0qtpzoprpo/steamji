// 账号/ID 纯函数：APPID 解析（可单测，无外部依赖）
// 从 play_sessions.app_ids 的 JSON 字符串解析数字数组，过滤非数字
export function parseAppIds(s: string): number[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}
