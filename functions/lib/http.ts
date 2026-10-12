// HTTP 公共 helper：JSON 解析与管理员校验，收敛各 API 端点的重复样板
import { fail } from "./db.ts";

// 安全解析 JSON 请求体；解析失败返回 null（调用方统一返回"请求体必须是 JSON"）
export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// 管理员权限校验；通过返回 null，拒绝返回可直接 return 的 Response
export function requireAdmin(user: { role: string }): Response | null {
  return user.role === "admin" ? null : fail("需要管理员权限", 403);
}
