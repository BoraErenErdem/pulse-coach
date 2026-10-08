"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, ChevronRight, Dumbbell, Flame, ListChecks, Pencil, Plus, Save, Target, Trash2, Trophy, Weight, X } from "lucide-react";
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
import { groupEntriesByDate } from "@/lib/date-grouping";
import { exerciseDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import {
  Card,
  FormCard,
  EmptyState,
  ErrorBanner,
  ExerciseGoalsList,
  IconButton,
  InfoBanner,
  InsightCard,
  Label,
  PrimaryButton,
  SecondaryButton,
  Select,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { WorkoutTypeChart, WorkoutVolumeChart } from "@/components/charts/workout-charts";
import { WORKOUT_TYPE_LABELS } from "@/lib/labels";
import { toLocaleUpper } from "@/lib/format";
import { WeeklyGoalPanel } from "@/components/WeeklyGoalCard";
import { EditorPanel, ExerciseGoalForm } from "@/components/ExerciseGoalForm";
import { ChipSelect, Stepper, WORKOUT_TYPE_CHIP_COLORS } from "@/components/form-controls";

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme + gün başlıklarına gruplama (Progress sayfasıyla AYNI desen).
// Progress'ten (20) FARKLI OLARAK burada 10 - kullanıcı canlı telefon
// testinde antrenman/beslenme sayfalarının 20 ile bile aşırı uzadığını
// belirtti (aynı gün oturum sayısı kilo kaydından daha az olsa da, her
// oturumun İÇİNDE birden fazla set olduğu için görsel yoğunluk daha
// yüksek - bkz. aşağıdaki SET_DISPLAY_LIMIT).
const HISTORY_PAGE_SIZE = 10;
// Tek bir oturumda çok sayıda set olması (ör. aynı egzersizi 15+ kez
// farklı ağırlıkla denemiş bir kullanıcı) sayfa uzunluğunu HISTORY_PAGE_
// SIZE'dan bağımsız olarak şişirebiliyordu - oturum sayısını sınırlamak
// tek başına yetmiyordu. Backend'e dokunmadan (oturum gruplaması/
// düzenleme-silme UX'i aynen korunuyor), her oturum kartı İÇİNDE set
// sayısı bunu aşarsa yerel bir "X set daha göster" genişletmesi devreye
// giriyor (kullanıcı onayladı, 2026-08-14).
const SET_DISPLAY_LIMIT = 10;
// "Egzersizlerim" listesi kayıt değil, egzersiz TÜRÜ bazında tekilleştirilmiş
// bir liste - doğası gereği "Geçmiş Kayıtlar"dan çok daha yavaş büyür (yeni
// antrenman genelde MEVCUT türleri tekrarlar). Somut bir şişme sorunu yoktu,
// ama kullanıcı diğer 4 ekranla tutarlılık için (uzun vadede 50+ farklı
// egzersiz birikirse diye önlem) aynı kademeli yükleme desenini istedi
// (2026-08-14).
const LOGGED_EXERCISES_PAGE_SIZE = 10;

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
  // Hangi oturum kartlarının SET_DISPLAY_LIMIT'i aşıp "tümünü göster"e
  // genişletildiği - bkz. SET_DISPLAY_LIMIT tanımı yukarıda.
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<number>>(new Set());

  function toggleExpandSession(sessionId: number) {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  // "Geçmiş Kayıtlar" listesi için BAĞIMSIZ, sayfalı bir veri akışı -
  // grafikleri besleyen `sessions`/`getWorkoutSessions(token, 90)`
  // çağrısından KASITLI OLARAK ayrı (2026-08-14, kullanıcı isteği: uzun
  // listeler görsel olarak bunaltıcıydı). `sessions`'ı limit'e çevirmek
  // WorkoutTypeChart/WorkoutVolumeChart'ın 90 günlük trendini kırardı.
  const [historyItems, setHistoryItems] = useState<WorkoutSession[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const [goalEditor, setGoalEditor] = useState<ExerciseGoalProgress | "new" | null>(null);
  const [typeRangeDays, setTypeRangeDays] = useState<30 | 90>(90);
  const [loggedExercisesOffset, setLoggedExercisesOffset] = useState(0);
  const [hasMoreLoggedExercises, setHasMoreLoggedExercises] = useState(false);
  const [isLoadingMoreLoggedExercises, setIsLoadingMoreLoggedExercises] = useState(false);

  async function loadHistoryPage(offset: number, replace: boolean) {
    if (!token) return;
    const page = await getWorkoutSessions(token, undefined, HISTORY_PAGE_SIZE, offset);
    const newestFirst = [...page].reverse();
    setHistoryItems((prev) => (replace ? newestFirst : [...prev, ...newestFirst]));
    setHasMoreHistory(page.length === HISTORY_PAGE_SIZE);
    setHistoryOffset(offset + page.length);
  }

  async function handleLoadMoreHistory() {
    setIsLoadingMoreHistory(true);
    try {
      await loadHistoryPage(historyOffset, false);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  async function loadLoggedExercisesPage(offset: number, replace: boolean) {
    if (!token) return;
    const page = await getLoggedExercises(token, LOGGED_EXERCISES_PAGE_SIZE, offset);
    setLoggedExercises((prev) => (replace ? page : [...prev, ...page]));
    setHasMoreLoggedExercises(page.length === LOGGED_EXERCISES_PAGE_SIZE);
    setLoggedExercisesOffset(offset + page.length);
  }

  async function handleLoadMoreLoggedExercises() {
    setIsLoadingMoreLoggedExercises(true);
    try {
      await loadLoggedExercisesPage(loggedExercisesOffset, false);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreLoggedExercises(false);
    }
  }

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const [summaryData, sessionsData, exerciseGoalsData] = await Promise.all([
      getWorkoutSummary(token, 7),
      getWorkoutSessions(token, 90),
      getExerciseGoals(token),
      loadLoggedExercisesPage(0, true),
      loadHistoryPage(0, true),
    ]);
    setSummary(summaryData);
    setSessions(sessionsData);
    setExerciseGoals(exerciseGoalsData);
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
    // historyItems'ı da güncelle - bu fonksiyon sadece bir session'ın
    // İÇERİĞİNİ değiştirir (tarih/kimlik değişmez), tam bir loadData()
    // reset'ine gerek yok (handleDeleteSession'ın aksine).
    setHistoryItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
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

  // Mobil "Antrenman Türü Dağılımı" aralığı (Son 30 / Son 90 gün); grafik verisi zaten 90 gün.
  const typeChartSessions = (() => {
    if (typeRangeDays === 90) return sessions;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 30);
    return sessions.filter((s) => new Date(`${s.session_date}T00:00:00`) >= cutoff);
  })();

  // Masaüstü düzeni (2026-10-08): mobil SIRASIYLA bantlar - 4 kutu tek satırda; haftalık hedef +
  // koç özeti + kayıt formu solda / egzersiz hedefleri sağda; iki grafik yan yana; Egzersizlerim
  // ve Geçmiş tam genişlik ızgara.
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Antrenman", "Workouts")}</h1>
      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[124px] rounded-[20px]" />
          ))}
        </div>
      ) : (
        // Kalori kutusu her zaman görünür (0 iken ~0 kcal): ızgara asimetrik kalmasın (2026-08-30).
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t("Son 7 Gün Oturum", "Sessions (7d)")} value={String(summary?.session_count ?? 0)} icon={<Dumbbell className="h-4 w-4" />} identity="sessions" />
          <StatTile label={t("Son 7 Gün Set", "Sets (7d)")} value={String(summary?.total_sets ?? 0)} icon={<ListChecks className="h-4 w-4" />} identity="sets" />
          <StatTile label={t("Toplam Hacim", "Total Volume")} value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`} icon={<Weight className="h-4 w-4" />} identity="volume" />
          <StatTile label={t("Kardiyo Kalorisi", "Cardio Calories")} value={`~${(summary?.total_calories_burned ?? 0).toFixed(0)} kcal`} icon={<Flame className="h-4 w-4" />} identity="calories" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {!isLoading ? <WeeklyGoalPanel refreshKey={`${summary?.session_count ?? 0}-${summary?.total_sets ?? 0}`} /> : null}

          {!isLoading && summary ? (
            summary.session_count > 0 ? (
              <InsightCard title={t("Son 7 Günün Antrenman Özeti", "Your Last 7 Days of Training")} message={summary.summary_text} />
            ) : (
              <InfoBanner
                message={t(
                  "Henüz bu hafta bir antrenman kaydı yok. Aşağıdaki \"Antrenman Kaydet\"e tıklayarak ilk kaydını ekleyebilirsin.",
                  "No workout logged this week yet. Click \"Log Workout\" below to add your first entry."
                )}
              />
            )
          ) : null}

          <FormCard title={t("Antrenman Kaydet", "Log Workout")}>
            <div className="space-y-4">
              {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
              {formError ? <ErrorBanner message={formError} /> : null}
              <div>
                <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Antrenman Türü", "Workout Type")}</p>
                <ChipSelect
                  label={t("Antrenman Türü", "Workout Type")}
                  options={WORKOUT_TYPES}
                  value={workoutType}
                  onChange={setWorkoutType}
                  labels={WORKOUT_TYPE_LABELS[language]}
                  colors={WORKOUT_TYPE_CHIP_COLORS}
                />
              </div>
              <div>
                <Label htmlFor="setExercise">{t("Egzersiz", "Exercise")}</Label>
                <ExerciseSearchField
                  id="setExercise"
                  value={exerciseName}
                  onChange={(name) => {
                    setExerciseName(name);
                    setExerciseCatalogId(undefined);
                  }}
                  onSelectItem={(item) => setExerciseCatalogId(item.id)}
                />
              </div>
              {isDurationMode ? (
                <>
                  {workoutType === "kardiyo" ? (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Kardiyo Türü", "Cardio Type")}</p>
                      <ChipSelect
                        label={t("Kardiyo Türü", "Cardio Type")}
                        options={CARDIO_CATEGORIES}
                        value={cardioCategory}
                        onChange={setCardioCategory}
                        labels={CARDIO_CATEGORY_LABELS[language]}
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="duration">{t("Süre (dakika)", "Duration (minutes)")}</Label>
                      <Stepper id="duration" value={duration} onChange={setDuration} step={5} min={0} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Yoğunluk", "Intensity")}</p>
                      <ChipSelect label={t("Yoğunluk", "Intensity")} options={INTENSITIES} value={intensity} onChange={setIntensity} labels={INTENSITY_LABELS[language]} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="reps">{t("Tekrar", "Reps")}</Label>
                    <Stepper id="reps" value={reps} onChange={setReps} step={1} min={0} />
                  </div>
                  <div>
                    <Label htmlFor="weight">{t("Kilo (kg)", "Weight (kg)")}</Label>
                    <Stepper id="weight" value={weight} onChange={setWeight} step={2.5} min={0} allowDecimal placeholder={t("opsiyonel", "optional")} />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleAddSet}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-[var(--id-workout)] text-sm font-semibold text-[var(--id-workout)] transition-colors hover:bg-[color-mix(in_srgb,var(--id-workout)_10%,transparent)]"
              >
                <Plus className="h-4 w-4" />
                {t("Sete Ekle", "Add Set")}
              </button>
              {pendingSets.length > 0 ? (
                <div className="animate-fade-in-up space-y-1.5">
                  {pendingSets.map((set, index) => (
                    <div key={index} className="flex items-center justify-between rounded-xl bg-[var(--pc-box)] py-1 pl-3 text-sm">
                      <span className="text-zinc-800 dark:text-zinc-100">
                        {set.duration_minutes != null
                          ? `${set.exercise_name} — ${set.duration_minutes} ${t("dk", "min")}${set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""}`
                          : `${set.exercise_name} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                      </span>
                      <IconButton label={t("Seti kaldır", "Remove set")} onClick={() => handleRemoveSet(index)} className="hover:text-red-600 dark:hover:text-red-400">
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              ) : null}
              <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
                <PrimaryButton type="submit" disabled={isSubmitting || pendingSets.length === 0} className="w-full">
                  <Save className="h-4 w-4" />
                  {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Oturumu Kaydet", "Save Session")}
                </PrimaryButton>
                {pendingSets.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    {t('Kaydetmeden önce en az bir set eklemelisin — yukarıdaki "Sete Ekle"yi kullan.', 'You need to add at least one set before saving — use "Add Set" above.')}
                  </p>
                ) : null}
              </form>
            </div>
          </FormCard>
        </div>

        {!isLoading ? (
          <Card>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Egzersiz Hedefleri", "Exercise Goals")}</h2>
            {exerciseGoals.length > 0 ? (
              <p className="mb-4 mt-1 text-sm text-zinc-500">{t("Düzenlemek için kaleme tıkla.", "Click the pencil to edit.")}</p>
            ) : null}
            {exerciseGoals.length > 0 ? (
              <ExerciseGoalsList
                goals={exerciseGoals}
                onEdit={(goal) => {
                  setGoalEditor(goal);
                }}
              />
            ) : (
              <EmptyState icon={<Target className="h-8 w-8" />} message={t("Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.", "No exercise goal yet. You can add one below.")} />
            )}
            <div className="mt-4">
              {goalEditor !== null ? (
                <EditorPanel title={goalEditor === "new" ? t("Egzersiz hedefi ekle", "Add exercise goal") : t("Hedefi düzenle", "Edit goal")} onClose={() => setGoalEditor(null)}>
                  <ExerciseGoalForm
                    key={goalEditor === "new" ? "new" : goalEditor.id}
                    editing={goalEditor === "new" ? null : goalEditor}
                    onSaved={async () => {
                      if (token) setExerciseGoals(await getExerciseGoals(token));
                    }}
                    onDeleted={async () => {
                      setGoalEditor(null);
                      if (token) setExerciseGoals(await getExerciseGoals(token));
                    }}
                  />
                </EditorPanel>
              ) : (
                <button
                  type="button"
                  onClick={() => setGoalEditor("new")}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-[color-mix(in_srgb,var(--id-workout)_70%,transparent)] text-sm font-semibold text-[var(--id-workout)] transition-colors hover:bg-[color-mix(in_srgb,var(--id-workout)_10%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  {t("Hedef Ekle", "Add Goal")}
                </button>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Antrenman Türü Dağılımı", "Workout Type Distribution")}</h2>
            <ChipSelect
              label={t("Zaman aralığı", "Time range")}
              options={["30", "90"] as const}
              value={typeRangeDays === 30 ? "30" : "90"}
              onChange={(v) => setTypeRangeDays(v === "30" ? 30 : 90)}
              labels={{ "30": t("Son 30 gün", "Last 30 days"), "90": t("Son 90 gün", "Last 90 days") }}
            />
          </div>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutTypeChart sessions={typeChartSessions} />}
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Ağırlık Hacmi Trendi", "Weight Volume Trend")}</h2>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutVolumeChart sessions={sessions} />}
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Egzersizlerim", "My Exercises")}</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-500">
          {t("Bir egzersize tıklayarak haftalık/aylık ilerlemeni kendi geçmişinle kıyasla.", "Click an exercise to compare your weekly/monthly progress against your own history.")}
        </p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : loggedExercises.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            message={t("Henüz bir egzersiz loglamadın. İlk setini kaydedince burada listelenecek.", "You haven't logged an exercise yet. It'll appear here once you log your first set.")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {loggedExercises.map((exercise) => (
                <Link
                  key={exercise.exercise_name}
                  href={`/workouts/${encodeURIComponent(exerciseDisplayName(exercise, language))}`}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-[14px] bg-[var(--pc-box)] px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <span className="min-w-0 truncate font-semibold text-zinc-900 dark:text-white">{exerciseDisplayName(exercise, language)}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                    {t(`${exercise.set_count} set`, `${exercise.set_count} sets`)}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </div>
            {hasMoreLoggedExercises ? (
              <SecondaryButton onClick={handleLoadMoreLoggedExercises} disabled={isLoadingMoreLoggedExercises} className="w-full">
                {isLoadingMoreLoggedExercises ? t("Yükleniyor...", "Loading...") : t("Daha Fazla Göster", "Show More")}
              </SecondaryButton>
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Geçmiş Kayıtlar", "History")}</h2>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : historyItems.length === 0 ? (
              <EmptyState
                icon={<Dumbbell className="h-8 w-8" />}
                message={t(
                  "Henüz bir antrenman kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No workout logged yet. You can add your first entry using the form above."
                )}
              />
            ) : (
              <div className="space-y-4">
                {groupEntriesByDate(historyItems, (s) => s.session_date, language).map((group) => (
                  <div key={group.label}>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">{toLocaleUpper(group.label, language)}</h3>
                    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                      {group.items.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-2xl bg-[var(--pc-box)] p-3.5"
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
                          {session.workout_type ? WORKOUT_TYPE_LABELS[language][session.workout_type as WorkoutType] ?? session.workout_type : t("Antrenman", "Workout")}
                          {session.note ? ` (${session.note})` : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEditSession(session)}
                            className="text-zinc-400 transition-colors hover:text-[var(--tone-accent)]"
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
                      {(expandedSessionIds.has(session.id)
                        ? session.sets
                        : session.sets.slice(0, SET_DISPLAY_LIMIT)
                      ).map((set) => {
                        const isDurationSet = set.duration_minutes != null;
                        return (
                          <div
                            key={set.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-muted)] py-1 pl-3 pr-1 text-sm"
                          >
                            {editingSetId === set.id ? (
                              <div className="flex flex-1 items-center gap-2">
                                <span className="text-zinc-600 dark:text-zinc-300">{exerciseDisplayName(set, language)}</span>
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
                                    ? `${exerciseDisplayName(set, language)} — ${set.duration_minutes} ${t("dk", "min")}${
                                        set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                                      }${set.estimated_calories ? ` — ~${set.estimated_calories.toFixed(0)} kcal` : ""}`
                                    : `${exerciseDisplayName(set, language)} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
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
                                    className="text-zinc-400 transition-colors hover:text-[var(--tone-accent)]"
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
                    {session.sets.length > SET_DISPLAY_LIMIT ? (
                      <button
                        type="button"
                        onClick={() => toggleExpandSession(session.id)}
                        className="mt-2 text-xs font-medium text-[var(--tone-accent)] hover:underline"
                      >
                        {expandedSessionIds.has(session.id)
                          ? t("Daha az göster", "Show less")
                          : t(
                              `${session.sets.length - SET_DISPLAY_LIMIT} set daha göster`,
                              `Show ${session.sets.length - SET_DISPLAY_LIMIT} more sets`
                            )}
                      </button>
                    ) : null}
                  </div>
                      ))}
                    </div>
                  </div>
                ))}
                {hasMoreHistory ? (
                  <SecondaryButton onClick={handleLoadMoreHistory} disabled={isLoadingMoreHistory} className="w-full">
                    {isLoadingMoreHistory ? t("Yükleniyor...", "Loading...") : t("Daha Fazla Göster", "Show More")}
                  </SecondaryButton>
                ) : null}
              </div>
            )}
      </Card>
    </div>
  );
}
