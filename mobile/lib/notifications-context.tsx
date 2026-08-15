import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SecureStore from "@/lib/storage";
import { getUnreadCheckinCount, registerPushToken } from "./api";
import { useAuth } from "./auth-context";
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  registerForPushNotificationsAsync,
} from "./push-notifications";

type PermissionStatus = "unknown" | "granted" | "denied";

// disablePush OS iznini programatik olarak geri ALAMIYOR (Apple izin
// vermiyor) - sadece sunucudaki token'ı temizliyor. Bu yüzden "kullanıcı
// bildirimleri kapattı" tercihini AYRICA cihazda saklamak gerekiyor - aksi
// halde açılışta sadece OS iznine bakmak (hâlâ "granted") kullanıcının az
// önce kapattığı toggle'ı tekrar açık gösterir (canlı cihaz testinde
// yakalandı, 2026-08-13).
const NOTIFICATIONS_PREFERENCE_KEY = "pulsecoach_notifications_preference";

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  permissionStatus: PermissionStatus;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Bildirim türünün taşıdığı derin bağlantı - haftalık/günlük özet
// Bildirimler ekranına, PR/hedef Antrenman sekmesine (bkz. backend
// notification_service.py/scheduler/jobs.py'deki data={"screen": ...}).
function screenToPath(screen: unknown): "/checkins" | "/workouts" | null {
  if (screen === "checkins") return "/checkins";
  if (screen === "workouts") return "/workouts";
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
    // toggle'a dokununca (enablePush/disablePush) güncelleniyordu - yani izin
    // daha önce verilmiş olsa bile her uygulama açılışında toggle "kapalı"
    // görünüyordu (canlı cihaz testinde yakalandı, 2026-08-13). Açılışta hem
    // gerçek OS iznine HEM kullanıcının son kaydedilen tercihine bakılıyor:
    // OS izni verilmemişse (Ayarlar'dan geri alınmış olabilir) her zaman
    // kapalı - bu OS'un üzerine yazılamaz. OS izni verilmişse kullanıcının
    // SON seçtiği tercih kazanır (disablePush sonrası OS izni hâlâ "granted"
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
    // addNotificationResponseReceivedListener) web'de UYGULANMIYOR - push
    // bildirimleri zaten web'de anlamsız (native OS bildirimi yok), Expo web
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

  const enablePush = useCallback(async () => {
    if (!token) return false;
    const expoPushToken = await registerForPushNotificationsAsync();
    if (!expoPushToken) {
      setPermissionStatus("denied");
      return false;
    }
    await registerPushToken(token, expoPushToken);
    await SecureStore.setItemAsync(NOTIFICATIONS_PREFERENCE_KEY, "on");
    setPermissionStatus("granted");
    return true;
  }, [token]);

  const disablePush = useCallback(async () => {
    if (!token) return;
    // OS izni programatik olarak geri alınamaz (kullanıcı Ayarlar'dan kendi
    // kapatmalı) - burada sadece sunucudaki kaydı temizliyoruz, bir daha bu
    // kullanıcıya push gönderilmeye çalışılmaz. "off" tercihini de kalıcı
    // kaydediyoruz - aksi halde OS izni hâlâ granted olduğu için bir sonraki
    // açılışta toggle yanlışlıkla tekrar açık görünür.
    await registerPushToken(token, null);
    await SecureStore.setItemAsync(NOTIFICATIONS_PREFERENCE_KEY, "off");
    setPermissionStatus("denied");
  }, [token]);

  return (
    <NotificationsContext.Provider
      value={{ unreadCount, refreshUnreadCount, permissionStatus, enablePush, disablePush }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
