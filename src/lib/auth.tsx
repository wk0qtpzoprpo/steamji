// 登录状态管理
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearTokens, hasToken, setTokens } from "./api";

export interface Me {
  user: {
    id: number;
    username: string;
    role: string;
    quota: number;
    subscription_expires_at: string | null;
    subscription_status: string;
    created_at: string;
  };
  account_count: number;
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
  login: (access: string, refresh: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  me: null,
  loading: true,
  reload: async () => undefined,
  login: () => undefined,
  logout: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // 网络/服务器瞬时故障时退避重试（token 仍有效则不误判登出）
  const reload = useCallback(async (attempt = 0): Promise<void> => {
    if (!hasToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<Me>("/api/me");
      setMe(data);
      setLoading(false);
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 403) {
        // 到期/禁用：清空并回到登录页
        clearTokens();
        setMe(null);
        setLoading(false);
        if (typeof window !== "undefined") window.location.href = "/login";
      } else if (e.status === 401) {
        // 确认 token 无效：清空（Protected 会回到登录页）
        clearTokens();
        setMe(null);
        setLoading(false);
      } else {
        // 网络错误 / 5xx：token 仍有效，自动重试（最多 5 次），避免误弹登录页
        if (attempt < 5) {
          setTimeout(() => {
            void reload(attempt + 1);
          }, 800 * (attempt + 1));
          return; // 保持 loading
        }
        // 重试耗尽：进入"待重试"状态（Protected 显示重试按钮，不弹登录页）
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback((access: string, refresh: string) => {
    setTokens(access, refresh);
    void reload();
  }, [reload]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // 忽略
    }
    clearTokens();
    setMe(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, reload, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
