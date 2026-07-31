"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  getMe,
  login as apiLogin,
  logoutRequest,
  refreshAccessToken,
  type UserRead,
} from "@/lib/api";

// access_token 30dk'da düşüyor - refresh_token (30 gün) sekmenin açık kaldığı
// sürece bunu sessizce yeniliyor. 20dk'lık bir aralık, 30dk'lık pencerenin
// içinde rahatça kalıp access_token'ın hiç gerçekten expire olmasını engelliyor.
const PROACTIVE_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

interface AuthContextValue {
  token: string | null;
  user: UserRead | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProactiveRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  const startProactiveRefresh = useCallback(() => {
    stopProactiveRefresh();
    refreshIntervalRef.current = setInterval(async () => {
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (!storedRefreshToken) return;
      try {
        const result = await refreshAccessToken(storedRefreshToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, result.access_token);
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, result.refresh_token);
        setToken(result.access_token);
      } catch {
        // Sessiz yenileme başarısız (ör. refresh_token da süresi dolmuş) -
        // kullanıcıyı hemen atmıyoruz, bir sonraki gerçek API çağrısı zaten
        // 401 alıp apiFetch'in kendi tek seferlik retry'ından geçecek.
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS);
  }, [stopProactiveRefresh]);

  useEffect(() => {
    async function restoreSession() {
      const storedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (!storedAccessToken || !storedRefreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        // Sayfa yeniden yüklendiğinde önce tazele - böylece access_token
        // ne kadar eski olursa olsun (sekme uzun süre kapalı kalmış olabilir)
        // en güncel haliyle başlıyoruz.
        const refreshed = await refreshAccessToken(storedRefreshToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, refreshed.access_token);
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshed.refresh_token);
        const me = await getMe(refreshed.access_token);
        setToken(refreshed.access_token);
        setUser(me);
        startProactiveRefresh();
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
    return () => stopProactiveRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token, refresh_token } = await apiLogin(email, password);
      const me = await getMe(access_token);
      localStorage.setItem(TOKEN_STORAGE_KEY, access_token);
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh_token);
      setToken(access_token);
      setUser(me);
      startProactiveRefresh();
    },
    [startProactiveRefresh]
  );

  const logout = useCallback(() => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    stopProactiveRefresh();
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    router.push("/login");
    if (storedRefreshToken) {
      // Sunucu tarafında da iptal et (best-effort - başarısız olsa da
      // kullanıcı deneyimini bloklamaz, token zaten yerel olarak temizlendi).
      logoutRequest(storedRefreshToken).catch(() => {});
    }
  }, [router, stopProactiveRefresh]);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
