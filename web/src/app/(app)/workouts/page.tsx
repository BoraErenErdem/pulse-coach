"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Dumbbell, ListChecks, Plus, Save, Trash2, Weight } from "lucide-react";
import {
  ApiError,
  WORKOUT_TYPES,
  getExerciseGoals,
  getWorkoutSessions,
  getWorkoutSummary,
  logWorkoutSession,
  searchExercises,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
  type WorkoutSession,
  type WorkoutSetInput,
  type WorkoutSummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  ErrorBanner,
  GoalMeter,
  InfoBanner,
  Label,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { WorkoutVolumeChart } from "@/components/charts/WorkoutVolumeChart";

const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  kuvvet: "Kuvvet",
  kardiyo: "Kardiyo",
  esneklik: "Esneklik",
  karışık: "Karışık",
};

export default function WorkoutsPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  const [exerciseName, setExerciseName] = useState("");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [pendingSets, setPendingSets] = useState<WorkoutSetInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, sessionsData, exerciseGoalsData] = await Promise.all([
        getWorkoutSummary(token, 7),
        getWorkoutSessions(token, 90),
        getExerciseGoals(token),
      ]);
      setSummary(summaryData);
      setSessions(sessionsData);
      setExerciseGoals(exerciseGoalsData);
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

  function handleAddSet() {
    setFormError(null);
    if (!exerciseName.trim()) {
      setFormError("Egzersiz adı girmelisin.");
      return;
    }
    const repsNumber = Number(reps);
    if (!repsNumber || repsNumber <= 0) {
      setFormError("Tekrar sayısı sıfırdan büyük olmalı.");
      return;
    }
    setPendingSets((prev) => [
      ...prev,
      {
        exercise_name: exerciseName.trim(),
        reps: repsNumber,
        weight_kg: weight ? Number(weight) : undefined,
      },
    ]);
    setReps("10");
    setWeight("");
  }

  function handleRemoveSet(index: number) {
    setPendingSets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (pendingSets.length === 0) {
      setFormError("Kaydetmeden önce en az bir set eklemelisin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await logWorkoutSession(token, { workout_type: workoutType, sets: pendingSets });
      setFormSuccess("Antrenman kaydedildi!");
      setPendingSets([]);
      setExerciseName("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Antrenman</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Bu Hafta Oturum"
            value={String(summary?.session_count ?? 0)}
            icon={<Dumbbell className="h-4 w-4" />}
            seriesVar="--series-2"
          />
          <StatTile
            label="Bu Hafta Set"
            value={String(summary?.total_sets ?? 0)}
            icon={<ListChecks className="h-4 w-4" />}
            seriesVar="--series-3"
          />
          <StatTile
            label="Toplam Hacim"
            value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`}
            icon={<Weight className="h-4 w-4" />}
            seriesVar="--series-1"
          />
        </div>
      )}

      {!isLoading && summary ? (
        summary.session_count > 0 ? (
          <InfoBanner message={summary.summary_text} />
        ) : (
          <InfoBanner message="Henüz bu hafta bir antrenman kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin." />
        )
      ) : null}

      {!isLoading && exerciseGoals.length > 0 ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Egzersiz Hedefleri
          </h2>
          <div className="space-y-4">
            {exerciseGoals.map((eg) => (
              <GoalMeter
                key={eg.id}
                label={eg.exercise_name}
                value={eg.best_weight_kg ?? 0}
                goal={eg.target_weight_kg}
                unit="kg"
                seriesVar="--series-2"
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Antrenman Kaydet
        </h2>
        <div className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div>
            <Label htmlFor="workoutType">Antrenman Türü</Label>
            <select
              id="workoutType"
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WORKOUT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr,1fr,1fr,auto] sm:items-end">
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
              <Label htmlFor="reps">Tekrar</Label>
              <TextInput
                id="reps"
                type="number"
                min={1}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="weight">Kilo (kg)</Label>
              <TextInput
                id="weight"
                type="number"
                min={0}
                step={0.5}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="opsiyonel"
              />
            </div>
            <SecondaryButton type="button" onClick={handleAddSet}>
              <Plus className="h-4 w-4" />
              Set Ekle
            </SecondaryButton>
          </div>

          {pendingSets.length > 0 ? (
            <div className="animate-fade-in-up space-y-2">
              {pendingSets.map((set, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="text-zinc-800 dark:text-zinc-100">
                    {set.exercise_name} — {set.reps} tekrar
                    {set.weight_kg ? `, ${set.weight_kg} kg` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSet(index)}
                    className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Seti kaldır"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <PrimaryButton type="submit" disabled={isSubmitting || pendingSets.length === 0}>
              <Save className="h-4 w-4" />
              {isSubmitting ? "Kaydediliyor..." : "Oturumu Kaydet"}
            </PrimaryButton>
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Ağırlık Hacmi Trendi
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutVolumeChart sessions={sessions} />}
      </Card>
    </div>
  );
}
