"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Save, Target } from "lucide-react";
import {
  ApiError,
  deleteExerciseGoal,
  getExerciseGoals,
  setExerciseGoal,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import {
  Card,
  EmptyState,
  ErrorBanner,
  ExerciseGoalsList,
  Label,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  TextInput,
} from "@/components/ui";

export default function GoalsPage() {
  const { token } = useAuth();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç raporu, bulgu
  // #7 - bu sayfa girildiğinde profil önceden en az 2 kez isteniyordu).
  const { profile, updateProfile: updateProfileShared } = useProfile();
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);

  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [carbsGoal, setCarbsGoal] = useState("");
  const [fatGoal, setFatGoal] = useState("");
  const {
    isSubmitting: isSavingNutritionGoal,
    error: nutritionGoalError,
    success: nutritionGoalSuccess,
    setSuccess: setNutritionGoalSuccess,
    submit: submitNutritionGoal,
  } = useFormSubmit();

  const [exerciseName, setExerciseName] = useState("");
  const [exerciseTarget, setExerciseTarget] = useState("");
  const {
    isSubmitting: isSavingExerciseGoal,
    error: exerciseGoalError,
    setError: setExerciseGoalError,
    resetMessages: resetExerciseGoalMessages,
    submit: submitExerciseGoal,
  } = useFormSubmit();

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const goalsData = await getExerciseGoals(token);
    setExerciseGoals(goalsData);
  }, [token]);

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

  async function handleNutritionGoalSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await submitNutritionGoal(async () => {
      await updateProfileShared({
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : undefined,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : undefined,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : undefined,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : undefined,
      });
      setNutritionGoalSuccess(t("Hedefler kaydedildi!", "Goals saved!"));
    });
  }

  async function handleAddExerciseGoal(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    resetExerciseGoalMessages();

    if (!exerciseName.trim()) {
      setExerciseGoalError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }
    const targetNumber = Number(exerciseTarget);
    if (!targetNumber || targetNumber <= 0) {
      setExerciseGoalError(t("Hedef ağırlık sıfırdan büyük olmalı.", "Target weight must be greater than zero."));
      return;
    }

    await submitExerciseGoal(async () => {
      await setExerciseGoal(token, { exercise_name: exerciseName.trim(), target_weight_kg: targetNumber });
      setExerciseName("");
      setExerciseTarget("");
      await loadData();
    });
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
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Hedefler", "Goals")}</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </>
      ) : (
        <>
          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Günlük Beslenme Hedefleri", "Daily Nutrition Goals")}
            </h2>
            <form onSubmit={handleNutritionGoalSubmit} className="space-y-4">
              {nutritionGoalSuccess ? <SuccessBanner message={nutritionGoalSuccess} /> : null}
              {nutritionGoalError ? <ErrorBanner message={nutritionGoalError} /> : null}

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="calorieGoal">{t("Kalori (kcal)", "Calories (kcal)")}</Label>
                  <TextInput
                    id="calorieGoal"
                    type="number"
                    min={0}
                    value={calorieGoal}
                    onChange={(e) => setCalorieGoal(e.target.value)}
                    placeholder={t("opsiyonel", "optional")}
                  />
                </div>
                <div>
                  <Label htmlFor="proteinGoal">{t("Protein (g)", "Protein (g)")}</Label>
                  <TextInput
                    id="proteinGoal"
                    type="number"
                    min={0}
                    value={proteinGoal}
                    onChange={(e) => setProteinGoal(e.target.value)}
                    placeholder={t("opsiyonel", "optional")}
                  />
                </div>
                <div>
                  <Label htmlFor="carbsGoal">{t("Karbonhidrat (g)", "Carbs (g)")}</Label>
                  <TextInput
                    id="carbsGoal"
                    type="number"
                    min={0}
                    value={carbsGoal}
                    onChange={(e) => setCarbsGoal(e.target.value)}
                    placeholder={t("opsiyonel", "optional")}
                  />
                </div>
                <div>
                  <Label htmlFor="fatGoal">{t("Yağ (g)", "Fat (g)")}</Label>
                  <TextInput
                    id="fatGoal"
                    type="number"
                    min={0}
                    value={fatGoal}
                    onChange={(e) => setFatGoal(e.target.value)}
                    placeholder={t("opsiyonel", "optional")}
                  />
                </div>
              </div>

              <PrimaryButton type="submit" disabled={isSavingNutritionGoal}>
                <Save className="h-4 w-4" />
                {isSavingNutritionGoal ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </form>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Egzersiz Hedefleri", "Exercise Goals")}
            </h2>
            <div className="space-y-4">
              {exerciseGoalError ? <ErrorBanner message={exerciseGoalError} /> : null}

              {exerciseGoals.length > 0 ? (
                <ExerciseGoalsList goals={exerciseGoals} onDelete={handleDeleteExerciseGoal} />
              ) : (
                <EmptyState
                  icon={<Target className="h-8 w-8" />}
                  message={t("Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.", "No exercise goal yet. You can add one below.")}
                />
              )}

              <form
                onSubmit={handleAddExerciseGoal}
                className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-[2fr,1fr,auto] sm:items-end"
              >
                <div>
                  <Label>{t("Egzersiz", "Exercise")}</Label>
                  <ExerciseSearchField value={exerciseName} onChange={setExerciseName} />
                </div>
                <div>
                  <Label htmlFor="exerciseTarget">{t("Hedef (kg)", "Target (kg)")}</Label>
                  <TextInput
                    id="exerciseTarget"
                    type="number"
                    min={0}
                    step={0.5}
                    value={exerciseTarget}
                    onChange={(e) => setExerciseTarget(e.target.value)}
                  />
                </div>
                <SecondaryButton type="submit" disabled={isSavingExerciseGoal}>
                  <Plus className="h-4 w-4" />
                  {t("Ekle", "Add")}
                </SecondaryButton>
              </form>
            </div>
          </Card>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Target className="h-3.5 w-3.5" />
            {t(
              'Egzersiz hedeflerini sohbet üzerinden de belirleyebilirsin (ör. "squat\'ta 100 kiloya ulaşmak istiyorum"). Genel hedef, aktivite seviyesi ve hedef kilo için Profil sayfasına bak.',
              'You can also set exercise goals via chat (e.g. "I want to reach 100kg on squat"). See the Profile page for your general goal, activity level, and target weight.'
            )}
          </div>
        </>
      )}
    </div>
  );
}
