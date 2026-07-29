"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Save, Target, Trash2 } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  ApiError,
  GOALS,
  deleteExerciseGoal,
  getExerciseGoals,
  getProfile,
  searchExercises,
  setExerciseGoal,
  updateProfile,
  type ActivityLevel,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
  type Goal,
  type Profile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  ErrorBanner,
  GoalMeter,
  Label,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Select,
  Skeleton,
  SuccessBanner,
  TextInput,
} from "@/components/ui";

const GOAL_LABELS: Record<Goal, string> = {
  weight_loss: "Kilo vermek",
  muscle_gain: "Kas yapmak",
  general_health: "Genel sağlık",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Hareketsiz",
  light: "Hafif aktif",
  moderate: "Orta aktif",
  active: "Çok aktif",
};

export default function GoalsPage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [goal, setGoal] = useState<Goal | "">("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [carbsGoal, setCarbsGoal] = useState("");
  const [fatGoal, setFatGoal] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [exerciseName, setExerciseName] = useState("");
  const [exerciseTarget, setExerciseTarget] = useState("");
  const [exerciseGoalError, setExerciseGoalError] = useState<string | null>(null);
  const [isSavingExerciseGoal, setIsSavingExerciseGoal] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [profileData, goalsData] = await Promise.all([getProfile(token), getExerciseGoals(token)]);
      setProfile(profileData);
      setExerciseGoals(goalsData);
      setGoal(profileData.goal ?? "");
      setActivityLevel(profileData.activity_level ?? "");
      setDietaryRestrictions(profileData.dietary_restrictions ?? "");
      setTargetWeight(profileData.target_weight_kg?.toString() ?? "");
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

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);
    try {
      const updated = await updateProfile(token, {
        goal: goal || undefined,
        activity_level: activityLevel || undefined,
        dietary_restrictions: dietaryRestrictions || undefined,
        target_weight_kg: targetWeight ? Number(targetWeight) : undefined,
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : undefined,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : undefined,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : undefined,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : undefined,
      });
      setProfile(updated);
      setProfileSuccess("Hedefler kaydedildi!");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSavingProfile(false);
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
              Profil ve Hedefler
            </h2>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileSuccess ? <SuccessBanner message={profileSuccess} /> : null}
              {profileError ? <ErrorBanner message={profileError} /> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="goal">Genel Hedef</Label>
                  <Select
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value as Goal | "")}
                  >
                    <option value="">Belirtilmemiş</option>
                    {GOALS.map((g) => (
                      <option key={g} value={g}>
                        {GOAL_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="activityLevel">Aktivite Seviyesi</Label>
                  <Select
                    id="activityLevel"
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value as ActivityLevel | "")}
                  >
                    <option value="">Belirtilmemiş</option>
                    {ACTIVITY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {ACTIVITY_LABELS[level]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="dietaryRestrictions">Kısıtlamalar (alerji, vejetaryen vb.)</Label>
                <TextInput
                  id="dietaryRestrictions"
                  value={dietaryRestrictions}
                  onChange={(e) => setDietaryRestrictions(e.target.value)}
                  placeholder="opsiyonel"
                />
              </div>

              <div>
                <Label htmlFor="targetWeight">Hedef Kilo (kg)</Label>
                <TextInput
                  id="targetWeight"
                  type="number"
                  min={0}
                  step={0.1}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="max-w-[10rem]"
                  placeholder="opsiyonel"
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Günlük Beslenme Hedefleri
                </h3>
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
              </div>

              <PrimaryButton type="submit" disabled={isSavingProfile}>
                <Save className="h-4 w-4" />
                {isSavingProfile ? "Kaydediliyor..." : "Kaydet"}
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
                    <div key={eg.id} className="flex items-center gap-3">
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
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.
                </p>
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

          {!profile ? null : (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Target className="h-3.5 w-3.5" />
              Bu hedefleri sohbet üzerinden de belirleyebilirsin (ör. &quot;85 kiloya inmek
              istiyorum&quot;, &quot;squat&apos;ta 100 kiloya ulaşmak istiyorum&quot;).
            </div>
          )}
        </>
      )}
    </div>
  );
}
