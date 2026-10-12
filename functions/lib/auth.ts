// 认证辅助：从请求中提取并校验 JWT
import { verifyJwt } from "./jwt.ts";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function authenticate(request: Request, secret: string): Promise<AuthUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const payload = await verifyJwt(token, secret);
  if (!payload) return null;
  return { id: Number(payload.sub), username: payload.username, role: payload.role };
}
