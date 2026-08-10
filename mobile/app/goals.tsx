import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, Target } from "lucide-react-native";
import {
  ApiError,
  deleteExerciseGoal,
  getExerciseGoals,
  searchExercises,
  setExerciseGoal,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { parseLocaleNumber } from "@/lib/format";
import {
  Card,
  DetailScreen,
  ErrorBanner,
  FormInput,
  FormLabel,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  colors,
} from "@/components/ui";
import { ExerciseGoalsList } from "@/components/exercise-goals-list";
import { SearchableSelect } from "@/components/searchable-select";

// web/src/app/(app)/goals/page.tsx'in mobil portu - Faz M5.
export default function GoalsScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç raporu, bulgu
  // #7 - bu ekran açıldığında profil önceden en az 2 kez isteniyordu).
  const { profile, updateProfile: updateProfileShared } = useProfile();
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [carbsGoal, setCarbsGoal] = useState("");
  const [fatGoal, setFatGoal] = useState("");
  const [nutritionGoalError, setNutritionGoalError] = useState<string | null>(null);
  const [nutritionGoalSuccess, setNutritionGoalSuccess] = useState<string | null>(null);
  const [isSavingNutritionGoal, setIsSavingNutritionGoal] = useState(false);

  const [exerciseName, setExerciseName] = useState("");
  const [exerciseTarget, setExerciseTarget] = useState("");
  const [exerciseGoalError, setExerciseGoalError] = useState<string | null>(null);
  const [isSavingExerciseGoal, setIsSavingExerciseGoal] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const goalsData = await getExerciseGoals(token);
      setExerciseGoals(goalsData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Form alanlarını paylaşımlı profile her değiştiğinde (ilk yükleme VEYA
  // bu formun kendi başarılı kaydından sonra) senkron tutar.
  useEffect(() => {
    function syncFromProfile() {
      if (!profile) return;
      setCalorieGoal(profile.daily_calorie_goal?.toString() ?? "");
      setProteinGoal(profile.daily_protein_goal_g?.toString() ?? "");
      setCarbsGoal(profile.daily_carbs_goal_g?.toString() ?? "");
      setFatGoal(profile.daily_fat_goal_g?.toString() ?? "");
    }
    syncFromProfile();
  }, [profile]);

  async function handleSaveNutritionGoals() {
    if (!token) return;
    setNutritionGoalError(null);
    setNutritionGoalSuccess(null);
    setIsSavingNutritionGoal(true);
    try {
      await updateProfileShared({
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : undefined,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : undefined,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : undefined,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : undefined,
      });
      setNutritionGoalSuccess(t("Hedefler kaydedildi!", "Goals saved!"));
    } catch (err) {
      setNutritionGoalError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingNutritionGoal(false);
    }
  }

  async function handleAddExerciseGoal() {
    if (!token) return;
    setExerciseGoalError(null);

    if (!exerciseName.trim()) {
      setExerciseGoalError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }
    const targetNumber = parseLocaleNumber(exerciseTarget);
    if (!targetNumber || targetNumber <= 0) {
      setExerciseGoalError(t("Hedef ağırlık sıfırdan büyük olmalı.", "Target weight must be greater than zero."));
      return;
    }

    setIsSavingExerciseGoal(true);
    try {
      await setExerciseGoal(token, { exercise_name: exerciseName.trim(), target_weight_kg: targetNumber });
      setExerciseName("");
      setExerciseTarget("");
      await loadData();
    } catch (err) {
      setExerciseGoalError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingExerciseGoal(false);
    }
  }

  async function handleDeleteExerciseGoal(goalId: number) {
    if (!token) return;
    try {
      await deleteExerciseGoal(token, goalId);
      await loadData();
    } catch (err) {
      setExerciseGoalError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  return (
    <DetailScreen title={t("Hedefler", "Goals")}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <>
            <Skeleton height={220} />
            <Skeleton height={180} />
          </>
        ) : (
          <>
            <Card>
              <Text style={styles.cardTitle}>{t("Günlük Beslenme Hedefleri", "Daily Nutrition Goals")}</Text>
              {nutritionGoalSuccess ? <SuccessBanner message={nutritionGoalSuccess} /> : null}
              {nutritionGoalError ? <ErrorBanner message={nutritionGoalError} /> : null}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Kalori (kcal)", "Calories (kcal)")}</FormLabel>
                  <FormInput value={calorieGoal} onChangeText={setCalorieGoal} keyboardType="number-pad" placeholder={t("opsiyonel", "optional")} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Protein (g)", "Protein (g)")}</FormLabel>
                  <FormInput value={proteinGoal} onChangeText={setProteinGoal} keyboardType="number-pad" placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Karbonhidrat (g)", "Carbs (g)")}</FormLabel>
                  <FormInput value={carbsGoal} onChangeText={setCarbsGoal} keyboardType="number-pad" placeholder={t("opsiyonel", "optional")} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Yağ (g)", "Fat (g)")}</FormLabel>
                  <FormInput value={fatGoal} onChangeText={setFatGoal} keyboardType="number-pad" placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>

              <PrimaryButton onPress={handleSaveNutritionGoals} disabled={isSavingNutritionGoal} loading={isSavingNutritionGoal}>
                {isSavingNutritionGoal ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>{t("Egzersiz Hedefleri", "Exercise Goals")}</Text>
              {exerciseGoalError ? <ErrorBanner message={exerciseGoalError} /> : null}

              {exerciseGoals.length > 0 ? (
                <ExerciseGoalsList goals={exerciseGoals} onDelete={handleDeleteExerciseGoal} />
              ) : (
                <Text style={styles.emptyText}>{t("Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.", "No exercise goal yet. You can add one below.")}</Text>
              )}

              <View style={styles.divider} />

              <View>
                <FormLabel>{t("Egzersiz", "Exercise")}</FormLabel>
                <SearchableSelect<ExerciseCatalogItem>
                  selectedLabel={exerciseName}
                  onQueryChange={setExerciseName}
                  onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
                  onSelect={(item) => setExerciseName(catalogDisplayName(item, language))}
                  getLabel={(item) => catalogDisplayName(item, language)}
                  getKey={(item) => item.id}
                  placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
                />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Hedef (kg)", "Target (kg)")}</FormLabel>
                  <FormInput value={exerciseTarget} onChangeText={setExerciseTarget} keyboardType="numeric" />
                </View>
                <View style={{ justifyContent: "flex-end" }}>
                  <SecondaryButton onPress={handleAddExerciseGoal} disabled={isSavingExerciseGoal}>
                    <Plus size={14} color={colors.text} /> {"  "}
                    {t("Ekle", "Add")}
                  </SecondaryButton>
                </View>
              </View>
            </Card>

            <View style={styles.hintRow}>
              <Target size={13} color={colors.muted} />
              <Text style={styles.hintText}>
                {t(
                  'Egzersiz hedeflerini sohbet üzerinden de belirleyebilirsin (ör. "squat\'ta 100 kiloya ulaşmak istiyorum"). Genel hedef, aktivite seviyesi ve hedef kilo için Profil ekranına bak.',
                  'You can also set exercise goals via chat (e.g. "I want to reach 100kg on squat"). See the Profile screen for your general goal, activity level, and target weight.'
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 },
});
