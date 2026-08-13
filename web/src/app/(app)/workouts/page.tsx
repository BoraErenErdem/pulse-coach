"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, ChevronRight, Dumbbell, Flame, ListChecks, Pencil, Plus, Save, Trash2, Trophy, Weight, X } from "lucide-react";
import {
  ApiError,
  CARDIO_CATEGORIES,
  CARDIO_CATEGORY_LABELS,
  INTENSITIES,
  INTENSITY_LABELS,
  WORKOUT_TYPES,
  deleteWorkoutSession,
  deleteWorkoutSet,
  getExerciseGoals,
  getLoggedExercises,
  getWorkoutSessions,
  getWorkoutSummary,
  logWorkoutSession,
  updateWorkoutSession,
  updateWorkoutSet,
  type CardioCategory,
  type ExerciseGoalProgress,
  type Intensity,
  type LoggedExercise,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutSetInput,
  type WorkoutSummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import {
  Card,
  EmptyState,
  ErrorBanner,
  ExerciseGoalsList,
  InfoBanner,
  Label,
  PrimaryButton,
  SecondaryButton,
  Select,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { WorkoutTypeChart } from "@/components/charts/WorkoutTypeChart";
import { WorkoutVolumeChart } from "@/components/charts/WorkoutVolumeChart";
import { WORKOUT_TYPE_LABELS } from "@/lib/labels";

export default function WorkoutsPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  // Antrenman türü kardiyo/esneklik ise set bazında süre+yoğunluk sorulur,
  // kuvvet/karışık'ta tekrar+kilo (2026-08-06, kullanıcı isteği - mobil
  // ile aynı desen). Kalori tahmini backend'de MET yöntemiyle hesaplanıyor.
  const isDurationMode = workoutType === "kardiyo" || workoutType === "esneklik";
  const [exerciseName, setExerciseName] = useState("");
  // ExerciseSearchField'den bir katalog kaydı seçilince dolar - bkz.
  // mobile/app/(tabs)/workouts.tsx'teki aynı değişikliğin yorumu
  // (2026-08-11 kullanıcı bulgusu: dil değiştirince hedef ilerlemesi
  // kopuyordu, çünkü set kaydı hiç katalog ID'si göndermiyordu).
  const [exerciseCatalogId, setExerciseCatalogId] = useState<number | undefined>(undefined);
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("30");
  const [intensity, setIntensity] = useState<Intensity>("orta");
  const [cardioCategory, setCardioCategory] = useState<CardioCategory>("kosu");
  const [pendingSets, setPendingSets] = useState<WorkoutSetInput[]>([]);
  const {
    isSubmitting,
    error: formError,
    success: formSuccess,
    setError: setFormError,
    setSuccess: setFormSuccess,
    resetMessages: resetFormMessages,
    submit,
  } = useFormSubmit();

  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editIntensity, setEditIntensity] = useState<Intensity>("orta");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editSessionType, setEditSessionType] = useState<WorkoutType>("kuvvet");
  const [editSessionNote, setEditSessionNote] = useState("");

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const [summaryData, sessionsData, exerciseGoalsData, loggedExercisesData] = await Promise.all([
      getWorkoutSummary(token, 7),
      getWorkoutSessions(token, 90),
      getExerciseGoals(token),
      getLoggedExercises(token),
    ]);
    setSummary(summaryData);
    setSessions(sessionsData);
    setExerciseGoals(exerciseGoalsData);
    setLoggedExercises(loggedExercisesData);
  }, [token]);

  function handleAddSet() {
    setFormError(null);
    if (!exerciseName.trim()) {
      setFormError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }

    if (isDurationMode) {
      const durationNumber = Number(duration);
      if (!durationNumber || durationNumber <= 0) {
        setFormError(t("Süre sıfırdan büyük olmalı.", "Duration must be greater than zero."));
        return;
      }
      const category: CardioCategory = workoutType === "esneklik" ? "esneklik" : cardioCategory;
      setPendingSets((prev) => [
        ...prev,
        {
          exercise_name: exerciseName.trim(),
          exercise_catalog_id: exerciseCatalogId,
          duration_minutes: durationNumber,
          intensity,
          cardio_category: category,
        },
      ]);
      setDuration("30");
      return;
    }

    const repsNumber = Number(reps);
    if (!repsNumber || repsNumber <= 0) {
      setFormError(t("Tekrar sayısı sıfırdan büyük olmalı.", "Rep count must be greater than zero."));
      return;
    }
    setPendingSets((prev) => [
      ...prev,
      {
        exercise_name: exerciseName.trim(),
        exercise_catalog_id: exerciseCatalogId,
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
    resetFormMessages();

    if (pendingSets.length === 0) {
      setFormError(t("Kaydetmeden önce en az bir set eklemelisin.", "You need to add at least one set before saving."));
      return;
    }

    await submit(async () => {
      await logWorkoutSession(token, { workout_type: workoutType, sets: pendingSets });
      setFormSuccess(t("Antrenman kaydedildi!", "Workout saved!"));
      setPendingSets([]);
      setExerciseName("");
      setExerciseCatalogId(undefined);
      await loadData();
    });
  }

  function replaceSession(updated: WorkoutSession) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  // 2026-08-12 canlı testte bulundu: bir seti düzenleyip/silip sadece
  // replaceSession() çağırmak "Egzersiz Hedefleri" kartını (ve haftalık
  // Toplam Hacim/kalori stat'larını) GÜNCELLEMİYORDU - set kaydı değişmiş
  // olsa bile (ör. ağırlık artışı yeni bir hedefe ulaşabilir/rekor
  // değişebilir) kart sayfa yenilenene kadar eski değeri gösteriyordu.
  // handleDeleteSession zaten tam loadData() çağırdığı için bu sorunu
  // yaşamıyordu - set bazlı işlemler (handleSaveSet/handleDeleteSet) de
  // aynı türetilmiş verileri tazelemeli, ama sessions'ı TEKRAR çekmeye
  // gerek yok (replaceSession zaten güncel session'ı yerel state'e koydu).
  async function refreshDerivedStats() {
    if (!token) return;
    const [summaryData, exerciseGoalsData] = await Promise.all([
      getWorkoutSummary(token, 7),
      getExerciseGoals(token),
    ]);
    setSummary(summaryData);
    setExerciseGoals(exerciseGoalsData);
  }

  async function handleDeleteSession(sessionId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteWorkoutSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  function handleStartEditSession(session: WorkoutSession) {
    setEditingSessionId(session.id);
    setEditSessionType((session.workout_type as WorkoutType) ?? "kuvvet");
    setEditSessionNote(session.note ?? "");
  }

  async function handleSaveSession(sessionId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await updateWorkoutSession(token, sessionId, {
        workout_type: editSessionType,
        note: editSessionNote,
      });
      replaceSession(updated);
      setEditingSessionId(null);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  function handleStartEditSet(set: WorkoutSet) {
    setEditingSetId(set.id);
    if (set.duration_minutes != null) {
      setEditDuration(String(set.duration_minutes));
      setEditIntensity(set.intensity ?? "orta");
    } else {
      setEditReps(set.reps != null ? String(set.reps) : "");
      setEditWeight(set.weight_kg != null ? String(set.weight_kg) : "");
    }
  }

  async function handleSaveSet(sessionId: number, setId: number, isDurationSet: boolean) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = isDurationSet
        ? await updateWorkoutSet(token, sessionId, setId, {
            duration_minutes: Number(editDuration),
            intensity: editIntensity,
          })
        : await updateWorkoutSet(token, sessionId, setId, {
            reps: Number(editReps),
            weight_kg: editWeight ? Number(editWeight) : undefined,
          });
      replaceSession(updated);
      setEditingSetId(null);
      await refreshDerivedStats();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  async function handleDeleteSet(sessionId: number, setId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await deleteWorkoutSet(token, sessionId, setId);
      replaceSession(updated);
      await refreshDerivedStats();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Antrenman", "Workouts")}</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3">
          <StatTile
            label={t("Bu Hafta Oturum", "Sessions This Week")}
            value={String(summary?.session_count ?? 0)}
            icon={<Dumbbell className="h-4 w-4" />}
            seriesVar="--series-2"
          />
          <StatTile
            label={t("Bu Hafta Set", "Sets This Week")}
            value={String(summary?.total_sets ?? 0)}
            icon={<ListChecks className="h-4 w-4" />}
            seriesVar="--series-3"
          />
          <StatTile
            label={t("Toplam Hacim", "Total Volume")}
            value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`}
            icon={<Weight className="h-4 w-4" />}
            seriesVar="--series-1"
          />
          {summary && summary.total_calories_burned > 0 ? (
            <StatTile
              label={t("Yakılan Kalori", "Calories Burned")}
              value={`~${summary.total_calories_burned.toFixed(0)} kcal`}
              icon={<Flame className="h-4 w-4" />}
              seriesVar="--series-5"
            />
          ) : null}
        </div>
      )}

      {!isLoading && summary ? (
        summary.session_count > 0 ? (
          <InfoBanner message={summary.summary_text} />
        ) : (
          <InfoBanner
            message={t(
              "Henüz bu hafta bir antrenman kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
              "No workout logged this week yet. You can add your first entry using the form below."
            )}
          />
        )
      ) : null}

      {!isLoading && exerciseGoals.length > 0 ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Egzersiz Hedefleri", "Exercise Goals")}
          </h2>
          <ExerciseGoalsList goals={exerciseGoals} />
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Antrenman Kaydet", "Log Workout")}
        </h2>
        <div className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div>
            <Label htmlFor="workoutType">{t("Antrenman Türü", "Workout Type")}</Label>
            <Select
              id="workoutType"
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WORKOUT_TYPE_LABELS[language][type]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>{t("Egzersiz", "Exercise")}</Label>
            <ExerciseSearchField
              value={exerciseName}
              onChange={(name) => {
                setExerciseName(name);
                setExerciseCatalogId(undefined);
              }}
              onSelectItem={(item) => setExerciseCatalogId(item.id)}
            />
          </div>

          {isDurationMode ? (
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,1fr,auto] sm:items-end">
              {workoutType === "kardiyo" ? (
                <div>
                  <Label htmlFor="cardioCategory">{t("Kardiyo Türü", "Cardio Type")}</Label>
                  <Select
                    id="cardioCategory"
                    value={cardioCategory}
                    onChange={(e) => setCardioCategory(e.target.value as CardioCategory)}
                  >
                    {CARDIO_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CARDIO_CATEGORY_LABELS[language][category]}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div>
                <Label htmlFor="duration">{t("Süre (dakika)", "Duration (minutes)")}</Label>
                <TextInput
                  id="duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="intensity">{t("Yoğunluk", "Intensity")}</Label>
                <Select
                  id="intensity"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value as Intensity)}
                >
                  {INTENSITIES.map((level) => (
                    <option key={level} value={level}>
                      {INTENSITY_LABELS[language][level]}
                    </option>
                  ))}
                </Select>
              </div>
              <SecondaryButton type="button" onClick={handleAddSet}>
                <Plus className="h-4 w-4" />
                {t("Set Ekle", "Add Set")}
              </SecondaryButton>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
              <div>
                <Label htmlFor="reps">{t("Tekrar", "Reps")}</Label>
                <TextInput
                  id="reps"
                  type="number"
                  min={1}
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="weight">{t("Kilo (kg)", "Weight (kg)")}</Label>
                <TextInput
                  id="weight"
                  type="number"
                  min={0}
                  step={0.5}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder={t("opsiyonel", "optional")}
                />
              </div>
              <SecondaryButton type="button" onClick={handleAddSet}>
                <Plus className="h-4 w-4" />
                {t("Set Ekle", "Add Set")}
              </SecondaryButton>
            </div>
          )}

          {pendingSets.length > 0 ? (
            <div className="animate-fade-in-up space-y-2">
              {pendingSets.map((set, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                >
                  <span className="text-zinc-800 dark:text-zinc-100">
                    {set.duration_minutes != null
                      ? `${set.exercise_name} — ${set.duration_minutes} ${t("dk", "min")}${
                          set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                        }`
                      : `${set.exercise_name} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSet(index)}
                    className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                    aria-label={t("Seti kaldır", "Remove set")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col items-start gap-1.5">
            <PrimaryButton type="submit" disabled={isSubmitting || pendingSets.length === 0}>
              <Save className="h-4 w-4" />
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Oturumu Kaydet", "Save Session")}
            </PrimaryButton>
            {pendingSets.length === 0 ? (
              <p className="text-xs text-zinc-500">
                {t(
                  'Kaydetmeden önce en az bir set eklemelisin — yukarıdaki "Set Ekle"yi kullan.',
                  'You need to add at least one set before saving — use "Add Set" above.'
                )}
              </p>
            ) : null}
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Egzersizlerim", "My Exercises")}
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          {t(
            "Bir egzersize dokunarak haftalık/aylık ilerlemeni kendi geçmişinle kıyasla.",
            "Tap an exercise to compare your weekly/monthly progress against your own history."
          )}
        </p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : loggedExercises.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            message={t(
              "Henüz bir egzersiz loglamadın. İlk setini kaydedince burada listelenecek.",
              "You haven't logged an exercise yet. It'll appear here once you log your first set."
            )}
          />
        ) : (
          <div className="space-y-1.5">
            {loggedExercises.map((exercise) => (
              <Link
                key={exercise.exercise_name}
                href={`/workouts/${encodeURIComponent(exercise.exercise_name)}`}
                className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm transition-colors hover:border-accent/40"
              >
                <span className="text-zinc-800 dark:text-zinc-100">{exercise.exercise_name}</span>
                <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                  {t(`${exercise.set_count} set`, `${exercise.set_count} sets`)}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Geçmiş Kayıtlar", "History")}
        </h2>
        {historyError ? <ErrorBanner message={historyError} /> : null}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Dumbbell className="h-8 w-8" />}
            message={t(
              "Henüz bir antrenman kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
              "No workout logged yet. You can add your first entry using the form above."
            )}
          />
        ) : (
          <div className="space-y-4">
            {[...sessions].reverse().map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3"
              >
                {editingSessionId === session.id ? (
                  <div className="mb-2 flex flex-wrap items-end gap-2">
                    <div>
                      <Label htmlFor={`session-type-${session.id}`}>{t("Tür", "Type")}</Label>
                      <Select
                        id={`session-type-${session.id}`}
                        value={editSessionType}
                        onChange={(e) => setEditSessionType(e.target.value as WorkoutType)}
                      >
                        {WORKOUT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {WORKOUT_TYPE_LABELS[language][type]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`session-note-${session.id}`}>{t("Not", "Note")}</Label>
                      <TextInput
                        id={`session-note-${session.id}`}
                        value={editSessionNote}
                        onChange={(e) => setEditSessionNote(e.target.value)}
                        placeholder={t("opsiyonel", "optional")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSession(session.id)}
                      className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                      aria-label={t("Kaydet", "Save")}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSessionId(null)}
                      className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      aria-label={t("Vazgeç", "Cancel")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {session.session_date}
                      {session.workout_type ? ` — ${WORKOUT_TYPE_LABELS[language][session.workout_type as WorkoutType] ?? session.workout_type}` : ""}
                      {session.note ? ` (${session.note})` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditSession(session)}
                        className="text-zinc-400 transition-colors hover:text-accent"
                        aria-label={t("Oturumu düzenle", "Edit session")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.id)}
                        className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        aria-label={t("Oturumu sil", "Delete session")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {session.sets.map((set) => {
                    const isDurationSet = set.duration_minutes != null;
                    return (
                      <div
                        key={set.id}
                        className="flex items-center justify-between rounded-md bg-[var(--surface)] px-2.5 py-1.5 text-sm"
                      >
                        {editingSetId === set.id ? (
                          <div className="flex flex-1 items-center gap-2">
                            <span className="text-zinc-600 dark:text-zinc-300">{set.exercise_name_snapshot}</span>
                            {isDurationSet ? (
                              <>
                                <TextInput
                                  type="number"
                                  min={1}
                                  value={editDuration}
                                  onChange={(e) => setEditDuration(e.target.value)}
                                  className="w-16"
                                />
                                <span className="text-xs text-zinc-500">{t("dk", "min")}</span>
                                <Select
                                  value={editIntensity}
                                  onChange={(e) => setEditIntensity(e.target.value as Intensity)}
                                  className="w-24"
                                >
                                  {INTENSITIES.map((level) => (
                                    <option key={level} value={level}>
                                      {INTENSITY_LABELS[language][level]}
                                    </option>
                                  ))}
                                </Select>
                              </>
                            ) : (
                              <>
                                <TextInput
                                  type="number"
                                  min={1}
                                  value={editReps}
                                  onChange={(e) => setEditReps(e.target.value)}
                                  className="w-16"
                                />
                                <span className="text-xs text-zinc-500">{t("tekrar", "reps")}</span>
                                <TextInput
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={editWeight}
                                  onChange={(e) => setEditWeight(e.target.value)}
                                  className="w-20"
                                  placeholder="kg"
                                />
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSaveSet(session.id, set.id, isDurationSet)}
                              className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                              aria-label={t("Kaydet", "Save")}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSetId(null)}
                              className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                              aria-label={t("Vazgeç", "Cancel")}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200">
                              {isDurationSet
                                ? `${set.exercise_name_snapshot} — ${set.duration_minutes} ${t("dk", "min")}${
                                    set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                                  }${set.estimated_calories ? ` — ~${set.estimated_calories.toFixed(0)} kcal` : ""}`
                                : `${set.exercise_name_snapshot} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                              {set.is_personal_record ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                                  title={t("Yeni kişisel rekor", "New personal record")}
                                >
                                  <Trophy className="h-3 w-3" />
                                  {t("Rekor", "Record")}
                                </span>
                              ) : null}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditSet(set)}
                                className="text-zinc-400 transition-colors hover:text-accent"
                                aria-label={t("Seti düzenle", "Edit set")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSet(session.id, set.id)}
                                className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                                aria-label={t("Seti sil", "Delete set")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Antrenman Türü Dağılımı", "Workout Type Distribution")}
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutTypeChart sessions={sessions} />}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Ağırlık Hacmi Trendi", "Weight Volume Trend")}
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutVolumeChart sessions={sessions} />}
      </Card>
    </div>
  );
}
