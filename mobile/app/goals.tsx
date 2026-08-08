import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, PartyPopper, Target, Trash2 } from "lucide-react-native";
import {
  ApiError,
  deleteExerciseGoal,
  getExerciseGoals,
  getProfile,
  searchExercises,
  setExerciseGoal,
  updateProfile,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { catalogDisplayName, useLanguage } from "@/lib/language-context";
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
  seriesColors,
} from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";
import { SearchableSelect } from "@/components/searchable-select";

// web/src/app/(app)/goals/page.tsx'in mobil portu - Faz M5.
export default function GoalsScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
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
      const [profileData, goalsData] = await Promise.all([getProfile(token), getExerciseGoals(token)]);
      setExerciseGoals(goalsData);
      setCalorieGoal(profileData.daily_calorie_goal?.toString() ?? "");
      setProteinGoal(profileData.daily_protein_goal_g?.toString() ?? "");
      setCarbsGoal(profileData.daily_carbs_goal_g?.toString() ?? "");
      setFatGoal(profileData.daily_fat_goal_g?.toString() ?? "");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleSaveNutritionGoals() {
    if (!token) return;
    setNutritionGoalError(null);
    setNutritionGoalSuccess(null);
    setIsSavingNutritionGoal(true);
    try {
      await updateProfile(token, {
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : undefined,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : undefined,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : undefined,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : undefined,
      });
      setNutritionGoalSuccess("Hedefler kaydedildi!");
    } catch (err) {
      setNutritionGoalError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSavingNutritionGoal(false);
    }
  }

  async function handleAddExerciseGoal() {
    if (!token) return;
    setExerciseGoalError(null);

    if (!exerciseName.trim()) {
      setExerciseGoalError("Egzersiz adı girmelisin.");
      return;
    }
    const targetNumber = Number(exerciseTarget.replace(",", "."));
    if (!targetNumber || targetNumber <= 0) {
      setExerciseGoalError("Hedef ağırlık sıfırdan büyük olmalı.");
      return;
    }

    setIsSavingExerciseGoal(true);
    try {
      await setExerciseGoal(token, { exercise_name: exerciseName.trim(), target_weight_kg: targetNumber });
      setExerciseName("");
      setExerciseTarget("");
      await loadData();
    } catch (err) {
      setExerciseGoalError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
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
      setExerciseGoalError(err instanceof ApiError ? err.message : "Silinemedi, tekrar dener misin?");
    }
  }

  return (
    <DetailScreen title="Hedefler">
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
              <Text style={styles.cardTitle}>Günlük Beslenme Hedefleri</Text>
              {nutritionGoalSuccess ? <SuccessBanner message={nutritionGoalSuccess} /> : null}
              {nutritionGoalError ? <ErrorBanner message={nutritionGoalError} /> : null}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>Kalori (kcal)</FormLabel>
                  <FormInput value={calorieGoal} onChangeText={setCalorieGoal} keyboardType="number-pad" placeholder="opsiyonel" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>Protein (g)</FormLabel>
                  <FormInput value={proteinGoal} onChangeText={setProteinGoal} keyboardType="number-pad" placeholder="opsiyonel" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>Karbonhidrat (g)</FormLabel>
                  <FormInput value={carbsGoal} onChangeText={setCarbsGoal} keyboardType="number-pad" placeholder="opsiyonel" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>Yağ (g)</FormLabel>
                  <FormInput value={fatGoal} onChangeText={setFatGoal} keyboardType="number-pad" placeholder="opsiyonel" />
                </View>
              </View>

              <PrimaryButton onPress={handleSaveNutritionGoals} disabled={isSavingNutritionGoal} loading={isSavingNutritionGoal}>
                {isSavingNutritionGoal ? "Kaydediliyor..." : "Kaydet"}
              </PrimaryButton>
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Egzersiz Hedefleri</Text>
              {exerciseGoalError ? <ErrorBanner message={exerciseGoalError} /> : null}

              {exerciseGoals.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {exerciseGoals.map((eg) => (
                    <View key={eg.id}>
                      <View style={styles.goalRow}>
                        <View style={{ flex: 1 }}>
                          <GoalMeter
                            label={eg.exercise_name}
                            value={eg.best_weight_kg ?? 0}
                            goal={eg.target_weight_kg}
                            unit="kg"
                            color={seriesColors.series2}
                          />
                        </View>
                        <Pressable onPress={() => handleDeleteExerciseGoal(eg.id)} hitSlop={8}>
                          <Trash2 size={16} color={colors.muted} />
                        </Pressable>
                      </View>
                      {eg.progress_pct >= 100 ? (
                        <View style={styles.celebrateRow}>
                          <PartyPopper size={13} color={colors.celebrate} />
                          <Text style={styles.celebrateText}>
                            Tebrikler, {eg.exercise_name} hedefine ulaştın!
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.</Text>
              )}

              <View style={styles.divider} />

              <View>
                <FormLabel>Egzersiz</FormLabel>
                <SearchableSelect<ExerciseCatalogItem>
                  selectedLabel={exerciseName}
                  onQueryChange={setExerciseName}
                  onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
                  onSelect={(item) => setExerciseName(catalogDisplayName(item, language))}
                  getLabel={(item) => catalogDisplayName(item, language)}
                  getKey={(item) => item.id}
                  placeholder="Egzersiz adı yaz..."
                />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>Hedef (kg)</FormLabel>
                  <FormInput value={exerciseTarget} onChangeText={setExerciseTarget} keyboardType="number-pad" />
                </View>
                <View style={{ justifyContent: "flex-end" }}>
                  <SecondaryButton onPress={handleAddExerciseGoal} disabled={isSavingExerciseGoal}>
                    <Plus size={14} color={colors.text} /> {"  "}Ekle
                  </SecondaryButton>
                </View>
              </View>
            </Card>

            <View style={styles.hintRow}>
              <Target size={13} color={colors.muted} />
              <Text style={styles.hintText}>
                Egzersiz hedeflerini sohbet üzerinden de belirleyebilirsin (ör. &ldquo;squat&apos;ta
                100 kiloya ulaşmak istiyorum&rdquo;).
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
  goalRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 },
  celebrateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  celebrateText: { fontSize: 12, fontWeight: "600", color: colors.celebrate },
});
