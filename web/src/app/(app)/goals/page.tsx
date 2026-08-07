"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, PartyPopper, Save, Target, Trash2 } from "lucide-react";
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
import {
  Card,
  EmptyState,
  ErrorBanner,
  GoalMeter,
  Label,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  TextInput,
} from "@/components/ui";

export default function GoalsPage() {
  const { token } = useAuth();
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

  useEffect(() => {
    async function initialLoad() {
      await loadData();
    }
    initialLoad();
  }, [loadData]);

  async function handleNutritionGoalSubmit(event: FormEvent) {
    event.preventDefault();
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

  async function handleAddExerciseGoal(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setExerciseGoalError(null);

    if (!exerciseName.trim()) {
      setExerciseGoalError("Egzersiz adı girmelisin.");
      return;
    }
    const targetNumber = Number(exerciseTarget);
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
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Hedefler</h1>

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
              Günlük Beslenme Hedefleri
            </h2>
            <form onSubmit={handleNutritionGoalSubmit} className="space-y-4">
              {nutritionGoalSuccess ? <SuccessBanner message={nutritionGoalSuccess} /> : null}
              {nutritionGoalError ? <ErrorBanner message={nutritionGoalError} /> : null}

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="calorieGoal">Kalori (kcal)</Label>
                  <TextInput
                    id="calorieGoal"
                    type="number"
                    min={0}
                    value={calorieGoal}
                    onChange={(e) => setCalorieGoal(e.target.value)}
                    placeholder="opsiyonel"
                  />
                </div>
                <div>
                  <Label htmlFor="proteinGoal">Protein (g)</Label>
                  <TextInput
                    id="proteinGoal"
                    type="number"
                    min={0}
                    value={proteinGoal}
                    onChange={(e) => setProteinGoal(e.target.value)}
                    placeholder="opsiyonel"
                  />
                </div>
                <div>
                  <Label htmlFor="carbsGoal">Karbonhidrat (g)</Label>
                  <TextInput
                    id="carbsGoal"
                    type="number"
                    min={0}
                    value={carbsGoal}
                    onChange={(e) => setCarbsGoal(e.target.value)}
                    placeholder="opsiyonel"
                  />
                </div>
                <div>
                  <Label htmlFor="fatGoal">Yağ (g)</Label>
                  <TextInput
                    id="fatGoal"
                    type="number"
                    min={0}
                    value={fatGoal}
                    onChange={(e) => setFatGoal(e.target.value)}
                    placeholder="opsiyonel"
                  />
                </div>
              </div>

              <PrimaryButton type="submit" disabled={isSavingNutritionGoal}>
                <Save className="h-4 w-4" />
                {isSavingNutritionGoal ? "Kaydediliyor..." : "Kaydet"}
              </PrimaryButton>
            </form>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Egzersiz Hedefleri
            </h2>
            <div className="space-y-4">
              {exerciseGoalError ? <ErrorBanner message={exerciseGoalError} /> : null}

              {exerciseGoals.length > 0 ? (
                <div className="space-y-4">
                  {exerciseGoals.map((eg) => (
                    <div key={eg.id}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <GoalMeter
                            label={eg.exercise_name}
                            value={eg.best_weight_kg ?? 0}
                            goal={eg.target_weight_kg}
                            unit="kg"
                            seriesVar="--series-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExerciseGoal(eg.id)}
                          className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                          aria-label="Hedefi sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {eg.progress_pct >= 100 ? (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <PartyPopper className="h-3.5 w-3.5" />
                          Tebrikler, {eg.exercise_name} hedefine ulaştın!
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Target className="h-8 w-8" />}
                  message="Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin."
                />
              )}

              <form
                onSubmit={handleAddExerciseGoal}
                className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-[2fr,1fr,auto] sm:items-end"
              >
                <div>
                  <Label>Egzersiz</Label>
                  <SearchableSelect<ExerciseCatalogItem>
                    selectedLabel={exerciseName}
                    onQueryChange={setExerciseName}
                    onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
                    onSelect={(item) => setExerciseName(item.name_tr)}
                    getLabel={(item) => item.name_tr}
                    getKey={(item) => item.id}
                    placeholder="Egzersiz adı yaz..."
                  />
                </div>
                <div>
                  <Label htmlFor="exerciseTarget">Hedef (kg)</Label>
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
                  Ekle
                </SecondaryButton>
              </form>
            </div>
          </Card>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Target className="h-3.5 w-3.5" />
            Egzersiz hedeflerini sohbet üzerinden de belirleyebilirsin (ör. &quot;squat&apos;ta
            100 kiloya ulaşmak istiyorum&quot;). Genel hedef, aktivite seviyesi ve hedef kilo
            için Profil sayfasına bak.
          </div>
        </>
      )}
    </div>
  );
}
