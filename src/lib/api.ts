// 前端 API 客户端：统一携带 JWT，401 自动刷新，返回 Result 或抛出带 Message 的错误

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let accessToken: string | null = localStorage.getItem("asf_access");
let refreshToken: string | null = localStorage.getItem("asf_refresh");

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem("asf_access", access);
  else localStorage.removeItem("asf_access");
  if (refresh) localStorage.setItem("asf_refresh", refresh);
  else localStorage.removeItem("asf_refresh");
}

export function clearTokens() {
  setTokens(null, null);
}

export function hasToken(): boolean {
  return !!accessToken;
}

async function doFetch(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(path, { ...options, headers });
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const resp = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = (await resp.json()) as { Success?: boolean; Result?: { access_token: string; refresh_token: string } };
    if (resp.ok && data.Success && data.Result) {
      setTokens(data.Result.access_token, data.Result.refresh_token);
      return true;
    }
    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

interface ApiEnvelope {
  Success?: boolean;
  Message?: string;
  Result?: unknown;
}

async function handle<T>(resp: Response): Promise<T> {
  let data: ApiEnvelope | null = null;
  try {
    data = (await resp.json()) as ApiEnvelope;
  } catch {
    data = null;
  }
  if (!resp.ok || (data && data.Success === false)) {
    throw new ApiError(data?.Message || `请求失败 (${resp.status})`, resp.status, data);
  }
  return (data?.Result ?? data) as T;
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let resp = await doFetch(path, options);
  if (resp.status === 401 && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      resp = await doFetch(path, options);
    } else {
      throw new ApiError("登录已过期，请重新登录", 401);
    }
  }
  return handle<T>(resp);
}

export function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function putJson<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function del<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: "DELETE" });
}

// 原始响应（用于日志等非 JSON 内容），带 401 自动刷新重试
export async function apiRaw(path: string, options: RequestInit = {}): Promise<Response> {
  let resp = await doFetch(path, options);
  if (resp.status === 401 && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) resp = await doFetch(path, options);
  }
  return resp;
}
