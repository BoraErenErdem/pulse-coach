import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Sparkles, X } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { useNutrientColors } from "@/components/nutrition-identity";
import { GoalField } from "@/components/progress-goal-sheet";
import { useGoalButtonGreen, useGoalGreen, useIdentityColors } from "@/components/progress-identity";
import { useRampColor } from "@/components/surface-tone";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import {
  ACTIVITY_LEVELS,
  AGE_LIMITS,
  ApiError,
  GOALS,
  HEIGHT_LIMITS_CM,
  SEXES,
  getCalorieRecommendation,
  logProgress,
  updateProgressLog,
  type ActivityLevel,
  type CalorieRecommendation,
  type Goal,
  type Sex,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDecimal, parseLocaleNumber } from "@/lib/format";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useFormatInt, useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { maybeOfferReminders } from "@/lib/reminder-offer";
import { useTheme } from "@/lib/theme-context";

// Hızlı başlangıç (1.0.2). Canlı veride (2026-11-12) 12 kullanıcının 7'si hedef/boy/yaş
// hiç girmemişti, kalori hedefini 1 kişi girmişti: öneri için bilgiler üç ayrı yerde
// (Ayarlar > Vücut Bilgilerin, İlerleme > kilo, Beslenme > hedef). Bu sayfa altısını
// tek yerde alır, mevcut öneri servisini (GET /profile/calorie-recommendation) çağırır
// ve tek dokunuşla günlük hedef yapar. Yeni veri kategorisi YOK: hepsi profilde ve
// ilerleme kaydında zaten tutulan alanlar (KVKK metni değişmez).
// Kalıp: İlerleme'nin GoalSheet'i (yüzey, GoalField, yeşil birincil düğme).

const WEIGHT_MAX_KG = 500; // backend progress_service._validate_measurement_ranges

type Step = "form" | "result";

function OptionChips<K extends string>({
  options,
  value,
  onChange,
  labels,
  label,
}: {
  options: readonly K[];
  value: K | null;
  onChange: (next: K) => void;
  labels: Record<K, string>;
  label: string;
}) {
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const buttonGreen = useGoalButtonGreen();
  const text = isDark ? "#FFFFFF" : c.text;
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: text }]}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const on = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => {
                if (on) return;
                tapLight();
                onChange(option);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                on
                  ? { backgroundColor: isDark ? `${green}40` : buttonGreen, borderColor: isDark ? green : buttonGreen }
                  : { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)", borderColor: isDark ? "rgba(255,255,255,0.14)" : c.border },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? "#FFFFFF" : text }]}>{labels[option]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function QuickStartSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const t = useT();
  const { language } = useLanguage();
  const fmt = useFormatInt();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const rampColor = useRampColor();
  const green = useGoalGreen();
  const buttonGreen = useGoalButtonGreen();
  const ids = useIdentityColors();
  const nutrient = useNutrientColors();
  const { token } = useAuth();
  const { profile, updateProfile } = useProfile();

  const [step, setStep] = useState<Step>("form");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthYear, setBirthYear] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  // Sunucudaki son kilo: aynıysa yeni ilerleme kaydı açılmaz.
  const [knownWeight, setKnownWeight] = useState<number | null>(null);
  // Bu açılışta oluşturulan ilerleme kaydı (kilo düzeltilirse güncellenir).
  const [createdLogId, setCreatedLogId] = useState<number | null>(null);
  const [rec, setRec] = useState<CalorieRecommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Her açılışta profildeki değerlerle dolar; son kilo öneri servisinden gelir.
  useEffect(() => {
    if (!visible) return;
    setStep("form");
    setRec(null);
    setError(null);
    setGoal(profile?.goal ?? null);
    setActivity(profile?.activity_level ?? null);
    setSex(profile?.sex ?? null);
    setBirthYear(profile?.birth_year != null ? String(profile.birth_year) : "");
    setHeight(profile?.height_cm != null ? String(profile.height_cm) : "");
    setWeight("");
    setKnownWeight(null);
    setCreatedLogId(null);
    if (!token) return;
    let cancelled = false;
    getCalorieRecommendation(token)
      .then((r) => {
        if (cancelled || r.weight_kg == null) return;
        setKnownWeight(r.weight_kg);
        setWeight((current) => current || String(r.weight_kg));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token]);

  const currentYear = new Date().getFullYear();
  const birthYearRange = { min: currentYear - AGE_LIMITS.max, max: currentYear - AGE_LIMITS.min };

  const GOAL_LABELS: Record<Goal, string> = {
    weight_loss: t("Kilo vermek", "Lose weight"),
    muscle_gain: t("Kas yapmak", "Build muscle"),
    general_health: t("Genel sağlık", "General health"),
  };
  const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
    sedentary: t("Hareketsiz", "Sedentary"),
    light: t("Hafif aktif", "Lightly active"),
    moderate: t("Orta aktif", "Moderately active"),
    active: t("Çok aktif", "Very active"),
  };
  const SEX_LABELS: Record<Sex, string> = { female: t("Kadın", "Female"), male: t("Erkek", "Male") };

  // Kullanıcı bir alanı düzeltince eski hata mesajı ekranda kalmasın.
  function edit<V>(setter: (value: V) => void) {
    return (value: V) => {
      setter(value);
      setError(null);
    };
  }

  async function calculate() {
    if (!token) return;
    setError(null);
    if (!goal || !activity || !sex) {
      setError(t("Hedefini, aktivite seviyeni ve cinsiyetini seç.", "Pick your goal, activity level and sex."));
      return;
    }
    const by = Number(birthYear.trim());
    if (!birthYear.trim() || !Number.isInteger(by) || by < birthYearRange.min || by > birthYearRange.max) {
      setError(
        t(
          `Doğum yılı ${birthYearRange.min} ile ${birthYearRange.max} arasında olmalı (uygulama 18 yaş ve üstü içindir).`,
          `Birth year must be between ${birthYearRange.min} and ${birthYearRange.max} (the app is for ages 18 and up).`
        )
      );
      return;
    }
    const h = parseLocaleNumber(height.trim());
    if (!height.trim() || Number.isNaN(h) || h < HEIGHT_LIMITS_CM.min || h > HEIGHT_LIMITS_CM.max) {
      setError(
        t(
          `Boy ${HEIGHT_LIMITS_CM.min} ile ${HEIGHT_LIMITS_CM.max} cm arasında olmalı.`,
          `Height must be between ${HEIGHT_LIMITS_CM.min} and ${HEIGHT_LIMITS_CM.max} cm.`
        )
      );
      return;
    }
    const w = parseLocaleNumber(weight.trim());
    if (!weight.trim() || Number.isNaN(w) || w <= 0 || w > WEIGHT_MAX_KG) {
      setError(t(`Kilo 0 ile ${WEIGHT_MAX_KG} kg arasında olmalı.`, `Weight must be between 0 and ${WEIGHT_MAX_KG} kg.`));
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ goal, activity_level: activity, sex, birth_year: by, height_cm: h });
      if (knownWeight === null || Math.abs(w - knownWeight) >= 0.05) {
        // Aynı açılışta kilo düzeltilirse ("Bilgileri düzenle") ikinci satır açılmaz,
        // bu sayfanın açtığı kayıt güncellenir (test 2026-11-12: 58 + 57,5 aynı gün).
        if (createdLogId !== null) {
          await updateProgressLog(token, createdLogId, { weight: w });
        } else {
          const created = await logProgress(token, { weight: w, workout_completed: false });
          setCreatedLogId(created.id);
        }
        setKnownWeight(w);
      }
      const next = await getCalorieRecommendation(token);
      if (!next.available) {
        setError(t("Öneri şu an hesaplanamadı, tekrar dener misin?", "Couldn't calculate a suggestion right now, want to try again?"));
        return;
      }
      tapLight();
      setRec(next);
      setStep("result");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setBusy(false);
    }
  }

  async function saveGoals() {
    if (!rec?.available) return;
    setError(null);
    setBusy(true);
    try {
      await updateProfile({
        daily_calorie_goal: rec.calories,
        daily_protein_goal_g: rec.protein_g,
        daily_carbs_goal_g: rec.carbs_g,
        daily_fat_goal_g: rec.fat_g,
      });
      tapSuccess();
      onClose();
      onSaved?.();
      void maybeOfferReminders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setBusy(false);
    }
  }

  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;
  const onButton = isDark ? "#0F3A21" : "#FFFFFF";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={isDark ? rampColor(1) : c.surface}
      handleColor={isDark ? "rgba(255,255,255,0.35)" : c.border}
    >
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: `${green}26`, borderColor: `${green}66` }]}>
            <Sparkles size={22} color={green} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: text }]}>
              {step === "form" ? t("Hızlı başlangıç", "Quick start") : t("Sana özel hedefin", "Your personal goal")}
            </Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              {step === "form"
                ? t(
                    "Altı bilgiyle günlük kalori ve makro hedefini hesaplayalım; koçun da seni daha iyi tanısın.",
                    "Six details and we'll work out your daily calorie and macro goal, so your coach knows you better too."
                  )
                : t("Sonra Beslenme sekmesinden istediğin gibi değiştirebilirsin.", "You can change it anytime in the Nutrition tab.")}
            </Text>
          </View>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        {step === "form" ? (
          <>
            <OptionChips label={t("Hedefin", "Your goal")} options={GOALS} value={goal} onChange={edit(setGoal)} labels={GOAL_LABELS} />
            <OptionChips
              label={t("Aktivite seviyen", "Activity level")}
              options={ACTIVITY_LEVELS}
              value={activity}
              onChange={edit(setActivity)}
              labels={ACTIVITY_LABELS}
            />
            <OptionChips label={t("Cinsiyet", "Sex")} options={SEXES} value={sex} onChange={edit(setSex)} labels={SEX_LABELS} />
            <GoalField
              label={t("Doğum Yılı", "Birth Year")}
              color={green}
              unit=""
              value={birthYear}
              onChange={edit(setBirthYear)}
              max={birthYearRange.max}
              placeholder={t("ör. 1990", "e.g. 1990")}
              fallback={1990}
              step={1}
            />
            <GoalField
              label={t("Boy", "Height")}
              color={green}
              unit="cm"
              value={height}
              onChange={edit(setHeight)}
              max={HEIGHT_LIMITS_CM.max}
              placeholder={t("ör. 172", "e.g. 172")}
              fallback={170}
              step={1}
            />
            <GoalField
              label={t("Güncel Kilo", "Current Weight")}
              color={ids.weight}
              unit="kg"
              value={weight}
              onChange={edit(setWeight)}
              max={WEIGHT_MAX_KG}
              placeholder={t("ör. 75", "e.g. 75")}
              fallback={knownWeight ?? 70}
              currentText={knownWeight != null ? t(`Son kayıt ${formatDecimal(knownWeight, language)} kg`, `Last logged ${formatDecimal(knownWeight, language)} kg`) : undefined}
            />
            <Pressable
              onPress={calculate}
              disabled={busy}
              style={[styles.save, { backgroundColor: buttonGreen, opacity: busy ? 0.7 : 1 }]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={onButton} /> : null}
              <Text style={[styles.saveText, { color: onButton }]}>
                {busy ? t("Hesaplanıyor...", "Calculating...") : t("Hedefimi Hesapla", "Calculate My Goal")}
              </Text>
            </Pressable>
            <Text style={[styles.note, { color: muted }]}>
              {t(
                "Bilgilerin profiline, kilon İlerleme'ye kaydedilir. Hamilelik, emzirme ya da bir sağlık durumun varsa bir uzmana danış.",
                "Your details are saved to your profile and your weight to Progress. If you're pregnant, breastfeeding or have a health condition, check with a professional."
              )}
            </Text>
          </>
        ) : rec ? (
          <>
            <View style={[styles.result, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)", borderColor: `${green}${isDark ? "55" : "66"}` }]}>
              <Text style={[styles.kcal, { color: text }]}>
                {fmt(rec.calories ?? 0)} <Text style={[styles.kcalUnit, { color: muted }]}>{t("kcal/gün", "kcal/day")}</Text>
              </Text>
              <View style={styles.macros}>
                {[
                  { key: "p", label: t("Protein", "Protein"), value: rec.protein_g ?? 0, color: nutrient.protein },
                  { key: "c", label: t("Karb.", "Carbs"), value: rec.carbs_g ?? 0, color: nutrient.karbonhidrat },
                  { key: "f", label: t("Yağ", "Fat"), value: rec.fat_g ?? 0, color: nutrient.yağ },
                ].map((m) => (
                  <View key={m.key} style={styles.macro}>
                    <View style={[styles.dot, { backgroundColor: m.color }]} />
                    <Text style={[styles.macroText, { color: text }]}>
                      {m.label} {fmt(m.value)} g
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.note, { color: muted, textAlign: "left" }]}>
                {(() => {
                  const adj = rec.adjustment_kcal ?? 0;
                  const why =
                    adj < 0
                      ? t(`kilo vermek için günde ~${fmt(-adj)} kcal açık`, `~${fmt(-adj)} kcal daily deficit to lose weight`)
                      : adj > 0
                        ? t(`kas yapmak için günde ~${fmt(adj)} kcal fazla`, `~${fmt(adj)} kcal daily surplus to build muscle`)
                        : t("kilonu korumak için", "to maintain your weight");
                  return t(
                    `Mifflin-St Jeor tahmini, ${rec.activity_level ? ACTIVITY_LABELS[rec.activity_level].toLocaleLowerCase("tr-TR") : ""}; ${why}.`,
                    `Mifflin-St Jeor estimate, ${rec.activity_level ? ACTIVITY_LABELS[rec.activity_level].toLowerCase() : ""}; ${why}.`
                  );
                })()}
              </Text>
            </View>
            <Pressable
              onPress={saveGoals}
              disabled={busy}
              style={[styles.save, { backgroundColor: buttonGreen, opacity: busy ? 0.7 : 1 }]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={onButton} /> : null}
              <Text style={[styles.saveText, { color: onButton }]}>
                {busy ? t("Kaydediliyor...", "Saving...") : t("Hedef Olarak Kaydet", "Save as My Goal")}
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep("form")} disabled={busy} style={styles.clear} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.clearText, { color: muted }]}>{t("Bilgileri düzenle", "Edit details")}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** Sohbet > Bugün panelinde, kalori hedefi yokken: hızlı başlangıç daveti. */
export function QuickStartBanner({ onPress, onDismiss }: { onPress: () => void; onDismiss: () => void }) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)", borderColor: `${c.accent}${isDark ? "55" : "66"}` },
      ]}
    >
      <Pressable
        onPress={() => {
          tapLight();
          onPress();
        }}
        style={styles.bannerMain}
        accessibilityRole="button"
        accessibilityLabel={t("Hızlı başlangıç: kalori hedefini hesapla", "Quick start: calculate your calorie goal")}
      >
        <View style={[styles.bannerIcon, { backgroundColor: `${c.accent}26` }]}>
          <Sparkles size={16} color={c.accent} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[styles.bannerTitle, { color: c.text }]}>{t("Sana özel kalori hedefi", "Your personal calorie goal")}</Text>
          <Text style={[styles.bannerText, { color: c.muted }]}>{t("Altı bilgiyle 1 dakikada hazır", "Ready in a minute with six details")}</Text>
        </View>
        <ChevronRight size={18} color={c.accent} />
      </Pressable>
      <Pressable
        onPress={() => {
          tapLight();
          onDismiss();
        }}
        style={styles.bannerClose}
        accessibilityRole="button"
        accessibilityLabel={t("Daveti kapat", "Dismiss")}
      >
        <X size={16} color={c.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  group: { gap: 8 },
  groupLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  note: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  clear: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  clearText: { fontSize: 14 },
  result: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 10 },
  kcal: { fontSize: 32, fontFamily: "Inter_600SemiBold", letterSpacing: -0.5 },
  kcalUnit: { fontSize: 15, fontFamily: "Inter_500Medium" },
  macros: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  macro: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  macroText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  banner: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, paddingLeft: 12 },
  bannerMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8 },
  bannerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bannerText: { fontSize: 12 },
  bannerClose: { width: 44, height: 56, alignItems: "center", justifyContent: "center" },
});
