"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Save, Sparkles, Target } from "lucide-react";
import {
  ApiError,
  deleteExerciseGoal,
  getCalorieRecommendation,
  getExerciseGoals,
  setExerciseGoal,
  type CalorieRecommendation,
  type CalorieRecommendationMissing,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import { WeeklyGoalCard } from "@/components/WeeklyGoalCard";
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
  const [exerciseReps, setExerciseReps] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  // Katalogdan seçilen kaydın kategorisi (ör. "kardiyo") - kardiyo/esneklik
  // egzersizlerinde kg/tekrar yerine süre hedefi girilir (mobil goals.tsx /
  // workouts sayfasındaki isDurationMode ile aynı ilke). Serbest yazınca
  // (yeniden seçim yapılmadan) sıfırlanır, önceki seçimin kategorisine
  // güvenilmez.
  const [exerciseCatalogId, setExerciseCatalogId] = useState<number | null>(null);
  const [exerciseCategory, setExerciseCategory] = useState<string | null>(null);
  const isDurationGoal = exerciseCategory === "kardiyo" || exerciseCategory === "esneklik";
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

  // Kalori önerisi (2026-09-26): profil (boy/aktivite/hedef) değişince yenilenir.
  // Öneri alanları SADECE doldurur - kayıt yine Kaydet ile.
  const [recommendation, setRecommendation] = useState<CalorieRecommendation | null>(null);
  useEffect(() => {
    if (!token || !profile) return;
    let cancelled = false;
    getCalorieRecommendation(token)
      .then((rec) => {
        if (!cancelled) setRecommendation(rec);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, profile]);
  const MISSING_LABELS: Record<CalorieRecommendationMissing, string> = {
    height: t("boy", "height"),
    birth_year: t("doğum yılı", "birth year"),
    sex: t("cinsiyet", "sex"),
    weight: t("güncel kilo", "current weight"),
    activity_level: t("aktivite seviyesi", "activity level"),
  };

  function applyRecommendation(rec: CalorieRecommendation) {
    setCalorieGoal(String(rec.calories ?? ""));
    setProteinGoal(String(rec.protein_g ?? ""));
    setCarbsGoal(String(rec.carbs_g ?? ""));
    setFatGoal(String(rec.fat_g ?? ""));
    setNutritionGoalSuccess(null);
  }

  async function handleNutritionGoalSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    // `undefined` DEĞİL `null` gönderiyoruz - aksi halde bir hedefi
    // temizleyip kaydetmek sessizce yok sayılıyordu (bkz. profile/page.tsx
    // aynı düzeltme, kullanıcı bulgusu).
    await submitNutritionGoal(async () => {
      await updateProfileShared({
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : null,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : null,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : null,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : null,
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

    let payload: Parameters<typeof setExerciseGoal>[1];
    if (isDurationGoal) {
      const durationNumber = Number(exerciseDuration);
      if (!durationNumber || durationNumber <= 0) {
        setExerciseGoalError(t("Hedef süre sıfırdan büyük olmalı.", "Target duration must be greater than zero."));
        return;
      }
      payload = {
        exercise_name: exerciseName.trim(),
        target_duration_minutes: durationNumber,
        exercise_catalog_id: exerciseCatalogId ?? undefined,
      };
    } else {
      const targetNumber = Number(exerciseTarget);
      if (!targetNumber || targetNumber <= 0) {
        setExerciseGoalError(t("Hedef ağırlık sıfırdan büyük olmalı.", "Target weight must be greater than zero."));
        return;
      }
      // Tekrar hedefi opsiyonel - boşsa hiç gönderilmez.
      let repsNumber: number | undefined;
      if (exerciseReps.trim()) {
        repsNumber = Number(exerciseReps);
        if (!repsNumber || repsNumber <= 0) {
          setExerciseGoalError(t("Hedef tekrar sayısı sıfırdan büyük olmalı.", "Target reps must be greater than zero."));
          return;
        }
      }
      payload = {
        exercise_name: exerciseName.trim(),
        target_weight_kg: targetNumber,
        target_reps: repsNumber,
        exercise_catalog_id: exerciseCatalogId ?? undefined,
      };
    }

    await submitExerciseGoal(async () => {
      await setExerciseGoal(token, payload);
      setExerciseName("");
      setExerciseTarget("");
      setExerciseReps("");
      setExerciseDuration("");
      setExerciseCatalogId(null);
      setExerciseCategory(null);
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
          <WeeklyGoalCard />

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Günlük Beslenme Hedefleri", "Daily Nutrition Goals")}
            </h2>
            {recommendation ? (
              <div className="mb-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] p-4 text-sm">
                <p className="mb-1 flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
                  <Sparkles className="h-4 w-4" />
                  {t("Sana Özel Öneri", "Your Suggested Goals")}
                </p>
                {recommendation.available ? (
                  <>
                    <p className="text-zinc-700 dark:text-zinc-200">
                      <span className="text-lg font-semibold">{recommendation.calories} kcal</span>
                      {" · "}
                      {t("Protein", "Protein")} {recommendation.protein_g} g · {t("Karbonhidrat", "Carbs")} {recommendation.carbs_g} g ·{" "}
                      {t("Yağ", "Fat")} {recommendation.fat_g} g
                    </p>
                    <p className="mt-1 text-zinc-500">
                      {t(
                        `${recommendation.weight_kg} kg · ${recommendation.height_cm} cm · ${recommendation.age} yaş; harcama ~${recommendation.tdee} kcal, ayar ${recommendation.adjustment_kcal} kcal. Mifflin-St Jeor tahmini - hamilelik, emzirme ya da bir sağlık durumun varsa bir uzmana danış.`,
                        `${recommendation.weight_kg} kg · ${recommendation.height_cm} cm · age ${recommendation.age}; expenditure ~${recommendation.tdee} kcal, adjustment ${recommendation.adjustment_kcal} kcal. Mifflin-St Jeor estimate - if you're pregnant, breastfeeding or have a health condition, check with a professional.`
                      )}
                    </p>
                    <SecondaryButton type="button" className="mt-3" onClick={() => applyRecommendation(recommendation)}>
                      {t("Alanlara Doldur", "Fill In the Fields")}
                    </SecondaryButton>
                  </>
                ) : (
                  <p className="text-zinc-500">
                    {t("Öneri için eksik: ", "To suggest goals we still need: ")}
                    {recommendation.missing.map((m) => MISSING_LABELS[m]).join(", ")}.{" "}
                    <Link
                      href={recommendation.missing.length === 1 && recommendation.missing[0] === "weight" ? "/progress" : "/profile"}
                      className="font-medium underline"
                    >
                      {recommendation.missing.length === 1 && recommendation.missing[0] === "weight"
                        ? t("Kilonu kaydet", "Log your weight")
                        : t("Profilde tamamla", "Complete in Profile")}
                    </Link>
                  </p>
                )}
              </div>
            ) : null}
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
                className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-[2fr,1fr,1fr,auto] sm:items-end"
              >
                <div>
                  <Label>{t("Egzersiz", "Exercise")}</Label>
                  <ExerciseSearchField
                    value={exerciseName}
                    onChange={(value) => {
                      setExerciseName(value);
                      // Katalogdan yeniden seçilene kadar kategori bilinmiyor -
                      // serbest yazarken önceki seçimin kategorisine güvenip
                      // yanlış form (ör. süre yerine kg) göstermeyelim.
                      setExerciseCatalogId(null);
                      setExerciseCategory(null);
                    }}
                    onSelectItem={(item: ExerciseCatalogItem) => {
                      setExerciseCatalogId(item.id);
                      setExerciseCategory(item.category_tr);
                    }}
                  />
                </div>
                {isDurationGoal ? (
                  <div>
                    <Label htmlFor="exerciseDuration">{t("Hedef Süre (dakika)", "Target Duration (min)")}</Label>
                    <TextInput
                      id="exerciseDuration"
                      type="number"
                      min={0}
                      step={5}
                      value={exerciseDuration}
                      onChange={(e) => setExerciseDuration(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
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
                    <div>
                      <Label htmlFor="exerciseReps">{t("Hedef Tekrar (opsiyonel)", "Target Reps (optional)")}</Label>
                      <TextInput
                        id="exerciseReps"
                        type="number"
                        min={0}
                        step={1}
                        placeholder={t("opsiyonel", "optional")}
                        value={exerciseReps}
                        onChange={(e) => setExerciseReps(e.target.value)}
                      />
                    </div>
                  </>
                )}
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
