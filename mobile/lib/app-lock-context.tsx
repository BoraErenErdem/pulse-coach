import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "@/lib/storage";

// 2026-08-26 güvenlik denetimi: uygulama sağlık verisi (kilo, öğün, mood,
// sohbet geçmişi) taşımasına rağmen token geçerliyse ek bir kilit ekranı
// olmadan doğrudan (tabs) grubuna geçiliyordu. Bu, notifications-context.tsx
// ile AYNI "OS izni + kullanıcı tercihi" ikili kontrolü deseni: cihaz
// biyometri/PIN desteklemiyorsa özellik tamamen gizli kalır (isSupported),
// destekliyorsa varsayılan AÇIK (opt-out, sağlık verisi hassasiyeti
// gerekçesiyle) ama kullanıcı Ayarlar'dan kapatabilir (kalıcı tercih).
const APP_LOCK_PREFERENCE_KEY = "pulsecoach_app_lock_preference";

interface AppLockContextValue {
  /** Cihaz biyometri/PIN destekliyor mu - false ise özellik tamamen gizlenir. */
  isSupported: boolean;
  /** Kullanıcının tercihi (yalnızca isSupported=true iken anlamlı). */
  isEnabled: boolean;
  /** Tercih/donanım kontrolü tamamlanana kadar true - bu sürede RootNavigator
   * bekletiliyor (auth-context'teki isLoading ile AYNI amaç). */
  isResolving: boolean;
  /** true ise (tabs) yerine kilit ekranı gösterilmeli. */
  isLocked: boolean;
  setEnabled: (next: boolean) => Promise<void>;
  /** Biyometri/PIN doğrulamasını tetikler, başarılıysa kilidi açar. */
  unlock: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isResolving, setIsResolving] = useState(true);
  // Soğuk açılışta, destekli+açık ise KİLİTLİ başlar - kontrol
  // tamamlanmadan (isResolving) hiçbir yere karar vermediğimiz için bu
  // başlangıç değeri hiç görünmez, sadece güvenli (pesimist) bir varsayılan.
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [hasHardware, isEnrolled, storedPreference] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          SecureStore.getItemAsync(APP_LOCK_PREFERENCE_KEY),
        ]);
        const supported = hasHardware && isEnrolled;
        // Tercih hiç kaydedilmemişse (ilk açılış) varsayılan AÇIK.
        const enabled = supported && storedPreference !== "off";
        setIsSupported(supported);
        setIsEnabled(enabled);
        setIsLocked(enabled);
      } catch {
        // Donanım sorgusu başarısız olursa (bazı emulator/web ortamları)
        // kilidi zorlamak yerine özelliği sessizce devre dışı bırak -
        // notifications-context'teki "sessizce yut" deseniyle tutarlı.
        setIsSupported(false);
        setIsEnabled(false);
        setIsLocked(false);
      } finally {
        setIsResolving(false);
      }
    })();
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    await SecureStore.setItemAsync(APP_LOCK_PREFERENCE_KEY, next ? "on" : "off");
    setIsEnabled(next);
    if (!next) setIsLocked(false);
    // next=true iken mevcut oturumu HEMEN kilitlemiyoruz - kullanıcı zaten
    // uygulama içindeyken açtı, bir sonraki soğuk açılıştan itibaren
    // geçerli olur (geriye dönük bir kilit beklenmiyor).
  }, []);

  const unlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "PulseCoach'a devam etmek için kimliğini doğrula",
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  return (
    <AppLockContext.Provider
      value={{ isSupported, isEnabled, isResolving, isLocked, setEnabled, unlock }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used within an AppLockProvider");
  }
  return ctx;
}
