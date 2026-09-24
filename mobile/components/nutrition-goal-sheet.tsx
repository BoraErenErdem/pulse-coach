import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Target } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import { rampColor } from "@/components/progress-cards";
import { GoalField } from "@/components/progress-goal-sheet";
import { useGoalGreen } from "@/components/progress-identity";
import { useNutrientColors } from "@/components/nutrition-identity";
import { ApiError } from "@/lib/api";
import { parseLocaleNumber } from "@/lib/format";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { tapSuccess } from "@/lib/haptics";

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

export function NutritionGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const colors = useNutrientColors();
  const { profile, updateProfile } = useProfile();
  const [calorie, setCalorie] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCalorie(profile?.daily_calorie_goal?.toString() ?? "");
    setProtein(profile?.daily_protein_goal_g?.toString() ?? "");
    setCarbs(profile?.daily_carbs_goal_g?.toString() ?? "");
    setFat(profile?.daily_fat_goal_g?.toString() ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
});
