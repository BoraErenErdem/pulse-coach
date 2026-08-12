import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { getUnreadCheckinCount, registerPushToken } from "./api";
import { useAuth } from "./auth-context";
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  registerForPushNotificationsAsync,
} from "./push-notifications";

type PermissionStatus = "unknown" | "granted" | "denied";

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
    function handleReadFunc() {
      refreshUnreadCount();
    }
    handleReadFunc();
    const interval = setInterval(handleReadFunc, 60_000);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  useEffect(() => {
    // Kapalıyken bir bildirime dokunup uygulama İLK KEZ açıldıysa.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const path = screenToPath(response?.notification.request.content.data?.screen);
      if (path) router.push(path);
    });

    // Uygulama arka plandayken/açıkken bir bildirime dokunulduğunda.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = screenToPath(response.notification.request.content.data?.screen);
      if (path) router.push(path);
    });
    return () => subscription.remove();
  }, [router]);

  const enablePush = useCallback(async () => {
    if (!token) return false;
    const expoPushToken = await registerForPushNotificationsAsync();
    if (!expoPushToken) {
      setPermissionStatus("denied");
      return false;
    }
    await registerPushToken(token, expoPushToken);
    setPermissionStatus("granted");
    return true;
  }, [token]);

  const disablePush = useCallback(async () => {
    if (!token) return;
    // OS izni programatik olarak geri alınamaz (kullanıcı Ayarlar'dan kendi
    // kapatmalı) - burada sadece sunucudaki kaydı temizliyoruz, bir daha bu
    // kullanıcıya push gönderilmeye çalışılmaz.
    await registerPushToken(token, null);
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
