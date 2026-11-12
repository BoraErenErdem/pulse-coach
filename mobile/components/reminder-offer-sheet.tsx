import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Check } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { useGoalButtonGreen } from "@/components/progress-identity";
import { useRampColor } from "@/components/surface-tone";
import { useThemeColors } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { tapSuccess } from "@/lib/haptics";
import { useT } from "@/lib/language-context";
import { DEFAULT_REMINDER_HOUR } from "@/lib/local-notifications";
import { useNotifications } from "@/lib/notifications-context";
import { useProfile } from "@/lib/profile-context";
import { markReminderOfferShown, subscribeReminderOffer } from "@/lib/reminder-offer";
import { useTheme } from "@/lib/theme-context";

// "Yarın hatırlatayım mı?" (1.0.2) - ilk başarılı kayıttan sonra bir kez. Tetikleme
// ve kurallar lib/reminder-offer.ts'te; "Evet" Ayarlar'daki düğmeyle AYNI yolu
// (enableNotifications) kullanır, plan LocalNotificationScheduler'da kurulur.
// Kök düzende (app/_layout.tsx) tek kopya: hangi sekmede kayıt yapılırsa yapılsın açılır.
export function ReminderOfferSheet() {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const rampColor = useRampColor();
  const buttonGreen = useGoalButtonGreen();
  const { token } = useAuth();
  const { profile } = useProfile();
  const { enableNotifications } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const dailyEnabled = profile?.daily_nudge_enabled !== false;
  const weeklyEnabled = profile?.weekly_summary_enabled !== false;
  const hasAnything = dailyEnabled || weeklyEnabled;

  useEffect(() => {
    if (!token || !hasAnything) return;
    return subscribeReminderOffer(() => {
      void markReminderOfferShown();
      setVisible(true);
    });
  }, [token, hasAnything]);

  // Çıkış yapılırsa açık sayfa kalmasın.
  useEffect(() => {
    if (!token) setVisible(false);
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      // OS penceresi burada açılır; reddedilirse sessizce kapanır (Ayarlar'daki
      // düğme iOS Ayarlar yolunu zaten anlatıyor).
      const granted = await enableNotifications();
      if (granted) tapSuccess();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }

  const hour = profile?.daily_nudge_hour ?? DEFAULT_REMINDER_HOUR;
  const time = `${String(hour).padStart(2, "0")}:00`;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.78)" : c.muted;
  const onButton = isDark ? "#0F3A21" : "#FFFFFF";
  const points = [
    dailyEnabled
      ? t(
          `Uygulamayı açmadığın günlerde, en fazla 3 günde bir saat ${time}'da kısa bir hatırlatma.`,
          `On days you don't open the app, a short reminder at ${time}, at most every 3 days.`
        )
      : null,
    weeklyEnabled
      ? t("Pazar akşamları haftalık değerlendirmen hazır olunca haber.", "A heads-up on Sunday evenings when your weekly check-in is ready.")
      : null,
    t(
      "Bildirimde sağlık verin görünmez; hatırlatmalar telefonunda kurulur, sunucuya bir şey gitmez.",
      "No health data appears in notifications; reminders are set up on your phone and nothing is sent to our server."
    ),
    t("Saati ya da tamamını Profil > Ayarlar'dan değiştirebilirsin.", "You can change the time or turn them off in Profile > Settings."),
  ].filter((p): p is string => p !== null);

  return (
    <BottomSheet
      visible={visible}
      onClose={() => setVisible(false)}
      backgroundColor={isDark ? rampColor(1) : c.surface}
      handleColor={isDark ? "rgba(255,255,255,0.35)" : c.border}
    >
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: `${c.accent}26`, borderColor: `${c.accent}66` }]}>
            <Bell size={22} color={c.accent} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: text }]}>{t("Yarın hatırlatayım mı?", "Want a reminder tomorrow?")}</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              {t("Düzenli kayıt, koçunun seni daha iyi tanımasını sağlar.", "Logging regularly helps your coach get to know you.")}
            </Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          {points.map((p) => (
            <View key={p} style={styles.pointRow}>
              <Check size={16} color={c.accent} strokeWidth={2.8} style={{ marginTop: 2 }} />
              <Text style={[styles.pointText, { color: text }]}>{p}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={accept}
          disabled={busy}
          style={[styles.save, { backgroundColor: buttonGreen, opacity: busy ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={onButton} /> : null}
          <Text style={[styles.saveText, { color: onButton }]}>{t("Evet, Hatırlat", "Yes, Remind Me")}</Text>
        </Pressable>
        <Pressable onPress={() => setVisible(false)} disabled={busy} style={styles.clear} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.clearText, { color: muted }]}>{t("Şimdi değil", "Not now")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// Ölçüler steps-card.tsx::StepsConsentSheet ile aynı.
const styles = StyleSheet.create({
  wrap: { gap: 16, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  pointRow: { flexDirection: "row", gap: 10 },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20 },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clear: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  clearText: { fontSize: 14 },
});
