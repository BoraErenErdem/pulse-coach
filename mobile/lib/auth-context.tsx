import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";
import * as SecureStore from "@/lib/storage";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  getMe,
  isRefreshRejected,
  login as apiLogin,
  logoutRequest,
  tryRefreshStoredAccessToken,
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
  /** Google/Apple akışları (bkz. oauth-buttons.tsx, oauth-consent.tsx) -
   * backend zaten geçerli bir access_token/refresh_token çifti üretmiş
   * (ya doğrudan /auth/oauth/google|apple'dan, ya da rıza sonrası
   * /auth/oauth/complete'ten) - `login`daki AYNI "sakla + /users/me çek +
   * proaktif yenilemeyi başlat" adımlarını, e-posta/şifreyle tekrar
   * `/auth/login`a gitmeden uyguluyor. */
  applyTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Proaktif interval closure'ı `user` state'ini göremediği için ref'le izleniyor.
  const userLoadedRef = useRef(false);
  useEffect(() => {
    userLoadedRef.current = user !== null;
  }, [user]);

  const stopProactiveRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  const startProactiveRefresh = useCallback(() => {
    stopProactiveRefresh();
    refreshIntervalRef.current = setInterval(async () => {
      // tryRefreshStoredAccessToken kendi içinde dedup'lı - apiFetch'in
      // 401-retry'ıyla AYNI anda tetiklenirse ikisi de tek bir gerçek isteği
      // paylaşır (2026-08-10 pürüz taraması, Tema D - önceden burada
      // BAĞIMSIZ bir refreshAccessToken çağrısı vardı, aynı ham refresh_token
      // iki ayrı isteğe gidip rotasyon "reuse" sayılabiliyor, kaybeden
      // tarafın kazananın az önce yazdığı geçerli token'ları silmesine yol
      // açabiliyordu).
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        setToken(freshToken);
        // Uygulama ağsız açıldıysa `user` henüz yüklenemedi (bkz.
        // restoreSession) - bağlantı ilk geri geldiğinde tamamlanır.
        if (!userLoadedRef.current) {
          getMe(freshToken)
            .then(setUser)
            .catch(() => {});
        }
      }
      // Yenileme başarısız olursa (ör. refresh_token da süresi dolmuş)
      // kullanıcıyı hemen atmıyoruz, bir sonraki gerçek API çağrısı zaten
      // 401 alıp apiFetch'in kendi tek seferlik retry'ından geçecek.
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
        // en güncel haliyle başlıyoruz. tryRefreshStoredAccessToken dedup'lı
        // (bkz. api.ts) - proaktif interval veya bir 401-retry'la aynı ana
        // denk gelirse tek bir gerçek istek paylaşılır.
        const freshToken = await tryRefreshStoredAccessToken();
        if (!freshToken) {
          // tryRefreshStoredAccessToken token'ları SADECE sunucu kesin
          // reddettiğinde siler. Hâlâ duruyorlarsa hata geçiciydi (ağ yok /
          // sunucu düşük) - kullanıcıyı atmak yerine kayıtlı oturumla devam
          // ediliyor, ekranlar kendi ağ hatasını gösterir, bağlantı gelince
          // ilk istek (401-retry) ya da proaktif interval oturumu tazeler.
          const stillStored = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
          if (stillStored) {
            setToken(storedAccessToken);
            startProactiveRefresh();
          }
          return;
        }
        setToken(freshToken);
        startProactiveRefresh();
        setUser(await getMe(freshToken));
      } catch (error) {
        // getMe hatası: oturum SADECE sunucu token'ı reddettiyse kapatılır.
        if (isRefreshRejected(error)) {
          await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
          stopProactiveRefresh();
          setToken(null);
        }
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
    return () => stopProactiveRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTokens = useCallback(
    async (access_token: string, refresh_token: string) => {
      const me = await getMe(access_token);
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, access_token);
      await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, refresh_token);
      setToken(access_token);
      setUser(me);
      startProactiveRefresh();
    },
    [startProactiveRefresh]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token, refresh_token } = await apiLogin(email, password);
      await applyTokens(access_token, refresh_token);
    },
    [applyTokens]
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

  // Perf bulgusu (2026-09-21, kullanıcı gerçek cihazda React Native DevTools
  // Profiler'la sekmeler arası hızlı geçişte kasma yakaladı - kök neden
  // taramasında bulundu): bu nesne ÖNCEDEN her render'da YENİDEN
  // oluşturuluyordu - bu Provider UYGULAMANIN TAMAMINI sardığı için, HER
  // yeniden oluşturma `useAuth()` kullanan TÜM ekranların gereksiz yeniden
  // render olmasına yol açabiliyordu (memoize edilmemiş bir alt bileşen
  // context değeri değişince HER ZAMAN yeniden render olur). `useMemo` ile
  // sadece gerçekten değişen bir alan olduğunda yeni nesne üretiliyor.
  const value = useMemo(
    () => ({ token, user, isLoading, login, applyTokens, logout }),
    [token, user, isLoading, login, applyTokens, logout]
  );

  return (
    <AuthContext.Provider value={value}>
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
