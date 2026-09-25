import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Target } from "lucide-react-native";
import {
  ApiError,
  deleteExerciseGoal,
  searchExercises,
  setExerciseGoal,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { parseLocaleNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme-context";
import { tapSuccess } from "@/lib/haptics";
import { BottomSheet } from "@/components/bottom-sheet";
import { ErrorBanner, FormLabel, useThemeColors } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { GoalField } from "@/components/progress-goal-sheet";
import { useRampColor } from "@/components/surface-tone";
import { useWorkoutIdentityColors } from "@/components/workout-identity";

// Egzersiz hedefi ekle/düzenle sayfası (2026-09-25): önceden workouts.tsx'in
// içinde gömülüydü, goals.tsx'te de aynı formun ayrı bir kopyası vardı. Artık
// TEK bileşen - Antrenman sekmesi ve Profil > Hedef Merkezi aynı sheet'i açıyor.
// Yüzey rengi bulunduğu ekranın tonundan (useRampColor), vurgu Antrenman
// kırmızısı (hedefin "sahibi" Antrenman). Alanlar İlerleme'nin GoalField
// kalıbında alt alta: iki Stepper yan yana 393px'te taşıyordu.
//
// Backend hedefi egzersiz ADINA göre upsert ediyor (ayrı PATCH yok) - bu yüzden
// düzenlerken ad KİLİTLİ; değişirse güncelleme değil yeni hedef oluşur.

const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 1000;
const MAX_DURATION_MIN = 24 * 60;

export function ExerciseGoalSheet({
  visible,
  onClose,
  editingGoal,
  onSaved,
  allowDelete = false,
}: {
  visible: boolean;
  onClose: () => void;
  // null = yeni hedef; dolu = bu hedefin değerleriyle düzenleme.
  editingGoal: ExerciseGoalProgress | null;
  // Kayıt/silme sonrası çağıranın listesini tazelemesi için.
  onSaved: () => void | Promise<void>;
  // Düzenlerken sheet içinden silme (Hedef Merkezi) - iki adımlı onay.
  allowDelete?: boolean;
}) {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const rampColor = useRampColor();
  const red = useWorkoutIdentityColors().sessions;

  const [name, setName] = useState("");
  const [catalogId, setCatalogId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [reps, setReps] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Her açılışta alanlar sıfırlanır ya da düzenlenen hedefle dolar.
  useEffect(() => {
    if (!visible) return;
    const isDuration = editingGoal?.target_duration_minutes != null;
    setName(editingGoal?.exercise_name ?? "");
    setCatalogId(null);
    setCategory(isDuration ? "kardiyo" : null);
    setDuration(isDuration ? String(editingGoal?.target_duration_minutes) : "");
    setTarget(editingGoal && !isDuration ? String(editingGoal.target_weight_kg ?? "") : "");
    setReps(editingGoal && !isDuration && editingGoal.target_reps != null ? String(editingGoal.target_reps) : "");
    setError(null);
    setIsConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDurationMode = category === "kardiyo" || category === "esneklik";
  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;

  async function handleSave() {
    if (!token) return;
    setError(null);
    if (!name.trim()) {
      setError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }
    let payload: Parameters<typeof setExerciseGoal>[1];
    if (isDurationMode) {
      const minutes = parseLocaleNumber(duration);
      if (!minutes || minutes <= 0 || minutes > MAX_DURATION_MIN) {
        setError(t(`Hedef süre 0 ile ${MAX_DURATION_MIN} dakika arasında olmalı.`, `Target duration must be between 0 and ${MAX_DURATION_MIN} minutes.`));
        return;
      }
      payload = { exercise_name: name.trim(), target_duration_minutes: minutes, exercise_catalog_id: catalogId ?? undefined };
    } else {
      const kg = parseLocaleNumber(target);
      if (!kg || kg <= 0 || kg > MAX_WEIGHT_KG) {
        setError(t(`Hedef ağırlık 0 ile ${MAX_WEIGHT_KG} kg arasında olmalı.`, `Target weight must be between 0 and ${MAX_WEIGHT_KG} kg.`));
        return;
      }
      let repsNumber: number | undefined;
      if (reps.trim()) {
        repsNumber = parseLocaleNumber(reps);
        if (!repsNumber || repsNumber <= 0 || repsNumber > MAX_REPS || !Number.isInteger(repsNumber)) {
          setError(t("Hedef tekrar 1 ile 1000 arasında tam sayı olmalı.", "Target reps must be a whole number between 1 and 1000."));
          return;
        }
      }
      payload = {
        exercise_name: name.trim(),
        target_weight_kg: kg,
        target_reps: repsNumber,
        exercise_catalog_id: catalogId ?? undefined,
      };
    }
    setIsSaving(true);
    try {
      await setExerciseGoal(token, payload);
      tapSuccess();
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!token || !editingGoal) return;
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await deleteExerciseGoal(token, editingGoal.id);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    } finally {
      setIsSaving(false);
    }
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
          <View style={[styles.iconCircle, { backgroundColor: `${red}26`, borderColor: `${red}66` }]}>
            <Target size={20} color={red} strokeWidth={2.3} />
          </View>
          <Text style={[styles.title, { color: text }]}>
            {editingGoal ? t("Egzersiz Hedefini Düzenle", "Edit Exercise Goal") : t("Egzersiz Hedefi Ekle", "Add Exercise Goal")}
          </Text>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <View>
          <FormLabel>{t("Egzersiz", "Exercise")}</FormLabel>
          {editingGoal ? (
            <View
              style={[
                styles.locked,
                {
                  borderColor: isDark ? "rgba(255,255,255,0.15)" : c.border,
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
                },
              ]}
            >
              <Text style={[styles.lockedText, { color: text }]}>{name}</Text>
            </View>
          ) : (
            <SearchableSelect<ExerciseCatalogItem>
              selectedLabel={name}
              onQueryChange={(value) => {
                setName(value);
                // Katalogdan yeniden seçilene kadar kategori bilinmiyor - önceki
                // seçimin kategorisine güvenip yanlış form göstermeyelim.
                setCatalogId(null);
                setCategory(null);
              }}
              onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
              onSelect={(item) => {
                setName(catalogDisplayName(item, language));
                setCatalogId(item.id);
                setCategory(item.category_tr);
              }}
              getLabel={(item) => catalogDisplayName(item, language)}
              getKey={(item) => item.id}
              placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
            />
          )}
        </View>

        {isDurationMode ? (
          <GoalField
            label={t("Hedef Süre", "Target Duration")}
            color={red}
            unit={t("dk", "min")}
            value={duration}
            onChange={setDuration}
            max={MAX_DURATION_MIN}
            placeholder={t("ör. 30", "e.g. 30")}
            step={5}
          />
        ) : (
          <>
            <GoalField
              label={t("Hedef Ağırlık", "Target Weight")}
              color={red}
              unit="kg"
              value={target}
              onChange={setTarget}
              max={MAX_WEIGHT_KG}
              placeholder={t("ör. 60", "e.g. 60")}
              step={2.5}
            />
            <GoalField
              label={t("Hedef Tekrar", "Target Reps")}
              color={red}
              unit={t("tekrar", "reps")}
              value={reps}
              onChange={setReps}
              max={MAX_REPS}
              placeholder={optional}
              step={1}
            />
          </>
        )}

        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          style={[styles.save, { backgroundColor: red, opacity: isSaving ? 0.7 : 1 }]}
        >
          {isSaving ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.saveText}>
            {isSaving ? t("Kaydediliyor...", "Saving...") : editingGoal ? t("Hedefi Güncelle", "Update Goal") : t("Hedefi Kaydet", "Save Goal")}
          </Text>
        </Pressable>

        {editingGoal && allowDelete ? (
          <Pressable onPress={handleDelete} disabled={isSaving} style={styles.delete} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.deleteText, { color: isConfirmingDelete ? c.error : muted }]}>
              {isConfirmingDelete ? t("Emin misin? Silmek için tekrar dokun", "Sure? Tap again to delete") : t("Bu hedefi sil", "Delete this goal")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  locked: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  lockedText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  save: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 16 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  delete: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  deleteText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
