import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SecureStore from "@/lib/storage";
import { getUnreadCheckinCount } from "./api";
import { useAuth } from "./auth-context";
import { useLanguage } from "./language-context";
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  requestNotificationPermission,
  rescheduleLocalNotifications,
} from "./local-notifications";
import { useProfile } from "./profile-context";

type PermissionStatus = "unknown" | "granted" | "denied";

// disableNotifications OS iznini programatik olarak geri ALAMIYOR (Apple izin
// vermiyor) - sadece zamanlanmış bildirimleri iptal ediyor. Bu yüzden "kullanıcı
// bildirimleri kapattı" tercihini AYRICA cihazda saklamak gerekiyor - aksi
// halde açılışta sadece OS iznine bakmak (hâlâ "granted") kullanıcının az
// önce kapattığı toggle'ı tekrar açık gösterir (canlı cihaz testinde
// yakalandı, 2026-08-13).
const NOTIFICATIONS_PREFERENCE_KEY = "pulsecoach_notifications_preference";

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  permissionStatus: PermissionStatus;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Bildirimin taşıdığı derin bağlantı - haftalık özet Bildirimler ekranına
// (bkz. local-notifications.ts'teki data={"screen": ...}). Günlük hatırlatma
// derin bağlantı taşımaz, uygulamayı açar.
function screenToPath(screen: unknown): "/checkins" | null {
  if (screen === "checkins") return "/checkins";
  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("unknown");

  const refreshUnreadCount = useCallback(async () => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    try {
      const { count } = await getUnreadCheckinCount(token);
      setUnreadCount(count);
    } catch {
      // Sessizce yut - rozet güncellenemezse kullanıcı deneyimini bozmaz,
      // bir sonraki fırsatta (route değişimi/interval) tekrar denenir.
    }
  }, [token]);

  useEffect(() => {
    configureNotificationHandler();
    ensureAndroidChannel();
  }, []);

  useEffect(() => {
    // permissionStatus "unknown" ile başlıyor ve SADECE kullanıcı Profil'deki
    // toggle'a dokununca (enable/disableNotifications) güncelleniyordu - yani izin
    // daha önce verilmiş olsa bile her uygulama açılışında toggle "kapalı"
    // görünüyordu (canlı cihaz testinde yakalandı, 2026-08-13). Açılışta hem
    // gerçek OS iznine HEM kullanıcının son kaydedilen tercihine bakılıyor:
    // OS izni verilmemişse (Ayarlar'dan geri alınmış olabilir) her zaman
    // kapalı - bu OS'un üzerine yazılamaz. OS izni verilmişse kullanıcının
    // SON seçtiği tercih kazanır (kapatma sonrası OS izni hâlâ "granted"
    // kalır ama kullanıcı bilerek kapatmış olabilir).
    Promise.all([
      Notifications.getPermissionsAsync(),
      SecureStore.getItemAsync(NOTIFICATIONS_PREFERENCE_KEY),
    ]).then(([{ status }, storedPreference]) => {
      if (status !== "granted") {
        setPermissionStatus("denied");
        return;
      }
      setPermissionStatus(storedPreference === "off" ? "denied" : "granted");
    });
  }, []);

  useEffect(() => {
    function handleReadFunc() {
      refreshUnreadCount();
    }
    handleReadFunc();
    const interval = setInterval(handleReadFunc, 60_000);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  useEffect(() => {
    // expo-notifications'ın bildirim-yanıtı API'leri (getLastNotificationResponseAsync/
    // addNotificationResponseReceivedListener) web'de UYGULANMIYOR - bildirimler
    // zaten web'de anlamsız (native OS bildirimi yok), Expo web
    // üzerinden görsel test yaparken uygulamayı ilk yüklemede çökertiyordu
    // (2026-08-15, redesign turunun mobil doğrulaması sırasında bulundu).
    if (Platform.OS === "web") return;

    // Root Layout henüz mount olmadan (navigasyon state'i hazır değilken)
    // router.push() çağrılırsa "Attempted to navigate before mounting the
    // Root Layout component" hatası oluşuyor (soğuk başlangıçta bildirime
    // dokununca yakalandı, canlı cihaz testi 2026-08-13). navigationState?.key
    // doluncaya kadar bekle.
    if (!navigationState?.key) return;

    // Kapalıyken bir bildirime dokunup uygulama İLK KEZ açıldıysa. BİLEREK
    // `Notifications.useLastNotificationResponse()` hook'u KULLANILMIYOR -
    // o hook'un işlendikten sonra temizlenecek bir yolu yok, native taraf
    // aynı yanıtı döndürmeye devam ediyor ve her yeniden mount'ta (Fast
    // Refresh/DevTools dahil) navigasyonu tekrar tetikleyip "Maximum update
    // depth exceeded" sonsuz döngüsüne yol açıyordu (canlı cihaz testinde
    // yakalandı, bkz. github.com/expo/expo/discussions/22302). Bunun yerine
    // tek seferlik promise + işlendikten sonra clearLastNotificationResponseAsync.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const path = screenToPath(response.notification.request.content.data?.screen);
      if (path) {
        try {
          router.push(path);
        } catch {
          // Router hâlâ hazır değil - clear ÇAĞRILMADI, bir sonraki mount'ta
          // (navigationState.key değişince) aynı yanıt tekrar denenecek.
          return;
        }
      }
      Notifications.clearLastNotificationResponseAsync();
    });

    // Uygulama arka plandayken/açıkken bir bildirime dokunulduğunda.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = screenToPath(response.notification.request.content.data?.screen);
      if (path) {
        try {
          router.push(path);
        } catch {
          // yoksay - kullanıcı zaten uygulama içindeyken bu dal tetiklendiği
          // için router pratikte her zaman hazır, ama savunma amaçlı.
        }
      }
    });
    return () => subscription.remove();
  }, [router, navigationState?.key]);

  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      setPermissionStatus("denied");
      return false;
    }
    await SecureStore.setItemAsync(NOTIFICATIONS_PREFERENCE_KEY, "on");
    setPermissionStatus("granted");
    return true;
  }, []);

  const disableNotifications = useCallback(async () => {
    // OS izni programatik olarak geri alınamaz (kullanıcı Ayarlar'dan kendi
    // kapatmalı) - zamanlanmış bildirimler iptal edilir, "off" tercihi kalıcı
    // kaydedilir (yoksa OS izni hâlâ granted olduğu için bir sonraki açılışta
    // toggle yanlışlıkla tekrar açık görünür).
    await SecureStore.setItemAsync(NOTIFICATIONS_PREFERENCE_KEY, "off");
    setPermissionStatus("denied");
    await rescheduleLocalNotifications(null);
  }, []);

  // bkz. auth-context.tsx'teki AYNI perf notu (2026-09-21).
  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount, permissionStatus, enableNotifications, disableNotifications }),
    [unreadCount, refreshUnreadCount, permissionStatus, enableNotifications, disableNotifications]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}

/** Yerel bildirim planını profil tercihleri + dil + izinle senkron tutar.
 * NotificationsProvider'ın İÇİNDE değil, ProfileProvider/LanguageProvider'ın
 * altında render edilir (bkz. app/_layout.tsx) - Provider sırası onlardan önce.
 * Uygulama her öne geldiğinde plan baştan kurulur: o günün hatırlatması atlanır
 * (kullanıcı zaten uygulamada). */
export function LocalNotificationScheduler() {
  const { token, isLoading: isAuthLoading } = useAuth();
  const { profile } = useProfile();
  const { language } = useLanguage();
  const { permissionStatus } = useNotifications();
  const dailyEnabled = profile?.daily_nudge_enabled;
  const dailyHour = profile?.daily_nudge_hour ?? null;
  const weeklyEnabled = profile?.weekly_summary_enabled;

  useEffect(() => {
    if (Platform.OS === "web" || isAuthLoading || permissionStatus === "unknown") return;
    function sync() {
      if (!token || permissionStatus !== "granted") {
        void rescheduleLocalNotifications(null);
        return;
      }
      // Profil henüz yüklenmediyse mevcut plana dokunma (açılışta silip
      // "son çalan" kaydını kaybetmemek için).
      if (dailyEnabled === undefined || weeklyEnabled === undefined) return;
      void rescheduleLocalNotifications({ dailyEnabled, dailyHour, weeklyEnabled, language });
    }
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, [isAuthLoading, token, permissionStatus, dailyEnabled, dailyHour, weeklyEnabled, language]);

  return null;
}
