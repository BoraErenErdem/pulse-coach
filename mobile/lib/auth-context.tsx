import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  getMe,
  login as apiLogin,
  logoutRequest,
  refreshAccessToken,
  type UserRead,
} from "./api";

// web/src/lib/auth-context.tsx'in mobil portu — aynı proaktif-yenileme deseni,
// localStorage yerine expo-secure-store (async okuma/yazma yüzünden restoreSession
// burada da zaten async, ekstra karmaşıklık yok).
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
      const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
      if (!storedRefreshToken) return;
      try {
        const result = await refreshAccessToken(storedRefreshToken);
        await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, result.access_token);
        await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, result.refresh_token);
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
      const storedAccessToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
      if (!storedAccessToken || !storedRefreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        // Uygulama yeniden açıldığında önce tazele - böylece access_token ne
        // kadar eski olursa olsun (telefon uzun süre kapalı kalmış olabilir)
        // en güncel haliyle başlıyoruz.
        const refreshed = await refreshAccessToken(storedRefreshToken);
        await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, refreshed.access_token);
        await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, refreshed.refresh_token);
        const me = await getMe(refreshed.access_token);
        setToken(refreshed.access_token);
        setUser(me);
        startProactiveRefresh();
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
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
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, access_token);
      await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, refresh_token);
      setToken(access_token);
      setUser(me);
      startProactiveRefresh();
    },
    [startProactiveRefresh]
  );

  const logout = useCallback(() => {
    stopProactiveRefresh();
    (async () => {
      const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
      router.replace("/login");
      if (storedRefreshToken) {
        // Sunucu tarafında da iptal et (best-effort - başarısız olsa da
        // kullanıcı deneyimini bloklamaz, token zaten yerel olarak temizlendi).
        logoutRequest(storedRefreshToken).catch(() => {});
      }
    })();
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
