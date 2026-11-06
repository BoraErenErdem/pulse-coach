import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight, Footprints } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { GlassShell } from "@/components/progress-cards";
import { useRampColor } from "@/components/surface-tone";
import { useGoalButtonGreen } from "@/components/progress-identity";
import { useThemeColors } from "@/components/ui";
import { useWorkoutIdentityColors } from "@/components/workout-identity";
import {
  ApiError,
  deleteSteps,
  getStepSummary,
  giveStepsConsent,
  localDateKey,
  syncSteps,
  type StepDay,
  type StepSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatInt } from "@/lib/format";
import { tapLight, tapSuccess } from "@/lib/haptics";
import {
  connectSteps,
  disconnectSteps,
  isStepSourceAvailable,
  isStepsConnected,
  readDailySteps,
} from "@/lib/health-steps";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";

// Günlük adım kartı (2026-11-06, kullanıcı geri bildirimi) - Antrenman sekmesinde
// Haftalık Hedef'in altında. Kendi verisini yükler: odaklanışta ve uygulama öne
// gelince Apple Sağlık'tan son 7 günü okuyup (değiştiyse) sunucuya eşitler, sonra
// özeti çeker. Tasarım WeeklyGoalCard kalıbı (cam kutu, soldurulmuş gradyan),
// vurgu Antrenman ailesinin mercan tonu (`sets`) - kırmızı Haftalık Hedef'ten ayrışsın.
// Kalori YALNIZ BİLGİ: günlük hedefe eklenmez (bkz. backend step_service.py).
// Web/Android: eşitleme yok, sunucuda veri varsa salt okunur gösterilir.

const STEPS_GRADIENT_DARK: [string, string] = ["#9E5236", "#542A1E"];
const DAY_LETTERS = {
  tr: ["P", "S", "Ç", "P", "C", "C", "P"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
} as const;

type Phase = "loading" | "invite" | "connected" | "hidden";

function lastSevenDays(today: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => localDateKey(new Date(y, m - 1, d - 6 + i)));
}

function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7; // Pazartesi = 0
}

export const StepsCard = memo(function StepsCard() {
  const { token } = useAuth();
  const t = useT();
  const [phase, setPhase] = useState<Phase>("loading");
  const [summary, setSummary] = useState<StepSummary | null>(null);
  const [canSync, setCanSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastSentRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  // Çalışırken gelen istek (ör. bağlanınca, odaklanış yenilemesi sürerken) kaybolmasın: biter bitmez bir kez daha.
  const rerunRef = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      const available = await isStepSourceAvailable();
      let connected = available && (await isStepsConnected());
      setCanSync(available);
      if (connected) {
        try {
          const days = await readDailySteps(7);
          const signature = JSON.stringify(days);
          if (days.length > 0 && signature !== lastSentRef.current) {
            await syncSteps(token, { source: "apple_health", days });
            lastSentRef.current = signature;
          }
        } catch (err) {
          // 403 = sunucuda rıza yok (ör. web'den bağlantı kesildi): cihazdaki "bağlı" işaretini de kaldır.
          if (err instanceof ApiError && err.status === 403) {
            await disconnectSteps();
            connected = false;
          }
          // Diğer okuma/eşitleme hataları kartı gizlemesin; sunucudaki son veri gösterilir.
        }
      }
      const next = await getStepSummary(token, 7);
      setSummary(next);
      setPhase((connected && next.consented) || next.has_data ? "connected" : available ? "invite" : "hidden");
    } catch {
      setPhase((p) => (p === "loading" ? "hidden" : p));
    } finally {
      runningRef.current = false;
    }
    if (rerunRef.current) {
      rerunRef.current = false;
      await refresh();
    }
  }, [token]);

  useDebouncedFocusEffect(refresh);

  // Uygulama arka plandan dönünce (yürüyüşten sonra) güncel sayı.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Bağlan: önce ayrı açık rıza (KVKK 2.1) sayfası, onaydan sonra Apple'ın izin penceresi.
  const [consentOpen, setConsentOpen] = useState(false);
  const openConsent = useCallback(() => {
    tapLight();
    setConsentOpen(true);
  }, []);

  const confirmConnect = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      await giveStepsConsent(token);
      await connectSteps();
      setConsentOpen(false);
      lastSentRef.current = null;
      await refresh();
      tapSuccess();
    } catch {
      Alert.alert(t("Bağlanamadı", "Couldn't connect"), t("Apple Sağlık'a şu an ulaşılamadı, tekrar dener misin?", "Apple Health isn't reachable right now, want to try again?"));
    } finally {
      setBusy(false);
    }
  }, [refresh, t, token]);

  const disconnect = useCallback(() => {
    if (!token) return;
    Alert.alert(
      t("Apple Sağlık bağlantısı kesilsin mi?", "Disconnect Apple Health?"),
      t(
        "Adım verisi rızan geri alınır ve eşitlenmiş adımların PulseCoach'tan silinir. Okuma iznini Sağlık uygulamasından da kaldırabilirsin.",
        "Your step data consent is withdrawn and your synced steps are deleted from PulseCoach. You can also remove the read permission in the Health app."
      ),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Bağlantıyı Kes", "Disconnect"),
          style: "destructive",
          onPress: async () => {
            await disconnectSteps();
            try {
              await deleteSteps(token);
            } catch {
              // Sunucu silme başarısızsa bir sonraki açılışta kart yine veriyi gösterir.
            }
            lastSentRef.current = null;
            await refresh();
          },
        },
      ]
    );
  }, [refresh, t, token]);

  if (phase === "loading" || phase === "hidden") return null;
  if (phase === "invite") {
    return (
      <>
        <StepsInvite onPress={openConsent} busy={busy} />
        <StepsConsentSheet
          visible={consentOpen}
          busy={busy}
          onClose={() => setConsentOpen(false)}
          onConfirm={confirmConnect}
        />
      </>
    );
  }
  if (!summary) return null;
  return <StepsSummaryCard summary={summary} onDisconnect={canSync && Platform.OS === "ios" ? disconnect : undefined} />;
});

const StepsSummaryCard = memo(function StepsSummaryCard({
  summary,
  onDisconnect,
}: {
  summary: StepSummary;
  onDisconnect?: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accent = useWorkoutIdentityColors().sets;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.82)" : c.muted;

  const today = summary.today;
  const byDate = new Map<string, StepDay>(summary.days.map((d) => [d.date, d]));
  const week = lastSevenDays(today.date).map((date) => ({ date, steps: byDate.get(date)?.steps ?? 0 }));
  const max = Math.max(1, ...week.map((d) => d.steps));
  const letters = DAY_LETTERS[language];

  const kcal = today.calories !== null ? `~${formatInt(today.calories, language)} kcal` : null;
  const average =
    summary.days.length >= 2 && summary.average_steps !== null
      ? t(`7 gün ort. ${formatInt(summary.average_steps, language)}`, `7-day avg ${formatInt(summary.average_steps, language)}`)
      : null;
  const hint = !summary.has_data
    ? t(
        "Henüz adım gelmedi. Sağlık uygulamasında Profil > Uygulamalar > PulseCoach'tan adım iznini açabilirsin.",
        "No steps yet. You can allow step access in the Health app under Profile > Apps > PulseCoach."
      )
    : [kcal ?? (summary.weight_known ? null : t("Kalori tahmini için kilonu kaydet", "Log your weight for a calorie estimate")), average]
        .filter(Boolean)
        .join(" · ");

  const syncedAt = summary.last_synced_at
    ? new Date(summary.last_synced_at).toLocaleTimeString(language === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <GlassShell
      gradient={STEPS_GRADIENT_DARK}
      lightFill="rgba(255,255,255,0.82)"
      lightGradient={[`${accent}22`, "rgba(255,255,255,0.88)"]}
      glow={STEPS_GRADIENT_DARK[0]}
      radius={22}
    >
      <View style={styles.body}>
        <View style={styles.headRow}>
          <View style={[styles.headIcon, { backgroundColor: `${accent}2E`, borderColor: `${accent}70` }]}>
            <Footprints size={18} color={isDark ? "#FFFFFF" : accent} />
          </View>
          <Text style={[styles.title, { color: text }]}>{t("Adımlar", "Steps")}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: text }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatInt(today.steps, language)}
            </Text>
            <Text style={[styles.valueUnit, { color: muted }]}>{t("adım", "steps")}</Text>
          </View>
        </View>

        {hint ? <Text style={[styles.hint, { color: muted }]}>{hint}</Text> : null}

        <View style={styles.barsRow}>
          {week.map((d) => {
            const isToday = d.date === today.date;
            const height = d.steps > 0 ? Math.max(4, Math.round((d.steps / max) * 48)) : 3;
            const barColor = isDark ? (isToday ? "#FFFFFF" : "rgba(255,255,255,0.45)") : isToday ? accent : `${accent}66`;
            return (
              <View
                key={d.date}
                style={styles.barCol}
                accessible
                accessibilityLabel={`${d.date}: ${formatInt(d.steps, language)} ${t("adım", "steps")}${isToday ? t(" (bugün)", " (today)") : ""}`}
              >
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height, backgroundColor: barColor }]} />
                </View>
                <Text style={[styles.dayLetter, { color: isToday ? text : muted }, isToday && styles.dayLetterToday]}>
                  {letters[weekdayIndex(d.date)]}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footRow}>
          <Text style={[styles.foot, { color: muted }]} numberOfLines={1}>
            {syncedAt ? t(`Apple Sağlık · ${syncedAt}`, `Apple Health · ${syncedAt}`) : t("Apple Sağlık", "Apple Health")}
          </Text>
          {onDisconnect ? (
            <Pressable onPress={onDisconnect} hitSlop={10} style={styles.footButton} accessibilityRole="button">
              <Text style={[styles.foot, styles.footLink, { color: muted }]}>{t("Bağlantıyı kes", "Disconnect")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </GlassShell>
  );
});

/** Bağlı değilken: GoalInviteCard kalıbı, adım ikonuyla. */
function StepsInvite({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ramp = useRampColor();
  const buttonGreen = useGoalButtonGreen();
  const accent = useWorkoutIdentityColors().sets;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.88)" : c.text;
  const onButton = isDark ? "#0F3A21" : "#FFFFFF";
  return (
    <GlassShell
      gradient={[ramp(0), ramp(0.14)]}
      lightFill="rgba(255,255,255,0.82)"
      radius={22}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      subtle
    >
      <View style={styles.inviteBody}>
        <View style={styles.inviteRow}>
          <View style={[styles.inviteIcon, { backgroundColor: `${accent}26`, borderColor: `${accent}66` }]}>
            <Footprints size={22} color={accent} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.inviteTitle, { color: text }]}>{t("Adımlarını ekle", "Add your steps")}</Text>
            <Text style={[styles.inviteText, { color: muted }]}>
              {t(
                "Günlük adımını ve tahmini yakılan kaloriyi Apple Sağlık'tan al; koçun da görsün. Yalnız adım sayısı okunur.",
                "Bring in your daily steps and estimated calories from Apple Health so your coach sees them too. Only your step count is read."
              )}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          disabled={busy}
          style={[styles.inviteButton, { backgroundColor: buttonGreen, opacity: busy ? 0.7 : 1 }]}
          hitSlop={4}
        >
          {busy ? <ActivityIndicator color={onButton} /> : null}
          <Text style={[styles.inviteButtonText, { color: onButton }]}>{t("Apple Sağlık'a Bağlan", "Connect Apple Health")}</Text>
          {busy ? null : <ChevronRight size={16} color={onButton} strokeWidth={2.6} />}
        </Pressable>
      </View>
    </GlassShell>
  );
}

/** Apple Sağlık bağlanmadan önce ayrı, isteğe bağlı açık rıza (KVKK metni 2.1 - metin
 * değişirse backend STEPS_CONSENT_VERSION artırılır). WeeklyGoalSheet yüzey/düğme kalıbı. */
function StepsConsentSheet({
  visible,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const rampColor = useRampColor();
  const buttonGreen = useGoalButtonGreen();
  const accent = useWorkoutIdentityColors().sets;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.78)" : c.muted;
  const onButton = isDark ? "#0F3A21" : "#FFFFFF";
  const points = [
    t("Yalnız günlük adım sayın okunur; Apple Sağlık'a hiçbir şey yazılmaz.", "Only your daily step count is read; nothing is written to Apple Health."),
    t(
      "Adımların ve tahmini yürüme kalorin Türkiye'deki sunucumuzda saklanır, koçun da görür.",
      "Your steps and estimated walking calories are stored on our server in Turkey, and your coach sees them too."
    ),
    t("Reklam veya pazarlama için kullanılmaz, kimseyle paylaşılmaz.", "Never used for advertising or marketing, never shared."),
    t(
      "İstediğin zaman \"Bağlantıyı kes\" ile rızanı geri alırsın; adımların silinir.",
      "You can withdraw anytime with \"Disconnect\"; your steps are deleted."
    ),
  ];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={isDark ? rampColor(1) : c.surface}
      handleColor={isDark ? "rgba(255,255,255,0.35)" : c.border}
    >
      <View style={styles.sheetWrap}>
        <View style={styles.sheetHeader}>
          <View style={[styles.inviteIcon, { backgroundColor: `${accent}26`, borderColor: `${accent}66` }]}>
            <Footprints size={22} color={accent} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.sheetTitle, { color: text }]}>{t("Apple Sağlık'a bağlan", "Connect Apple Health")}</Text>
            <Text style={[styles.inviteText, { color: muted }]}>{t("Adım verisi için açık rıza", "Explicit consent for step data")}</Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          {points.map((p) => (
            <View key={p} style={styles.pointRow}>
              <Check size={16} color={accent} strokeWidth={2.8} style={{ marginTop: 2 }} />
              <Text style={[styles.pointText, { color: text }]}>{p}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.consentText, { color: text }]}>
          {t(
            "Günlük adım sayılarımın Apple Sağlık'tan okunmasına ve sağlık verisi olarak işlenmesine açık rıza veriyorum.",
            "I give my explicit consent for my daily step counts to be read from Apple Health and processed as health data."
          )}{" "}
          <Text
            style={[styles.consentLink, { color: accent }]}
            onPress={() => {
              onClose();
              router.push({ pathname: "/kvkk", params: { section: "saglik-verisi" } });
            }}
            accessibilityRole="link"
          >
            {t("Metnin tamamı (2.1)", "Full text (2.1)")}
          </Text>
        </Text>

        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={[styles.save, { backgroundColor: buttonGreen, opacity: busy ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={onButton} /> : null}
          <Text style={[styles.saveText, { color: onButton }]}>{t("Onaylıyorum, Bağlan", "I Agree, Connect")}</Text>
        </Pressable>
        <Pressable onPress={onClose} disabled={busy} style={styles.clear} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.clearText, { color: muted }]}>{t("Vazgeç", "Not now")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { gap: 16, paddingBottom: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  sheetTitle: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  pointRow: { flexDirection: "row", gap: 10 },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20 },
  consentText: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_600SemiBold" },
  consentLink: { fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clear: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  clearText: { fontSize: 14 },
  body: { padding: 16, gap: 6 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_500Medium" },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, maxWidth: "55%" },
  value: { fontSize: 24, fontFamily: "Inter_600SemiBold", letterSpacing: -0.4 },
  valueUnit: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 13, lineHeight: 18 },
  barsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  barCol: { alignItems: "center", gap: 5, flex: 1 },
  barTrack: { height: 48, justifyContent: "flex-end" },
  bar: { width: 14, borderRadius: 7 },
  dayLetter: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dayLetterToday: { fontFamily: "Inter_700Bold" },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, minHeight: 32 },
  foot: { fontSize: 12 },
  footLink: { textDecorationLine: "underline" },
  footButton: { minHeight: 44, justifyContent: "center", paddingLeft: 12, marginVertical: -6 },
  // Davet: progress-cards.tsx::GoalInviteCard ölçüleri (yalnız ikon farklı).
  inviteBody: { padding: 20, gap: 16 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  inviteIcon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  inviteTitle: { fontSize: 18, fontFamily: "Inter_500Medium" },
  inviteText: { fontSize: 13, lineHeight: 18 },
  inviteButton: { height: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  inviteButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
