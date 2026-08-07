"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Dumbbell, Flame, ListChecks, PartyPopper, Pencil, Plus, Save, Trash2, Trophy, Weight, X } from "lucide-react";
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
  getWorkoutSessions,
  getWorkoutSummary,
  logWorkoutSession,
  searchExercises,
  updateWorkoutSession,
  updateWorkoutSet,
  type CardioCategory,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
  type Intensity,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutSetInput,
  type WorkoutSummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  EmptyState,
  ErrorBanner,
  GoalMeter,
  InfoBanner,
  Label,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Select,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { WorkoutTypeChart } from "@/components/charts/WorkoutTypeChart";
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
  // Antrenman türü kardiyo/esneklik ise set bazında süre+yoğunluk sorulur,
  // kuvvet/karışık'ta tekrar+kilo (2026-08-06, kullanıcı isteği - mobil
  // ile aynı desen). Kalori tahmini backend'de MET yöntemiyle hesaplanıyor.
  const isDurationMode = workoutType === "kardiyo" || workoutType === "esneklik";
  const [exerciseName, setExerciseName] = useState("");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("30");
  const [intensity, setIntensity] = useState<Intensity>("orta");
  const [cardioCategory, setCardioCategory] = useState<CardioCategory>("kosu");
  const [pendingSets, setPendingSets] = useState<WorkoutSetInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editIntensity, setEditIntensity] = useState<Intensity>("orta");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editSessionType, setEditSessionType] = useState<WorkoutType>("kuvvet");
  const [editSessionNote, setEditSessionNote] = useState("");

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

    if (isDurationMode) {
      const durationNumber = Number(duration);
      if (!durationNumber || durationNumber <= 0) {
        setFormError("Süre sıfırdan büyük olmalı.");
        return;
      }
      const category: CardioCategory = workoutType === "esneklik" ? "esneklik" : cardioCategory;
      setPendingSets((prev) => [
        ...prev,
        {
          exercise_name: exerciseName.trim(),
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

  function replaceSession(updated: WorkoutSession) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDeleteSession(sessionId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteWorkoutSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : "Silinemedi, tekrar dener misin?");
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
      setHistoryError(err instanceof ApiError ? err.message : "Güncellenemedi, tekrar dener misin?");
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
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : "Güncellenemedi, tekrar dener misin?");
    }
  }

  async function handleDeleteSet(sessionId: number, setId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await deleteWorkoutSet(token, sessionId, setId);
      replaceSession(updated);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : "Silinemedi, tekrar dener misin?");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Antrenman</h1>

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
          {summary && summary.total_calories_burned > 0 ? (
            <StatTile
              label="Yakılan Kalori"
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
              <div key={eg.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <GoalMeter
                    label={eg.exercise_name}
                    value={eg.best_weight_kg ?? 0}
                    goal={eg.target_weight_kg}
                    unit="kg"
                    seriesVar="--series-2"
                  />
                </div>
                {eg.progress_pct >= 100 ? (
                  <PartyPopper
                    className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-label="Hedefe ulaşıldı"
                  />
                ) : null}
              </div>
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
            <Select
              id="workoutType"
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WORKOUT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>

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

          {isDurationMode ? (
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,1fr,auto] sm:items-end">
              {workoutType === "kardiyo" ? (
                <div>
                  <Label htmlFor="cardioCategory">Kardiyo Türü</Label>
                  <Select
                    id="cardioCategory"
                    value={cardioCategory}
                    onChange={(e) => setCardioCategory(e.target.value as CardioCategory)}
                  >
                    {CARDIO_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CARDIO_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div>
                <Label htmlFor="duration">Süre (dakika)</Label>
                <TextInput
                  id="duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="intensity">Yoğunluk</Label>
                <Select
                  id="intensity"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value as Intensity)}
                >
                  {INTENSITIES.map((level) => (
                    <option key={level} value={level}>
                      {INTENSITY_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </div>
              <SecondaryButton type="button" onClick={handleAddSet}>
                <Plus className="h-4 w-4" />
                Set Ekle
              </SecondaryButton>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
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
                      ? `${set.exercise_name} — ${set.duration_minutes} dk${
                          set.intensity ? ` (${INTENSITY_LABELS[set.intensity]})` : ""
                        }`
                      : `${set.exercise_name} — ${set.reps} tekrar${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
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

          <form onSubmit={handleSubmit} className="flex flex-col items-start gap-1.5">
            <PrimaryButton type="submit" disabled={isSubmitting || pendingSets.length === 0}>
              <Save className="h-4 w-4" />
              {isSubmitting ? "Kaydediliyor..." : "Oturumu Kaydet"}
            </PrimaryButton>
            {pendingSets.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Kaydetmeden önce en az bir set eklemelisin — yukarıdaki &quot;Set Ekle&quot;yi kullan.
              </p>
            ) : null}
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Geçmiş Kayıtlar
        </h2>
        {historyError ? <ErrorBanner message={historyError} /> : null}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Dumbbell className="h-8 w-8" />}
            message="Henüz bir antrenman kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin."
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
                      <Label htmlFor={`session-type-${session.id}`}>Tür</Label>
                      <Select
                        id={`session-type-${session.id}`}
                        value={editSessionType}
                        onChange={(e) => setEditSessionType(e.target.value as WorkoutType)}
                      >
                        {WORKOUT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {WORKOUT_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`session-note-${session.id}`}>Not</Label>
                      <TextInput
                        id={`session-note-${session.id}`}
                        value={editSessionNote}
                        onChange={(e) => setEditSessionNote(e.target.value)}
                        placeholder="opsiyonel"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSession(session.id)}
                      className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                      aria-label="Kaydet"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSessionId(null)}
                      className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Vazgeç"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {session.session_date}
                      {session.workout_type ? ` — ${WORKOUT_TYPE_LABELS[session.workout_type as WorkoutType] ?? session.workout_type}` : ""}
                      {session.note ? ` (${session.note})` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditSession(session)}
                        className="text-zinc-400 transition-colors hover:text-accent"
                        aria-label="Oturumu düzenle"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.id)}
                        className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Oturumu sil"
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
                                <span className="text-xs text-zinc-500">dk</span>
                                <Select
                                  value={editIntensity}
                                  onChange={(e) => setEditIntensity(e.target.value as Intensity)}
                                  className="w-24"
                                >
                                  {INTENSITIES.map((level) => (
                                    <option key={level} value={level}>
                                      {INTENSITY_LABELS[level]}
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
                                <span className="text-xs text-zinc-500">tekrar</span>
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
                              aria-label="Kaydet"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSetId(null)}
                              className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                              aria-label="Vazgeç"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200">
                              {isDurationSet
                                ? `${set.exercise_name_snapshot} — ${set.duration_minutes} dk${
                                    set.intensity ? ` (${INTENSITY_LABELS[set.intensity]})` : ""
                                  }${set.estimated_calories ? ` — ~${set.estimated_calories.toFixed(0)} kcal` : ""}`
                                : `${set.exercise_name_snapshot} — ${set.reps} tekrar${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                              {set.is_personal_record ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                                  title="Yeni kişisel rekor"
                                >
                                  <Trophy className="h-3 w-3" />
                                  Rekor
                                </span>
                              ) : null}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditSet(set)}
                                className="text-zinc-400 transition-colors hover:text-accent"
                                aria-label="Seti düzenle"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSet(session.id, set.id)}
                                className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                                aria-label="Seti sil"
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
          Antrenman Türü Dağılımı
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutTypeChart sessions={sessions} />}
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
