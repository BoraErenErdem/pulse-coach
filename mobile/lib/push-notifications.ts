import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

// 2026-08-12: Expo SDK 53+ itibariyle push bildirimleri Expo Go'dan
// KALDIRILDI (hem iOS hem Android) - gerçek cihazda test için bir
// development build şart (bkz. mobile/eas.json). Bu dosyadaki hiçbir şey
// Expo Go'da çalışmaz, sadece dev-build/prod build'de anlamlıdır.

// Uygulama önplandayken OS banner'ı BASTIRILIR - kullanıcı zaten aynı anda
// ekranda in-app kutlamayı/rozeti görüyor, çift bildirim gereksiz.
// Arka plandayken/kapalıyken normal görünür (bu handler o zaman hiç
// çağrılmaz, OS kendi native banner'ını gösterir).
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const isForeground = AppState.currentState === "active";
      return {
        shouldShowBanner: !isForeground,
        shouldShowList: !isForeground,
        shouldPlaySound: !isForeground,
        shouldSetBadge: false,
      };
    },
  });
}

export async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** İzin ister, verilirse Expo push token'ını döner. Reddedilirse/hata
 * olursa null döner (çağıran taraf bunu "bildirimler kapalı" olarak ele
 * alır - açılışta DEĞİL, Profil'deki bağlamsal toggle'dan çağrılır). */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    // eas init henüz çalıştırılmamış (app.json'daki placeholder hâlâ duruyor).
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}
