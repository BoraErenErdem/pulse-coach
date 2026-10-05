import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "@/lib/storage";
import type { PreferredLanguage } from "@/lib/language-storage";

// 2026-10-05 (KVKK): sunucu artık push GÖNDERMİYOR (Expo/ABD'ye aktarım yok).
// Hatırlatma ve haftalık özet bildirimleri bu dosyada, cihazın kendisinde
// zamanlanıyor - sunucuya bildirim jetonu ya da başka bir şey gitmiyor. Metinler
// JENERİK (kilit ekranında görünür): sağlık verisi, kilo, egzersiz, ruh hâli yok.
// expo-notifications dev client'ta zaten var (yeni native build gerekmez).

/** Profildeki daily_nudge_hour boşken kullanılan saat (backend config daily_nudge_hour). */
export const DEFAULT_REMINDER_HOUR = 18;
// Haftalık özet sunucuda kullanıcının yerel Pazar 12:00'sinde üretiliyor
// (backend config weekly_checkin_hour); bildirim aynı gün akşam - arada LLM
// kuyruğuna bol pay var, bildirim geldiğinde mesaj hazır.
const WEEKLY_WEEKDAY_SUNDAY = 1; // expo-notifications: 1 = Pazar
const WEEKLY_HOUR = 20;
// Günlük hatırlatma: uygulamanın açılmadığı günlerde, en fazla 3 günde bir.
// Uygulama her öne geldiğinde plan baştan kurulduğu için o gün (açıldı) atlanır.
// En fazla 3 hatırlatma kurulur (~1 hafta): uzun süre açılmayan uygulama dırdır etmez.
const REMINDER_GAP_DAYS = 3;
const REMINDER_COUNT = 3;
const DAILY_ID_PREFIX = "daily-reminder-";
const WEEKLY_ID = "weekly-summary";
// Kurulan günlük hatırlatma zamanları - bir sonraki planda "en son hangisi
// gerçekten çaldı" bulunup 3 gün kuralı uygulamalar arası da korunuyor.
const DAILY_TIMES_KEY = "pulsecoach_daily_reminder_times";
const ANDROID_CHANNEL_ID = "default";
const DAY_MS = 24 * 60 * 60 * 1000;

const TEXT = {
  daily: {
    tr: "Bugün nasıl geçiyor? Öğünlerini ve ruh hâlini kaydetmeyi unutma.",
    en: "How's your day going? Don't forget to log your meals and mood.",
  },
  weekly: {
    tr: "Koçunun haftalık değerlendirmesi hazır.",
    en: "Your coach's weekly check-in is ready.",
  },
} as const;

export interface ReminderPlan {
  dailyEnabled: boolean;
  dailyHour: number | null;
  weeklyEnabled: boolean;
  language: PreferredLanguage;
}

// Uygulama önplandayken OS banner'ı BASTIRILIR - kullanıcı zaten uygulamanın
// içinde. Arka plandayken/kapalıyken normal görünür (bu handler o zaman hiç
// çağrılmaz, OS kendi banner'ını gösterir).
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
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** İzin ister; verildiyse true. Açılışta DEĞİL, Profil'deki bağlamsal
 * toggle'dan çağrılır. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/** Bir sonraki günlük hatırlatma zamanları: yarından başlar (bugün uygulama
 * açık), son çalan hatırlatmadan en az REMINDER_GAP_DAYS sonra, aralarında
 * REMINDER_GAP_DAYS gün. Saat cihazın yerel saati. */
export function planDailyReminderTimes(now: Date, hour: number, lastFiredAt: number | null): Date[] {
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0);
  if (lastFiredAt !== null) {
    while (first.getTime() < lastFiredAt + REMINDER_GAP_DAYS * DAY_MS - DAY_MS / 2) {
      first.setDate(first.getDate() + 1);
    }
  }
  return Array.from({ length: REMINDER_COUNT }, (_, i) => {
    const date = new Date(first);
    date.setDate(first.getDate() + i * REMINDER_GAP_DAYS);
    return date;
  });
}

async function lastFiredReminder(now: number): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(DAILY_TIMES_KEY);
    const times: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(times)) return null;
    const fired = times.filter((t): t is number => typeof t === "number" && t <= now);
    return fired.length ? Math.max(...fired) : null;
  } catch {
    return null;
  }
}

async function applyPlan(plan: ReminderPlan | null): Promise<void> {
  const now = Date.now();
  const lastFired = await lastFiredReminder(now);
  await Notifications.cancelAllScheduledNotificationsAsync();
  const scheduledDaily: number[] = [];
  if (plan?.dailyEnabled) {
    const times = planDailyReminderTimes(new Date(now), plan.dailyHour ?? DEFAULT_REMINDER_HOUR, lastFired);
    for (const [i, date] of times.entries()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DAILY_ID_PREFIX}${i}`,
        content: { title: "PulseCoach", body: TEXT.daily[plan.language] },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: ANDROID_CHANNEL_ID },
      });
      scheduledDaily.push(date.getTime());
    }
  }
  if (plan?.weeklyEnabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_ID,
      content: { title: "PulseCoach", body: TEXT.weekly[plan.language], data: { screen: "checkins" } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: WEEKLY_WEEKDAY_SUNDAY,
        hour: WEEKLY_HOUR,
        minute: 0,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  }
  // Çalmış son hatırlatma da saklanır - plan kapalıyken bile 3 gün kuralı
  // yeniden açılınca bozulmasın.
  const keep = lastFired !== null ? [lastFired, ...scheduledDaily] : scheduledDaily;
  await SecureStore.setItemAsync(DAILY_TIMES_KEY, JSON.stringify(keep));
}

let queue: Promise<void> = Promise.resolve();

/** Tüm yerel bildirimleri plana göre baştan kurar; `null` hepsini iptal eder
 * (çıkış, bildirim kapalı). Art arda çağrılar sıraya girer - iki plan aynı anda
 * iptal/kur yapıp birbirini bozmaz. Web'de yerel bildirim yok, no-op. */
export function rescheduleLocalNotifications(plan: ReminderPlan | null): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  queue = queue.then(() => applyPlan(plan)).catch(() => {
    // Bildirim kurulamazsa uygulamanın geri kalanı etkilenmez; bir sonraki
    // öne gelişte yeniden denenir.
  });
  return queue;
}
