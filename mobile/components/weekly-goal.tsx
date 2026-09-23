import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Pencil, Target, Trophy } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { GlassShell, GoalInviteCard, rampColor } from "@/components/progress-cards";
import { GOAL_DONE_GRADIENT_DARK, useGoalGreen } from "@/components/progress-identity";
import { ConfettiBurst, celebrateOnce } from "@/components/progress-motion";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import { WORKOUT_TILE_GRADIENT_DARK, useWorkoutIdentityColors } from "@/components/workout-identity";
import { ApiError, type WeeklyGoal } from "@/lib/api";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";

// Haftalık antrenman günü hedefi (2026-09-23) - Antrenman sekmesinin 4
// istatistik kutusunun hemen altında. Tasarım dili (bkz. memory
// reference-pulsecoach-design-language): cam kutu (GlassShell) Antrenman'ın
// kırmızı kimliğiyle (`sessions`), tamamlanınca hedef yeşiline döner (§3 -
// "hedef yeşil"); hedef yoksa İlerleme'deki GoalInviteCard AYNEN kullanılır.
// Hareket politikası (§6): odaklanışta replay YOK - kutlama (konfeti) SADECE
// gerçek olayda, cihazda haftada BİR KEZ (celebrateOnce).

const DAY_LETTERS = {
  tr: ["P", "S", "Ç", "P", "C", "C", "P"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
} as const;
const DAY_NAMES = {
  tr: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
} as const;

export const WeeklyGoalCard = memo(function WeeklyGoalCard({
  goal,
  onEdit,
}: {
  goal: WeeklyGoal;
  onEdit: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const red = useWorkoutIdentityColors().sessions;
  const green = useGoalGreen();
  const [celebrateKey, setCelebrateKey] = useState(0);

  const achieved = goal.achieved;
  const accent = achieved ? green : red;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.82)" : c.muted;

  // C katmanı: hedef tamamlandığında bu hafta için cihazda BİR KEZ.
  useEffect(() => {
    if (!achieved) return;
    let cancelled = false;
    celebrateOnce(`weekly_goal_${goal.week_start}`).then((first) => {
      if (first && !cancelled) {
        setCelebrateKey((k) => k + 1);
        tapSuccess();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [achieved, goal.week_start]);

  const goalDays = goal.goal_days ?? 0;
  const remaining = Math.max(0, goalDays - goal.done_days);
  const todayIndex = goal.days.findIndex((d) => d.day === goal.today);
  const daysLeftInWeek = todayIndex >= 0 ? 6 - todayIndex : 0;
  // Kalan hedef günü, haftanın kalan günlerine (bugün antrenman yapılmadıysa
  // bugün de dahil) sığmıyorsa bu haftaki hedef artık tutturulamaz.
  const todayTrained = todayIndex >= 0 && goal.days[todayIndex].trained;
  const reachable = remaining <= daysLeftInWeek + (todayTrained ? 0 : 1);

  const hint = achieved
    ? t("Bu haftanın hedefi tamamlandı, harika iş!", "This week's goal is done, great work!")
    : reachable
      ? t(
          `Hedefe ${remaining} gün kaldı · haftanın bitmesine ${daysLeftInWeek} gün var`,
          `${remaining} more day(s) to go · ${daysLeftInWeek} day(s) left this week`
        )
      : t(
          "Bu hafta hedefe yetişmek zor ama her antrenman günü sayılır.",
          "The goal is out of reach this week, but every workout day still counts."
        );

  const letters = DAY_LETTERS[language];
  const names = DAY_NAMES[language];

  return (
    <GlassShell
      gradient={achieved ? GOAL_DONE_GRADIENT_DARK : WORKOUT_TILE_GRADIENT_DARK.sessions}
      lightFill="rgba(255,255,255,0.82)"
      lightGradient={[`${accent}40`, "rgba(255,255,255,0.86)"]}
      glow={accent}
      radius={22}
    >
      <View style={styles.body}>
        <View style={styles.headRow}>
          <View style={[styles.headIcon, { backgroundColor: `${accent}2E`, borderColor: `${accent}70` }]}>
            {achieved ? <Trophy size={18} color={isDark ? "#FFFFFF" : accent} /> : <Target size={18} color={isDark ? "#FFFFFF" : accent} />}
          </View>
          <Text style={[styles.title, { color: text }]}>{t("Haftalık Hedef", "Weekly Goal")}</Text>
          <Pressable
            onPress={onEdit}
            hitSlop={4}
            style={styles.editButton}
            accessibilityRole="button"
            accessibilityLabel={t("Haftalık hedefi düzenle", "Edit weekly goal")}
          >
            <Pencil size={17} color={muted} />
          </Pressable>
        </View>

        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: text }]} numberOfLines={1} adjustsFontSizeToFit>
            {goal.done_days}/{goalDays}
          </Text>
          <Text style={[styles.valueUnit, { color: muted }]}>{t("gün", "days")}</Text>
        </View>
        <Text style={[styles.hint, { color: muted }]}>{hint}</Text>

        <View style={styles.daysRow}>
          {goal.days.map((d, i) => {
            const isToday = i === todayIndex;
            const isFuture = todayIndex >= 0 && i > todayIndex;
            return (
              <View
                key={d.day}
                style={styles.dayCol}
                accessible
                accessibilityLabel={`${names[i]}: ${
                  d.trained ? t("antrenman yapıldı", "worked out") : t("antrenman yok", "no workout")
                }${isToday ? t(" (bugün)", " (today)") : ""}`}
              >
                <View
                  style={[
                    styles.dayDot,
                    // Koyu modda kart zaten kimlik renginde - dolu nokta beyaz olmazsa
                    // kırmızı üstü kırmızı kalıp zor seçiliyordu (canlı testte görüldü).
                    d.trained
                      ? isDark
                        ? { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" }
                        : { backgroundColor: accent, borderColor: accent }
                      : { borderColor: isDark ? "rgba(255,255,255,0.35)" : `${accent}8C` },
                    isToday && !d.trained ? { borderColor: isDark ? "#FFFFFF" : accent, borderWidth: 2 } : null,
                    isFuture ? { opacity: 0.55 } : null,
                  ]}
                >
                  {d.trained ? <Check size={15} color={isDark ? accent : "#FFFFFF"} strokeWidth={3} /> : null}
                </View>
                <Text style={[styles.dayLetter, { color: isToday ? text : muted }, isToday && styles.dayLetterToday]}>
                  {letters[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <ConfettiBurst replayKey={celebrateKey} />
    </GlassShell>
  );
});

/** Hedef yokken kartın yerinde duran davet (İlerleme'deki GoalInviteCard'ın aynısı). */
export function WeeklyGoalInvite({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <GoalInviteCard
      title={t("Haftalık hedef belirle", "Set a weekly goal")}
      body={t(
        "Haftada kaç gün antrenman yapmak istediğini seç, ilerlemeni gün gün burada takip et.",
        "Choose how many days a week you want to train and track it day by day here."
      )}
      buttonLabel={t("Hedef Belirle", "Set Goal")}
      onPress={onPress}
    />
  );
}

/** Hedef seçimi - İlerleme'nin GoalSheet'iyle AYNI yüzey/yeşil düğme kalıbı
 * (bkz. progress-goal-sheet.tsx), tek alan: 1-7 gün. */
export function WeeklyGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const red = useWorkoutIdentityColors().sessions;
  const { profile, updateProfile } = useProfile();
  const current = profile?.weekly_workout_goal_days ?? null;
  const [selected, setSelected] = useState<number | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(current ?? 3);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;
  const options = useMemo(() => [1, 2, 3, 4, 5, 6, 7], []);

  async function save(value: number | null) {
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({ weekly_workout_goal_days: value });
      tapSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={isDark ? rampColor(1) : c.surface}
      handleColor={isDark ? "rgba(255,255,255,0.35)" : c.border}
    >
      <View style={styles.sheetWrap}>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetIcon, { backgroundColor: `${green}26`, borderColor: `${green}66` }]}>
            <Target size={22} color={green} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.sheetTitle, { color: text }]}>{t("Haftalık Hedef", "Weekly Goal")}</Text>
            <Text style={[styles.sheetSubtitle, { color: muted }]}>
              {t("Haftada kaç gün antrenman yapmak istiyorsun?", "How many days a week do you want to train?")}
            </Text>
          </View>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.optionsRow}>
          {options.map((n) => {
            const isSelected = selected === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  tapLight();
                  setSelected(n);
                }}
                style={[
                  styles.option,
                  { borderColor: isSelected ? red : isDark ? "rgba(255,255,255,0.25)" : c.border },
                  isSelected ? { backgroundColor: red } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(`Haftada ${n} gün`, `${n} days a week`)}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.optionText, { color: isSelected ? "#FFFFFF" : text }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.sheetNote, { color: muted }]}>
          {t(
            "Aynı gün birden fazla antrenman tek gün sayılır. Hafta Pazartesi başlar.",
            "Multiple workouts on the same day count as one day. Weeks start on Monday."
          )}
        </Text>

        <Pressable
          onPress={() => selected !== null && save(selected)}
          disabled={isSaving || selected === null}
          style={[styles.save, { backgroundColor: green, opacity: isSaving ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {isSaving ? <ActivityIndicator color={isDark ? "#0F3A21" : "#FFFFFF"} /> : null}
          <Text style={[styles.saveText, { color: isDark ? "#0F3A21" : "#FFFFFF" }]}>
            {isSaving ? t("Kaydediliyor...", "Saving...") : t("Hedefi Kaydet", "Save Goal")}
          </Text>
        </Pressable>

        {current !== null ? (
          <Pressable onPress={() => save(null)} disabled={isSaving} style={styles.clear} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.clearText, { color: muted }]}>{t("Haftalık hedefi kaldır", "Remove weekly goal")}</Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 18, gap: 6 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_500Medium" },
  // Dokunma alanı 44pt (ui-ux-pro-max §2) - ikon küçük, kutu büyük.
  editButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  value: { fontSize: 34, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  valueUnit: { fontSize: 15, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 13, lineHeight: 18 },
  daysRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  dayCol: { alignItems: "center", gap: 5, flex: 1 },
  dayDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dayLetter: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dayLetterToday: { fontFamily: "Inter_700Bold" },
  sheetWrap: { gap: 14, paddingBottom: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  sheetIcon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  sheetSubtitle: { fontSize: 13, lineHeight: 18 },
  optionsRow: { flexDirection: "row", gap: 6 },
  option: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optionText: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sheetNote: { fontSize: 12, lineHeight: 17 },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clear: { alignItems: "center", paddingVertical: 10 },
  clearText: { fontSize: 13 },
});
