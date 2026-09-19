import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Target } from "lucide-react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { Stepper } from "@/components/stepper";
import { ErrorBanner, FormLabel, PrimaryButton, useThemeColors } from "@/components/ui";
import { useGoalGreen } from "@/components/progress-identity";
import { ApiError } from "@/lib/api";
import { parseLocaleNumber } from "@/lib/format";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { tapSuccess } from "@/lib/haptics";

// İlerleme sekmesinde hedef belirleme (2026-09-19): hedef kilo ÖNCEDEN sadece
// Profil > Hesap ekranındaydı (keşfedilemiyordu, hedefe ilerleme de orada
// görünmüyordu). Bel çevresi ve vücut yağ oranı hedefleri OPSİYONEL - boş bırakılan
// alan "hedef yok" demek. Aynı üç alan PATCH /profile ile kaydedilir; backend aynı
// sınırları (kilo/bel/yağ ölçümleriyle aynı aralık) uygular, burada da aynı
// aralıklar istemci tarafında hızlı geri bildirim için kontrol edilir.
const LIMITS = { weight: 500, waist: 300, fat: 100 } as const;

function parseGoal(text: string, max: number): { value: number | null; invalid: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, invalid: false };
  const n = parseLocaleNumber(trimmed);
  if (Number.isNaN(n) || n <= 0 || n > max) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

export function GoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const c = useThemeColors();
  const green = useGoalGreen();
  const { profile, updateProfile } = useProfile();
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

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: `${green}26` }]}>
            <Target size={20} color={green} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: c.text }]}>{t("Hedeflerin", "Your goals")}</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>
              {t(
                "Hepsi isteğe bağlı. Boş bıraktığın alan için hedef gösterilmez.",
                "All optional. A field you leave empty won't show a goal."
              )}
            </Text>
          </View>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.field}>
          <FormLabel>{t("Hedef Kilo (kg)", "Target Weight (kg)")}</FormLabel>
          <Stepper value={weight} onChangeText={setWeight} step={0.5} min={0} max={LIMITS.weight} allowDecimal keyboardType="numeric" placeholder={t("opsiyonel", "optional")} />
        </View>
        <View style={styles.field}>
          <FormLabel>{t("Hedef Bel Çevresi (cm)", "Target Waist (cm)")}</FormLabel>
          <Stepper value={waist} onChangeText={setWaist} step={0.5} min={0} max={LIMITS.waist} allowDecimal keyboardType="numeric" placeholder={t("opsiyonel", "optional")} />
        </View>
        <View style={styles.field}>
          <FormLabel>{t("Hedef Vücut Yağ Oranı (%)", "Target Body Fat (%)")}</FormLabel>
          <Stepper value={fat} onChangeText={setFat} step={0.5} min={0} max={LIMITS.fat} allowDecimal keyboardType="numeric" placeholder={t("opsiyonel", "optional")} />
        </View>

        <PrimaryButton onPress={handleSave} disabled={isSaving} loading={isSaving}>
          {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
        </PrimaryButton>

        {hasAnyGoal ? (
          <Pressable
            onPress={() => save({ target_weight_kg: null, target_waist_cm: null, target_body_fat_pct: null })}
            disabled={isSaving}
            style={styles.clear}
            hitSlop={8}
          >
            <Text style={[styles.clearText, { color: c.muted }]}>{t("Tüm hedeflerimi temizle", "Clear all my goals")}</Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  field: { gap: 4 },
  clear: { alignItems: "center", paddingVertical: 6 },
  clearText: { fontSize: 13 },
});
