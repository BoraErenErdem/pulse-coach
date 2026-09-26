import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Sparkles, Target } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import { useRampColor } from "@/components/surface-tone";
import { GoalField } from "@/components/progress-goal-sheet";
import { useGoalGreen } from "@/components/progress-identity";
import { useNutrientColors } from "@/components/nutrition-identity";
import { ApiError, getCalorieRecommendation, type CalorieRecommendation, type CalorieRecommendationMissing } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { parseLocaleNumber } from "@/lib/format";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useQuickAdd } from "@/lib/quick-add-context";
import { useTheme } from "@/lib/theme-context";
import { tapLight, tapSuccess } from "@/lib/haptics";

// Günlük beslenme hedefleri (2026-09-24) - önceden SADECE Profil > Hedefler
// ekranından değiştirilebiliyordu. İlerleme'nin GoalSheet'i / Antrenman'ın
// haftalık hedef sheet'iyle AYNI kalıp (sıcak kahve/krem yüzey, besin renkli
// cam alanlar, yeşil birincil düğme). Sınırlar backend'le AYNI
// (profile_service.py::_validate_goal_numbers): kalori 0-10000, makro 0-1000.
const LIMITS = { calorie: 10000, macro: 1000 } as const;

function parseGoal(text: string, max: number): { value: number | null; invalid: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, invalid: false };
  const n = parseLocaleNumber(trimmed);
  if (Number.isNaN(n) || n <= 0 || n > max) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("tr-TR");
}

/** Kilo/boy ondalığı korunur (84,5 kg) - `fmt` tam sayıya yuvarlar. */
function fmtMeasure(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

type RecommendationValues = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

/**
 * Boy/yaş/cinsiyet/son kilo/aktiviteye göre öneri (2026-09-26, backend
 * calorie_recommendation_service). Öneri alanları SADECE doldurur - kayıt yine
 * "Hedefleri Kaydet" ile. Eksik bilgi varsa tek düzenleme yerine (Hesap ve
 * Ayarlar > Vücut Bilgilerin ya da İlerleme'de kilo) yönlendirir - kopya form yok.
 */
function RecommendationCard({
  recommendation,
  isLoading,
  onApply,
  matchesFields,
  onNavigate,
}: {
  recommendation: CalorieRecommendation | null;
  isLoading: boolean;
  onApply: (values: RecommendationValues) => void;
  matchesFields: boolean;
  onNavigate: (target: "settings" | "weight") => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const colors = useNutrientColors();
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;
  // Açık temada GOAL_GREEN_LIGHT kremde 3.3:1 kalıyor (14px metin için az) -
  // aynı tonun koyusu 5.2:1.
  const actionText = isDark ? "#FFFFFF" : "#217A47";
  const frame = {
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
    borderColor: `${green}${isDark ? "55" : "66"}`,
  };

  if (isLoading && !recommendation) {
    return (
      <View style={[styles.rec, frame, styles.recLoading]}>
        <ActivityIndicator color={green} />
      </View>
    );
  }
  // Öneri alınamazsa (ağ hatası) kart hiç gösterilmez - hedef girişi yine çalışır.
  if (!recommendation) return null;

  const header = (
    <View style={styles.recHead}>
      <Sparkles size={16} color={green} strokeWidth={2.4} />
      <Text style={[styles.recTitle, { color: text }]}>{t("Sana Özel Öneri", "Your Suggested Goals")}</Text>
    </View>
  );

  if (!recommendation.available) {
    const MISSING_LABELS: Record<CalorieRecommendationMissing, string> = {
      height: t("boy", "height"),
      birth_year: t("doğum yılı", "birth year"),
      sex: t("cinsiyet", "sex"),
      weight: t("güncel kilo", "current weight"),
      activity_level: t("aktivite seviyesi", "activity level"),
    };
    const onlyWeight = recommendation.missing.length === 1 && recommendation.missing[0] === "weight";
    return (
      <View style={[styles.rec, frame]}>
        {header}
        <Text style={[styles.recBody, { color: muted }]}>
          {t(
            `Günlük kalori ve makro önerisi için eksik: ${recommendation.missing.map((m) => MISSING_LABELS[m]).join(", ")}.`,
            `To suggest daily calories and macros we still need: ${recommendation.missing.map((m) => MISSING_LABELS[m]).join(", ")}.`
          )}
        </Text>
        <Pressable
          onPress={() => {
            tapLight();
            onNavigate(onlyWeight ? "weight" : "settings");
          }}
          style={styles.recLink}
          accessibilityRole="button"
        >
          <Text style={[styles.recLinkText, { color: actionText }]}>
            {onlyWeight ? t("Kilonu kaydet", "Log your weight") : t("Bilgilerini tamamla", "Complete your details")}
          </Text>
          <ChevronRight size={16} color={actionText} />
        </Pressable>
      </View>
    );
  }

  const values: RecommendationValues = {
    calories: recommendation.calories ?? 0,
    protein_g: recommendation.protein_g ?? 0,
    carbs_g: recommendation.carbs_g ?? 0,
    fat_g: recommendation.fat_g ?? 0,
  };
  const adjustment = recommendation.adjustment_kcal ?? 0;
  const ACTIVITY_LABELS = {
    sedentary: t("hareketsiz", "sedentary"),
    light: t("hafif aktif", "lightly active"),
    moderate: t("orta aktif", "moderately active"),
    active: t("çok aktif", "very active"),
  } as const;
  const activity = recommendation.activity_level ? ACTIVITY_LABELS[recommendation.activity_level] : "";
  const goalText =
    adjustment < 0
      ? t(`kilo vermek için günde ~${fmt(-adjustment)} kcal açık`, `~${fmt(-adjustment)} kcal daily deficit to lose weight`)
      : adjustment > 0
        ? t(`kas yapmak için günde ~${fmt(adjustment)} kcal fazla`, `~${fmt(adjustment)} kcal daily surplus to build muscle`)
        : t("kilonu korumak için", "to maintain your weight");
  const macros = [
    { key: "protein", label: t("Protein", "Protein"), value: values.protein_g, color: colors.protein },
    { key: "carbs", label: t("Karb.", "Carbs"), value: values.carbs_g, color: colors.karbonhidrat },
    { key: "fat", label: t("Yağ", "Fat"), value: values.fat_g, color: colors.yağ },
  ];

  return (
    <View style={[styles.rec, frame]}>
      {header}
      <Text style={[styles.recKcal, { color: text }]}>
        {fmt(values.calories)} <Text style={[styles.recUnit, { color: muted }]}>{t("kcal/gün", "kcal/day")}</Text>
      </Text>
      <View style={styles.recMacros}>
        {macros.map((m) => (
          <View key={m.key} style={styles.recMacro}>
            <View style={[styles.dot, { backgroundColor: m.color }]} />
            <Text style={[styles.recMacroText, { color: text }]}>
              {m.label} {fmt(m.value)} g
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.recBody, { color: muted }]}>
        {t(
          `${fmtMeasure(recommendation.weight_kg ?? 0)} kg · ${fmtMeasure(recommendation.height_cm ?? 0)} cm · ${recommendation.age} yaş · ${activity}; ${goalText}.`,
          `${fmtMeasure(recommendation.weight_kg ?? 0)} kg · ${fmtMeasure(recommendation.height_cm ?? 0)} cm · age ${recommendation.age} · ${activity}; ${goalText}.`
        )}
      </Text>
      <Pressable
        onPress={() => {
          tapLight();
          onApply(values);
        }}
        disabled={matchesFields}
        style={[styles.recApply, { borderColor: `${green}AA`, opacity: matchesFields ? 0.55 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: matchesFields }}
      >
        <Text style={[styles.recApplyText, { color: actionText }]}>
          {matchesFields ? t("Alanlar öneriyle aynı", "Fields match the suggestion") : t("Alanlara Doldur", "Fill In the Fields")}
        </Text>
      </Pressable>
      <Text style={[styles.recNote, { color: muted }]}>
        {t(
          "Mifflin-St Jeor tahmini. Hamilelik, emzirme ya da bir sağlık durumun varsa bir uzmana danış.",
          "Mifflin-St Jeor estimate. If you're pregnant, breastfeeding or have a health condition, check with a professional."
        )}
      </Text>
    </View>
  );
}

export function NutritionGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const colors = useNutrientColors();
  const { profile, updateProfile } = useProfile();
  const rampColor = useRampColor();
  const [calorie, setCalorie] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { token } = useAuth();
  const router = useRouter();
  const { requestOpenWeightForm } = useQuickAdd();
  const [recommendation, setRecommendation] = useState<CalorieRecommendation | null>(null);
  const [isRecLoading, setIsRecLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCalorie(profile?.daily_calorie_goal?.toString() ?? "");
    setProtein(profile?.daily_protein_goal_g?.toString() ?? "");
    setCarbs(profile?.daily_carbs_goal_g?.toString() ?? "");
    setFat(profile?.daily_fat_goal_g?.toString() ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Her açılışta taze öneri: kilo/boy/aktivite sheet kapalıyken değişmiş olabilir.
  useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    setIsRecLoading(true);
    getCalorieRecommendation(token)
      .then((rec) => {
        if (!cancelled) setRecommendation(rec);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      })
      .finally(() => {
        if (!cancelled) setIsRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const matchesRecommendation =
    !!recommendation?.available &&
    [
      [calorie, recommendation.calories],
      [protein, recommendation.protein_g],
      [carbs, recommendation.carbs_g],
      [fat, recommendation.fat_g],
    ].every(([field, value]) => parseLocaleNumber(String(field)) === value);

  function applyRecommendation(values: RecommendationValues) {
    setCalorie(String(values.calories));
    setProtein(String(values.protein_g));
    setCarbs(String(values.carbs_g));
    setFat(String(values.fat_g));
    setError(null);
  }

  function navigateForRecommendation(target: "settings" | "weight") {
    onClose();
    if (target === "weight") {
      router.push("/progress");
      requestOpenWeightForm();
    } else {
      router.push("/profile-settings");
    }
  }

  const hasAnyGoal =
    profile?.daily_calorie_goal != null ||
    profile?.daily_protein_goal_g != null ||
    profile?.daily_carbs_goal_g != null ||
    profile?.daily_fat_goal_g != null;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;

  async function save(payload: {
    daily_calorie_goal: number | null;
    daily_protein_goal_g: number | null;
    daily_carbs_goal_g: number | null;
    daily_fat_goal_g: number | null;
  }) {
    setIsSaving(true);
    setError(null);
    try {
      // `null` (undefined DEĞİL): backend exclude_unset kullanıyor, null
      // gövdede kalınca hedef gerçekten temizleniyor.
      await updateProfile(payload);
      tapSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSave() {
    const cal = parseGoal(calorie, LIMITS.calorie);
    const p = parseGoal(protein, LIMITS.macro);
    const cb = parseGoal(carbs, LIMITS.macro);
    const f = parseGoal(fat, LIMITS.macro);
    if (cal.invalid) return setError(t(`Kalori hedefi 0 ile ${LIMITS.calorie} arasında olmalı.`, `Calorie goal must be between 0 and ${LIMITS.calorie}.`));
    if (p.invalid || cb.invalid || f.invalid)
      return setError(t(`Makro hedefleri 0 ile ${LIMITS.macro} g arasında olmalı.`, `Macro goals must be between 0 and ${LIMITS.macro} g.`));
    void save({
      daily_calorie_goal: cal.value,
      daily_protein_goal_g: p.value,
      daily_carbs_goal_g: cb.value,
      daily_fat_goal_g: f.value,
    });
  }

  const optional = t("opsiyonel", "optional");
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
            <Target size={22} color={green} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: text }]}>{t("Günlük Hedeflerin", "Your daily goals")}</Text>
            <Text style={[styles.subtitle, { color: muted }]}>
              {t(
                "Hepsi isteğe bağlı. Boş bıraktığın alan için hedef gösterilmez.",
                "All optional. A field you leave empty won't show a goal."
              )}
            </Text>
          </View>
        </View>

        <RecommendationCard
          recommendation={recommendation}
          isLoading={isRecLoading}
          onApply={applyRecommendation}
          matchesFields={matchesRecommendation}
          onNavigate={navigateForRecommendation}
        />

        {error ? <ErrorBanner message={error} /> : null}

        <GoalField
          label={t("Kalori", "Calories")}
          color={colors.kalori}
          unit="kcal"
          value={calorie}
          onChange={setCalorie}
          max={LIMITS.calorie}
          placeholder={optional}
          fallback={2000}
          step={50}
        />
        <GoalField
          label={t("Protein", "Protein")}
          color={colors.protein}
          unit="g"
          value={protein}
          onChange={setProtein}
          max={LIMITS.macro}
          placeholder={optional}
          fallback={100}
          step={5}
        />
        <GoalField
          label={t("Karbonhidrat", "Carbs")}
          color={colors.karbonhidrat}
          unit="g"
          value={carbs}
          onChange={setCarbs}
          max={LIMITS.macro}
          placeholder={optional}
          fallback={200}
          step={5}
        />
        <GoalField
          label={t("Yağ", "Fat")}
          color={colors.yağ}
          unit="g"
          value={fat}
          onChange={setFat}
          max={LIMITS.macro}
          placeholder={optional}
          fallback={60}
          step={5}
        />

        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={[styles.save, { backgroundColor: green, opacity: isSaving ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {isSaving ? <ActivityIndicator color={isDark ? "#0F3A21" : "#FFFFFF"} /> : null}
          <Text style={[styles.saveText, { color: isDark ? "#0F3A21" : "#FFFFFF" }]}>
            {isSaving ? t("Kaydediliyor...", "Saving...") : t("Hedefleri Kaydet", "Save Goals")}
          </Text>
        </Pressable>

        {hasAnyGoal ? (
          <Pressable
            onPress={() =>
              save({ daily_calorie_goal: null, daily_protein_goal_g: null, daily_carbs_goal_g: null, daily_fat_goal_g: null })
            }
            disabled={isSaving}
            style={styles.clear}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.clearText, { color: muted }]}>{t("Beslenme hedeflerimi temizle", "Clear my nutrition goals")}</Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clear: { alignItems: "center", paddingVertical: 10 },
  clearText: { fontSize: 13 },
  rec: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  recLoading: { minHeight: 64, alignItems: "center", justifyContent: "center" },
  recHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  recTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  recKcal: { fontSize: 26, fontFamily: "Inter_700Bold" },
  recUnit: { fontSize: 14, fontFamily: "Inter_500Medium" },
  recMacros: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4 },
  recMacro: { flexDirection: "row", alignItems: "center", gap: 6 },
  recMacroText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  recBody: { fontSize: 13, lineHeight: 18 },
  recLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, alignSelf: "flex-start" },
  recLinkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recApply: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
  recApplyText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recNote: { fontSize: 11, lineHeight: 15 },
});
