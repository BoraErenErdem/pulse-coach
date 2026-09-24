import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Minus, Plus, Target } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import { useRampColor } from "@/components/surface-tone";
import { useGoalGreen, useIdentityColors } from "@/components/progress-identity";
import { ApiError } from "@/lib/api";
import { parseLocaleNumber } from "@/lib/format";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { tapLight, tapSuccess } from "@/lib/haptics";

// İlerleme sekmesinde hedef belirleme sayfası (2026-09-19). İLK sürüm ortak
// BottomSheet+Stepper'ın soğuk antrasit görünümündeydi ("eski tasarım" - kullanıcı
// bulgusu); şimdi sayfanın diliyle: sıcak kahve (koyu) / krem-beyaz (açık) yüzey,
// her hedef metriğinin RENK KİMLİĞİYLE (kilo turuncu, bel pembe, yağ sarı) cam
// alanlar, yeşil birincil düğme (hedef rengi). Hepsi OPSİYONEL - boş alan = hedef yok.
// Kaydetme PATCH /profile (null = temizle); backend aynı sınırları uygular, burada
// da aynı aralıklar hızlı geri bildirim için kontrol edilir.
const LIMITS = { weight: 500, waist: 300, fat: 100 } as const;

function parseGoal(text: string, max: number): { value: number | null; invalid: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, invalid: false };
  const n = parseLocaleNumber(trimmed);
  if (Number.isNaN(n) || n <= 0 || n > max) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function stepValue(text: string, fallback: number | null | undefined, delta: number, max: number): string {
  const parsed = parseLocaleNumber(text.trim());
  const base = Number.isNaN(parsed) || text.trim() === "" ? (fallback ?? 0) : parsed;
  const next = Math.min(max, Math.max(0, Math.round((base + delta) * 10) / 10));
  return String(next);
}

export function GoalField({
  label,
  color,
  unit,
  value,
  onChange,
  max,
  currentText,
  placeholder,
  fallback,
  step = 0.5,
}: {
  label: string;
  color: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
  max: number;
  currentText?: string;
  placeholder: string;
  // "+/-" boş alandan başlarken (ör. güncel kilo) başlangıç noktası.
  fallback?: number | null;
  // +/- adımı (Beslenme hedeflerinde kalori 50, makro 5 - 2026-09-24).
  step?: number;
}) {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(245,162,107,0.12)",
          borderColor: `${color}${isDark ? "66" : "55"}`,
        },
      ]}
    >
      <View style={styles.fieldHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.fieldLabel, { color: text }]}>{label}</Text>
        <View style={{ flex: 1 }} />
        {currentText ? <Text style={[styles.fieldCurrent, { color: muted }]}>{currentText}</Text> : null}
      </View>
      <View style={styles.fieldRow}>
        <Pressable
          onPress={() => {
            tapLight();
            onChange(stepValue(value, fallback, -step, max));
          }}
          style={[styles.stepBtn, { backgroundColor: `${color}${isDark ? "33" : "2A"}`, borderColor: `${color}77` }]}
          hitSlop={6}
        >
          <Minus size={18} color={isDark ? "#FFFFFF" : color} strokeWidth={2.6} />
        </Pressable>
        <View style={[styles.inputWrap, { backgroundColor: isDark ? "rgba(0,0,0,0.28)" : "#FFFFFF", borderColor: isDark ? "transparent" : "rgba(245,162,107,0.35)" }]}>
          <TextInput
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            placeholder={placeholder}
            placeholderTextColor={muted}
            style={[styles.input, { color: text }]}
            selectTextOnFocus
          />
          <Text style={[styles.unit, { color: muted }]}>{unit}</Text>
        </View>
        <Pressable
          onPress={() => {
            tapLight();
            onChange(stepValue(value, fallback, step, max));
          }}
          style={[styles.stepBtn, { backgroundColor: `${color}${isDark ? "33" : "2A"}`, borderColor: `${color}77` }]}
          hitSlop={6}
        >
          <Plus size={18} color={isDark ? "#FFFFFF" : color} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

export function GoalSheet({
  visible,
  onClose,
  currents,
}: {
  visible: boolean;
  onClose: () => void;
  // Güncel değerler: alan başlığında "Güncel 83.5 kg" ipucu + "+/-" başlangıç noktası.
  currents?: { weight?: number | null; waist?: number | null; fat?: number | null };
}) {
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const green = useGoalGreen();
  const ids = useIdentityColors();
  const { profile, updateProfile } = useProfile();
  const rampColor = useRampColor();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sayfa her açıldığında alanlar mevcut hedeflerle dolar.
  useEffect(() => {
    if (!visible) return;
    setWeight(profile?.target_weight_kg?.toString() ?? "");
    setWaist(profile?.target_waist_cm?.toString() ?? "");
    setFat(profile?.target_body_fat_pct?.toString() ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const hasAnyGoal =
    profile?.target_weight_kg != null || profile?.target_waist_cm != null || profile?.target_body_fat_pct != null;
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;

  async function save(payload: { target_weight_kg: number | null; target_waist_cm: number | null; target_body_fat_pct: number | null }) {
    setIsSaving(true);
    setError(null);
    try {
      // `null` (undefined DEĞİL) gönderilir: backend `exclude_unset` kullanıyor,
      // null gövdede kalınca alan gerçekten temizleniyor.
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
    const w = parseGoal(weight, LIMITS.weight);
    const wa = parseGoal(waist, LIMITS.waist);
    const f = parseGoal(fat, LIMITS.fat);
    if (w.invalid) return setError(t(`Hedef kilo 0 ile ${LIMITS.weight} kg arasında olmalı.`, `Target weight must be between 0 and ${LIMITS.weight} kg.`));
    if (wa.invalid) return setError(t(`Hedef bel çevresi 0 ile ${LIMITS.waist} cm arasında olmalı.`, `Target waist must be between 0 and ${LIMITS.waist} cm.`));
    if (f.invalid) return setError(t(`Hedef yağ oranı 0 ile ${LIMITS.fat} arasında olmalı.`, `Target body fat % must be between 0 and ${LIMITS.fat}.`));
    void save({ target_weight_kg: w.value, target_waist_cm: wa.value, target_body_fat_pct: f.value });
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
            <Text style={[styles.title, { color: text }]}>{t("Hedeflerin", "Your goals")}</Text>
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
          label={t("Hedef Kilo", "Target Weight")}
          color={ids.weight}
          unit="kg"
          value={weight}
          onChange={setWeight}
          max={LIMITS.weight}
          placeholder={optional}
          fallback={currents?.weight}
          currentText={currents?.weight != null ? t(`Güncel ${currents.weight} kg`, `Now ${currents.weight} kg`) : undefined}
        />
        <GoalField
          label={t("Hedef Bel Çevresi", "Target Waist")}
          color={ids.waist}
          unit="cm"
          value={waist}
          onChange={setWaist}
          max={LIMITS.waist}
          placeholder={optional}
          fallback={currents?.waist}
          currentText={currents?.waist != null ? t(`Güncel ${currents.waist} cm`, `Now ${currents.waist} cm`) : undefined}
        />
        <GoalField
          label={t("Hedef Vücut Yağ Oranı", "Target Body Fat")}
          color={ids.fat}
          unit="%"
          value={fat}
          onChange={setFat}
          max={LIMITS.fat}
          placeholder={optional}
          fallback={currents?.fat}
          currentText={currents?.fat != null ? t(`Güncel %${currents.fat}`, `Now ${currents.fat}%`) : undefined}
        />

        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={[styles.save, { backgroundColor: green, opacity: isSaving ? 0.7 : 1 }]}
        >
          {isSaving ? <ActivityIndicator color={isDark ? "#0F3A21" : "#FFFFFF"} /> : null}
          <Text style={[styles.saveText, { color: isDark ? "#0F3A21" : "#FFFFFF" }]}>
            {isSaving ? t("Kaydediliyor...", "Saving...") : t("Hedefleri Kaydet", "Save Goals")}
          </Text>
        </Pressable>

        {hasAnyGoal ? (
          <Pressable
            onPress={() => save({ target_weight_kg: null, target_waist_cm: null, target_body_fat_pct: null })}
            disabled={isSaving}
            style={styles.clear}
            hitSlop={8}
          >
            <Text style={[styles.clearText, { color: muted }]}>{t("Tüm hedeflerimi temizle", "Clear all my goals")}</Text>
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
  field: { borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 12 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  fieldLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fieldCurrent: { fontSize: 12 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  inputWrap: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 6,
  },
  // minWidth:0 - web'de <input>'un doğal genişliği kutuyu aşıp birimi dışarı itiyordu.
  input: { flex: 1, minWidth: 0, fontSize: 20, fontFamily: "Inter_500Medium", paddingVertical: 0 },
  unit: { fontSize: 14 },
  save: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clear: { alignItems: "center", paddingVertical: 6 },
  clearText: { fontSize: 13 },
});
