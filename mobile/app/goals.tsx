import { useCallback, useEffect, useMemo, useState } from "react";
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
  EmptyState,
  ErrorBanner,
  FormLabel,
  PrimaryButton,
  RevealOnMount,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  type ThemeColors,
  useThemeColors,
} from "@/components/ui";
import { ExerciseGoalsList } from "@/components/exercise-goals-list";
import { SearchableSelect } from "@/components/searchable-select";
import { Stepper } from "@/components/stepper";
import { tapSuccess } from "@/lib/haptics";

// web/src/app/(app)/goals/page.tsx'in mobil portu - Faz M5.
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`;
// sayısal hedef alanları Stepper'a geçirildi (Antrenman'la aynı desen).
export default function GoalsScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
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
      // `undefined` DEĞİL `null` gönderiyoruz - aksi halde bir hedefi
      // temizleyip kaydetmek sessizce yok sayılıyordu (bkz. profile.tsx
      // aynı düzeltme, kullanıcı bulgusu).
      await updateProfileShared({
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : null,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : null,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : null,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : null,
      });
      tapSuccess();
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
      tapSuccess();
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
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <>
            <Skeleton height={220} />
            <Skeleton height={180} />
          </>
        ) : (
          <>
            <RevealOnMount delay={200}>
            <Card>
              <Text style={s.cardTitle}>{t("Günlük Beslenme Hedefleri", "Daily Nutrition Goals")}</Text>
              {nutritionGoalSuccess ? <SuccessBanner message={nutritionGoalSuccess} /> : null}
              {nutritionGoalError ? <ErrorBanner message={nutritionGoalError} /> : null}

              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Kalori (kcal)", "Calories (kcal)")}</FormLabel>
                  <Stepper value={calorieGoal} onChangeText={setCalorieGoal} step={50} min={0} placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Protein (g)", "Protein (g)")}</FormLabel>
                  <Stepper value={proteinGoal} onChangeText={setProteinGoal} step={5} min={0} placeholder={t("opsiyonel", "optional")} />
                </View>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Karbonhidrat (g)", "Carbs (g)")}</FormLabel>
                  <Stepper value={carbsGoal} onChangeText={setCarbsGoal} step={5} min={0} placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Yağ (g)", "Fat (g)")}</FormLabel>
                  <Stepper value={fatGoal} onChangeText={setFatGoal} step={5} min={0} placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>

              <PrimaryButton onPress={handleSaveNutritionGoals} disabled={isSavingNutritionGoal} loading={isSavingNutritionGoal}>
                {isSavingNutritionGoal ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </Card>
            </RevealOnMount>

            <RevealOnMount delay={260}>
            <Card>
              <Text style={s.cardTitle}>{t("Egzersiz Hedefleri", "Exercise Goals")}</Text>
              {exerciseGoalError ? <ErrorBanner message={exerciseGoalError} /> : null}

              {exerciseGoals.length > 0 ? (
                <>
                  <Text style={s.hintTextSmall}>{t("Silmek için sola kaydır.", "Swipe left to delete.")}</Text>
                  <ExerciseGoalsList goals={exerciseGoals} onDelete={handleDeleteExerciseGoal} />
                </>
              ) : (
                <EmptyState
                  icon={<Target size={28} color={c.muted} />}
                  message={t("Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.", "No exercise goal yet. You can add one below.")}
                />
              )}

              <View style={s.divider} />

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
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <FormLabel>{t("Hedef (kg)", "Target (kg)")}</FormLabel>
                  <Stepper value={exerciseTarget} onChangeText={setExerciseTarget} step={2.5} min={0} allowDecimal />
                </View>
                <View style={{ justifyContent: "flex-end" }}>
                  <SecondaryButton onPress={handleAddExerciseGoal} disabled={isSavingExerciseGoal}>
                    <Plus size={14} color={c.text} /> {"  "}
                    {t("Ekle", "Add")}
                  </SecondaryButton>
                </View>
              </View>
            </Card>
            </RevealOnMount>

            <RevealOnMount delay={320} style={s.hintRow}>
              <Target size={13} color={c.muted} />
              <Text style={s.hintText}>
                {t(
                  'Egzersiz hedeflerini sohbet üzerinden de belirleyebilirsin (ör. "squat\'ta 100 kiloya ulaşmak istiyorum"). Genel hedef, aktivite seviyesi ve hedef kilo için Profil ekranına bak.',
                  'You can also set exercise goals via chat (e.g. "I want to reach 100kg on squat"). See the Profile screen for your general goal, activity level, and target weight.'
                )}
              </Text>
            </RevealOnMount>
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text },
    row: { flexDirection: "row", gap: 10 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
    hintText: { flex: 1, fontSize: 12, color: c.muted, lineHeight: 17 },
    hintTextSmall: { fontSize: 11, color: c.muted, marginBottom: 2 },
  });
}
