import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Check, ChevronRight, Dumbbell, ListChecks, Pencil, Plus, Trophy, X } from "lucide-react-native";
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
  searchExercises,
  updateWorkoutSession,
  updateWorkoutSet,
  type CardioCategory,
  type ExerciseCatalogItem,
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
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ChipSelect,
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  WORKOUT_TYPE_LABELS,
  type ThemeColors,
  useSeriesColors,
  useThemeColors,
} from "@/components/ui";
import { ExerciseGoalsList } from "@/components/exercise-goals-list";
import { SearchableSelect } from "@/components/searchable-select";
import { BottomSheet } from "@/components/bottom-sheet";
import { SwipeableRow } from "@/components/swipeable-row";
import { Stepper } from "@/components/stepper";
import { useQuickAdd } from "@/lib/quick-add-context";
import { WorkoutTypeChart } from "@/components/charts/workout-type-chart";
import { WorkoutVolumeChart } from "@/components/charts/workout-volume-chart";
import { tapLight, tapSuccess } from "@/lib/haptics";

// web/src/app/(app)/workouts/page.tsx'in mobil portu - Faz M4 ilk yarısı.
// 2026-08-15 (Faz M2, mobile-native redesign): "Antrenman Kaydet" formu
// ARTIK sayfanın ortasında sabit bir Card değil - odaklı bir BottomSheet
// akışı (web'in aynı formu tek bir sayfada göstermesinin "web'in mobil
// portu" hali yerine gerçek bir mobil etkileşim, bkz. redesign planı Faz
// M2a). Geçmiş listesindeki sil ikonları kaldırıldı - SwipeableRow (sağdan
// sola kaydır) ile değiştirildi, düzenleme (kalem ikonu) DEĞİŞMEDİ. Form/
// veri MANTIĞI (state, handler'lar) bu turda DOKUNULMADI - sadece nereden/
// nasıl gösterildiği değişti.

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme + gün başlıklarına gruplama (web ile AYNI desen). Web'de HÂLÂ
// 10 (kullanıcı web'den şikayet etmedi) - mobile'da 20->10->5 kademeli
// düşürüldükten sonra bile hâlâ şişkin bulunup 3'e indirildi (aynı gün
// 3. tur telefon testi) - SET_DISPLAY_LIMIT (oturum İÇİNDEKİ set sayısı,
// aşağıda) kullanıcı "gayet güzel" dediği için 5'te KALDI, sadece oturum
// SAYISI (kuvvet/kardiyo/vb. kartları) 3'e düşürüldü.
const HISTORY_PAGE_SIZE = 3;
// Tek bir oturumda çok sayıda set olması sayfa uzunluğunu HISTORY_PAGE_
// SIZE'dan bağımsız olarak şişirebiliyordu - her oturum kartı İÇİNDE set
// sayısı bunu aşarsa yerel bir "X set daha göster" genişletmesi devreye
// giriyor (web ile AYNI desen, kullanıcı onayladı).
const SET_DISPLAY_LIMIT = 5;
// "Egzersizlerim" listesi kayıt değil, egzersiz TÜRÜ bazında tekilleştirilmiş
// bir liste - doğası gereği "Geçmiş Kayıtlar"dan çok daha yavaş büyür (yeni
// antrenman genelde MEVCUT türleri tekrarlar). Somut bir şişme sorunu yoktu,
// ama kullanıcı diğer ekranlarla tutarlılık için (uzun vadede 50+ farklı
// egzersiz birikirse diye önlem) aynı kademeli yükleme desenini istedi
// (2026-08-14) - mobile'da diğer listelerle aynı 5.
const LOGGED_EXERCISES_PAGE_SIZE = 5;

export default function WorkoutsTab() {
  const { token } = useAuth();
  const router = useRouter();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Odaklı loglama akışı - bkz. dosya başındaki not (Faz M2).
  const [isLogSheetOpen, setIsLogSheetOpen] = useState(false);
  // Sohbet ekranının hızlı-ekle menüsünden tetikleniyor (bkz.
  // components/quick-add-menu.tsx + lib/quick-add-context.tsx) - sekmeler
  // unmount OLMADIĞI için (bkz. proje
  // belleği) düz navigasyon tek başına sheet'i açtıramaz, bu ekranın kendisi
  // paylaşımlı sayaçtaki değişimi dinleyip sheet'i açmalı. requestId 0 iken
  // (ilk mount) AÇILMIYOR - sadece sonraki her artışta.
  const { workoutSheetRequestId } = useQuickAdd();
  useEffect(() => {
    if (workoutSheetRequestId > 0) setIsLogSheetOpen(true);
  }, [workoutSheetRequestId]);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  // Antrenman türü kardiyo/esneklik ise set bazında süre+yoğunluk sorulur,
  // kuvvet/karışık'ta tekrar+kilo (2026-08-06, kullanıcı isteği). Kardiyo
  // seçiliyken kullanıcı ALTTA bir kategori (koşu/bisiklet/...) de seçer,
  // esneklik'te kategori sabittir (tek seçenek). Kalori tahmini backend'de
  // MET yöntemiyle hesaplanıyor - bkz. backend/app/services/met_reference.py.
  const isDurationMode = workoutType === "kardiyo" || workoutType === "esneklik";
  const [exerciseName, setExerciseName] = useState("");
  // SearchableSelect'ten bir katalog kaydı seçilince dolar - ekleniyor
  // çünkü katalog eşlemesi olmadan geçmiş/hedef ilerlemesi SADECE isim
  // metnine bakıyor (bkz. backend workout_service.py::_best_before), ve
  // isim metni dil tercihine göre değişiyor (catalogDisplayName) - aynı
  // egzersiz TR'de "Halter Squat", EN'de "Barbell Squat" gibi FARKLI
  // metinler olarak kaydedilip geçmişleri kopardığı için hedef ilerlemesi
  // dil değiştirince sıfırlanmış gibi görünüyordu (kullanıcı bulgusu,
  // 2026-08-11). Kullanıcı elle yazmaya devam ederse (onQueryChange)
  // temizlenir - artık seçilen kayıtla eşleştiği garanti edilemez.
  const [exerciseCatalogId, setExerciseCatalogId] = useState<number | undefined>(undefined);
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
  // grafikleri besleyen `sessions`/getWorkoutSessions(token, 90) çağrısından
  // KASITLI OLARAK ayrı (2026-08-14, kullanıcı isteği: uzun listeler görsel
  // olarak bunaltıcıydı). `sessions`'ı limit'e çevirmek WorkoutTypeChart/
  // WorkoutVolumeChart'ın 90 günlük trendini kırardı.
  const [historyItems, setHistoryItems] = useState<WorkoutSession[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const [loggedExercisesOffset, setLoggedExercisesOffset] = useState(0);
  const [hasMoreLoggedExercises, setHasMoreLoggedExercises] = useState(false);
  const [isLoadingMoreLoggedExercises, setIsLoadingMoreLoggedExercises] = useState(false);

  const loadHistoryPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (!token) return;
      const page = await getWorkoutSessions(token, undefined, HISTORY_PAGE_SIZE, offset);
      const newestFirst = [...page].reverse();
      setHistoryItems((prev) => (replace ? newestFirst : [...prev, ...newestFirst]));
      setHasMoreHistory(page.length === HISTORY_PAGE_SIZE);
      setHistoryOffset(offset + page.length);
    },
    [token]
  );

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

  const loadLoggedExercisesPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (!token) return;
      const page = await getLoggedExercises(token, LOGGED_EXERCISES_PAGE_SIZE, offset);
      setLoggedExercises((prev) => (replace ? page : [...prev, ...page]));
      setHasMoreLoggedExercises(page.length === LOGGED_EXERCISES_PAGE_SIZE);
      setLoggedExercisesOffset(offset + page.length);
    },
    [token]
  );

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

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
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
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t, loadHistoryPage, loadLoggedExercisesPage]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleAddSet() {
    setFormError(null);
    if (!exerciseName.trim()) {
      setFormError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }

    if (isDurationMode) {
      const durationNumber = parseLocaleNumber(duration);
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
      tapLight();
      return;
    }

    const repsNumber = parseLocaleNumber(reps);
    if (!repsNumber || repsNumber <= 0) {
      setFormError(t("Tekrar sayısı sıfırdan büyük olmalı.", "Rep count must be greater than zero."));
      return;
    }
    const weightNumber = weight ? parseLocaleNumber(weight) : undefined;
    if (weight && Number.isNaN(weightNumber)) {
      setFormError(t("Geçerli bir kilo değeri gir.", "Enter a valid weight value."));
      return;
    }
    setPendingSets((prev) => [
      ...prev,
      {
        exercise_name: exerciseName.trim(),
        exercise_catalog_id: exerciseCatalogId,
        reps: repsNumber,
        weight_kg: weightNumber,
      },
    ]);
    setReps("10");
    setWeight("");
    tapLight();
  }

  function handleRemoveSet(index: number) {
    setPendingSets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (pendingSets.length === 0) {
      setFormError(t("Kaydetmeden önce en az bir set eklemelisin.", "You need to add at least one set before saving."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logWorkoutSession(token, { workout_type: workoutType, sets: pendingSets });
      setFormSuccess(t("Antrenman kaydedildi!", "Workout saved!"));
      setPendingSets([]);
      setExerciseName("");
      setExerciseCatalogId(undefined);
      tapSuccess();
      await loadData();
      // Sheet'i hemen değil, kullanıcının "Kaydedildi!" mesajını görebilmesi
      // için kısa bir an sonra kapatıyoruz (web'deki success banner'ın
      // görünür kalma süresiyle aynı ilke, ama burada sheet'in KENDİSİ
      // kapanıyor - kullanıcı geçmiş listesine geri döner).
      setTimeout(() => setIsLogSheetOpen(false), 700);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function replaceSession(updated: WorkoutSession) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    // historyItems'ı da güncelle - bu fonksiyon sadece bir session'ın
    // İÇERİĞİNİ değiştirir (tarih/kimlik değişmez), tam bir loadData()
    // reset'ine gerek yok (handleDeleteSession'ın aksine).
    setHistoryItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  // 2026-08-12 canlı testte bulundu (web'de): bir seti düzenleyip/silip
  // sadece replaceSession() çağırmak "Egzersiz Hedefleri" kartını (ve
  // haftalık Toplam Hacim/kalori stat'larını) GÜNCELLEMİYORDU - handleDeleteSession
  // zaten tam loadData() çağırdığı için bu sorunu yaşamıyordu, set bazlı
  // işlemler de aynı türetilmiş verileri tazelemeli (sessions'ı tekrar
  // çekmeye gerek yok, replaceSession zaten güncel session'ı state'e koydu).
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
            duration_minutes: parseLocaleNumber(editDuration),
            intensity: editIntensity,
          })
        : await updateWorkoutSet(token, sessionId, setId, {
            reps: parseLocaleNumber(editReps),
            weight_kg: editWeight ? parseLocaleNumber(editWeight) : undefined,
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
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} tintColor={c.accent} />}
      >
        <Text style={s.title}>{t("Antrenman", "Workouts")}</Text>

        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <View style={s.statGrid}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)} style={s.statGrid}>
            <StatTile label={t("Bu Hafta Oturum", "Sessions This Week")} value={String(summary?.session_count ?? 0)} color={seriesColors.series2} />
            <StatTile label={t("Bu Hafta Set", "Sets This Week")} value={String(summary?.total_sets ?? 0)} color={seriesColors.series3} />
            <StatTile
              label={t("Toplam Hacim", "Total Volume")}
              value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`}
              color={seriesColors.series1}
            />
            {summary && summary.total_calories_burned > 0 ? (
              <StatTile
                label={t("Yakılan Kalori", "Calories Burned")}
                value={`~${summary.total_calories_burned.toFixed(0)} kcal`}
                color={seriesColors.series5}
              />
            ) : null}
          </Animated.View>
        )}

        {!isLoading && summary ? (
          <InfoBanner
            message={
              summary.session_count > 0
                ? summary.summary_text
                : t(
                    "Henüz bu hafta bir antrenman kaydı yok. Sağ alttaki \"Ekle\"ye dokunarak ilk kaydını ekleyebilirsin.",
                    "No workout logged this week yet. Tap \"Add\" at the top right to add your first entry."
                  )
            }
          />
        ) : null}

        {!isLoading && exerciseGoals.length > 0 ? (
          <Animated.View entering={FadeIn.delay(60).duration(250)}>
          <Card>
            <Text style={s.cardTitle}>{t("Egzersiz Hedefleri", "Exercise Goals")}</Text>
            <ExerciseGoalsList goals={exerciseGoals} />
          </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeIn.delay(60).duration(250)}>
        <Card>
          <Text style={s.cardTitle}>{t("Egzersizlerim", "My Exercises")}</Text>
          <Text style={s.cardSubtitle}>
            {t(
              "Bir egzersize dokunarak haftalık/aylık ilerlemeni kendi geçmişinle kıyasla.",
              "Tap an exercise to compare your weekly/monthly progress against your own history."
            )}
          </Text>
          {isLoading ? (
            <Skeleton height={100} />
          ) : loggedExercises.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={28} color={c.muted} />}
              message={t(
                "Henüz bir egzersiz loglamadın. İlk setini kaydedince burada listelenecek.",
                "You haven't logged an exercise yet. It'll appear here once you log your first set."
              )}
            />
          ) : (
            <View style={{ gap: 6 }}>
              {loggedExercises.map((exercise) => (
                <Pressable
                  key={exercise.exercise_name}
                  onPress={() =>
                    router.push({
                      pathname: "/exercise-history",
                      params: { name: exercise.exercise_name },
                    })
                  }
                  style={s.exerciseRow}
                >
                  <Text style={s.exerciseRowLabel}>{exercise.exercise_name}</Text>
                  <View style={s.exerciseRowRight}>
                    <Text style={s.exerciseRowMeta}>
                      {t(`${exercise.set_count} set`, `${exercise.set_count} sets`)}
                    </Text>
                    <ChevronRight size={16} color={c.muted} />
                  </View>
                </Pressable>
              ))}
              {hasMoreLoggedExercises ? (
                <SecondaryButton
                  onPress={handleLoadMoreLoggedExercises}
                  disabled={isLoadingMoreLoggedExercises}
                  loading={isLoadingMoreLoggedExercises}
                >
                  {t("Daha Fazla Göster", "Show More")}
                </SecondaryButton>
              ) : null}
            </View>
          )}
        </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(120).duration(250)}>
        <Card>
          <Text style={s.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
          <Text style={s.cardSubtitle}>{t("Silmek için sola kaydır.", "Swipe left to delete.")}</Text>
          {historyError ? <ErrorBanner message={historyError} /> : null}
          {isLoading ? (
            <Skeleton height={140} />
          ) : historyItems.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={28} color={c.muted} />}
              message={t(
                "Henüz bir antrenman kaydı yok. Sağ alttaki \"Ekle\"ye dokunarak ilk kaydını ekleyebilirsin.",
                "No workout logged yet. Tap \"Add\" at the top right to add your first entry."
              )}
            />
          ) : (
            <View style={{ gap: 16 }}>
              {groupEntriesByDate(historyItems, (session) => session.session_date, language).map((group) => (
                <View key={group.label} style={{ gap: 12 }}>
                  <Text style={s.groupLabel}>{group.label}</Text>
                  {group.items.map((session) => (
                    <SwipeableRow key={session.id} onDelete={() => handleDeleteSession(session.id)}>
                      <View style={s.sessionCard}>
                        {editingSessionId === session.id ? (
                          <View style={s.sessionEditRow}>
                            <ChipSelect
                              options={WORKOUT_TYPES}
                              value={editSessionType}
                              onChange={setEditSessionType}
                              labels={WORKOUT_TYPE_LABELS[language]}
                            />
                            <FormInput
                              value={editSessionNote}
                              onChangeText={setEditSessionNote}
                              placeholder={t("Not (opsiyonel)", "Note (optional)")}
                            />
                            <View style={s.iconRow}>
                              <Pressable onPress={() => handleSaveSession(session.id)} hitSlop={8}>
                                <Check size={18} color={c.success} />
                              </Pressable>
                              <Pressable onPress={() => setEditingSessionId(null)} hitSlop={8}>
                                <X size={18} color={c.error} />
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <View style={s.sessionHeaderRow}>
                            <Text style={s.sessionHeaderText}>
                              {session.workout_type
                                ? WORKOUT_TYPE_LABELS[language][session.workout_type as WorkoutType] ?? session.workout_type
                                : t("Antrenman", "Workout")}
                              {session.note ? ` (${session.note})` : ""}
                            </Text>
                            <Pressable onPress={() => handleStartEditSession(session)} hitSlop={8}>
                              <Pencil size={16} color={c.muted} />
                            </Pressable>
                          </View>
                        )}

                        <View style={{ gap: 6, marginTop: 8 }}>
                          {(expandedSessionIds.has(session.id)
                            ? session.sets
                            : session.sets.slice(0, SET_DISPLAY_LIMIT)
                          ).map((set) => {
                            const isDurationSet = set.duration_minutes != null;
                            return (
                              <SwipeableRow key={set.id} onDelete={() => handleDeleteSet(session.id, set.id)}>
                                <View style={s.setRow}>
                                  {editingSetId === set.id ? (
                                    isDurationSet ? (
                                      <View style={s.setEditRow}>
                                        <Text style={s.setEditName}>{set.exercise_name_snapshot}</Text>
                                        <FormInput
                                          value={editDuration}
                                          onChangeText={setEditDuration}
                                          keyboardType="number-pad"
                                          style={{ width: 56 }}
                                        />
                                        <Text style={s.setEditUnit}>{t("dk", "min")}</Text>
                                        <ChipSelect
                                          options={INTENSITIES}
                                          value={editIntensity}
                                          onChange={setEditIntensity}
                                          labels={INTENSITY_LABELS[language]}
                                        />
                                        <Pressable onPress={() => handleSaveSet(session.id, set.id, true)} hitSlop={8}>
                                          <Check size={16} color={c.success} />
                                        </Pressable>
                                        <Pressable onPress={() => setEditingSetId(null)} hitSlop={8}>
                                          <X size={16} color={c.error} />
                                        </Pressable>
                                      </View>
                                    ) : (
                                      <View style={s.setEditRow}>
                                        <Text style={s.setEditName}>{set.exercise_name_snapshot}</Text>
                                        <FormInput
                                          value={editReps}
                                          onChangeText={setEditReps}
                                          keyboardType="number-pad"
                                          style={{ width: 56 }}
                                        />
                                        <Text style={s.setEditUnit}>{t("tekrar", "reps")}</Text>
                                        <FormInput
                                          value={editWeight}
                                          onChangeText={setEditWeight}
                                          keyboardType="numeric"
                                          placeholder={t("kg", "kg")}
                                          style={{ width: 64 }}
                                        />
                                        <Pressable onPress={() => handleSaveSet(session.id, set.id, false)} hitSlop={8}>
                                          <Check size={16} color={c.success} />
                                        </Pressable>
                                        <Pressable onPress={() => setEditingSetId(null)} hitSlop={8}>
                                          <X size={16} color={c.error} />
                                        </Pressable>
                                      </View>
                                    )
                                  ) : (
                                    <>
                                      <View style={s.setLabelRow}>
                                        <Text style={s.setText}>
                                          {isDurationSet
                                            ? `${set.exercise_name_snapshot} — ${set.duration_minutes} ${t("dk", "min")}${
                                                set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                                              }${set.estimated_calories ? ` — ~${set.estimated_calories.toFixed(0)} kcal` : ""}`
                                            : `${set.exercise_name_snapshot} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                                        </Text>
                                        {set.is_personal_record ? (
                                          <View style={s.recordBadge}>
                                            <Trophy size={11} color={c.insightAccent} />
                                            <Text style={s.recordText}>{t("Rekor", "Record")}</Text>
                                          </View>
                                        ) : null}
                                      </View>
                                      <Pressable onPress={() => handleStartEditSet(set)} hitSlop={8}>
                                        <Pencil size={14} color={c.muted} />
                                      </Pressable>
                                    </>
                                  )}
                                </View>
                              </SwipeableRow>
                            );
                          })}
                        </View>
                        {session.sets.length > SET_DISPLAY_LIMIT ? (
                          <Pressable onPress={() => toggleExpandSession(session.id)} hitSlop={8} style={{ marginTop: 8 }}>
                            <Text style={s.expandSessionText}>
                              {expandedSessionIds.has(session.id)
                                ? t("Daha az göster", "Show less")
                                : t(
                                    `${session.sets.length - SET_DISPLAY_LIMIT} set daha göster`,
                                    `Show ${session.sets.length - SET_DISPLAY_LIMIT} more sets`
                                  )}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </SwipeableRow>
                  ))}
                </View>
              ))}
              {hasMoreHistory ? (
                <SecondaryButton onPress={handleLoadMoreHistory} disabled={isLoadingMoreHistory} loading={isLoadingMoreHistory}>
                  {t("Daha Fazla Göster", "Show More")}
                </SecondaryButton>
              ) : null}
            </View>
          )}
        </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(180).duration(250)}>
        <Card>
          <Text style={s.cardTitle}>{t("Antrenman Türü Dağılımı", "Workout Type Distribution")}</Text>
          {isLoading ? <Skeleton height={200} /> : <WorkoutTypeChart sessions={sessions} />}
        </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(240).duration(250)}>
        <Card>
          <Text style={s.cardTitle}>{t("Ağırlık Hacmi Trendi", "Weight Volume Trend")}</Text>
          {isLoading ? <Skeleton height={200} /> : <WorkoutVolumeChart sessions={sessions} />}
        </Card>
        </Animated.View>
      </ScrollView>

      {/* 2026-08-15 (Faz M2b, kullanıcı geri bildirimi): "Ekle" düğmesi
          ÖNCEDEN başlığın yanında küçük bir pildi - "yeri açıklayıcı değil,
          güzel de değil" dedi. Artık ekranın HER YERİNDEN erişilebilir,
          yüzen bir "genişletilmiş FAB" (Material'ın "add new" için evrensel
          kabul görmüş yüzen eylem düğmesi deseni) - BottomSheet'in AŞAĞIDAN
          açılmasıyla da mekansal olarak tutarlı (düğme aşağıda, sheet aşağıdan
          yükseliyor). */}
      {/* 2026-08-15: ZoomIn (sıçramalı ölçek) yerine sade bir FadeIn -
          kullanıcı "yeni animasyonu beğendim, aynısını burada da kullan"
          dedi (bkz. quick-add-menu.tsx'in ölçek+opaklık popover'ı); ZoomIn
          bu daha "zarif ve abartısız" hedefle çelişiyordu. */}
      <Animated.View entering={FadeIn.duration(200)} style={s.fabWrap}>
        <Pressable
          onPress={() => {
            tapLight();
            setIsLogSheetOpen(true);
          }}
          style={({ pressed }) => [s.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
        >
          <Plus size={20} color={c.onAccentSolid} />
          <Text style={s.fabText}>{t("Ekle", "Add")}</Text>
        </Pressable>
      </Animated.View>

      <BottomSheet visible={isLogSheetOpen} onClose={() => setIsLogSheetOpen(false)}>
        <Text style={s.sheetTitle}>{t("Antrenman Kaydet", "Log Workout")}</Text>
        {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
        {formError ? <ErrorBanner message={formError} /> : null}

        <View>
          <FormLabel>{t("Antrenman Türü", "Workout Type")}</FormLabel>
          <ChipSelect options={WORKOUT_TYPES} value={workoutType} onChange={setWorkoutType} labels={WORKOUT_TYPE_LABELS[language]} />
        </View>

        <View>
          <FormLabel>{t("Egzersiz", "Exercise")}</FormLabel>
          <SearchableSelect<ExerciseCatalogItem>
            selectedLabel={exerciseName}
            onQueryChange={(query) => {
              setExerciseName(query);
              setExerciseCatalogId(undefined);
            }}
            onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
            onSelect={(item) => {
              setExerciseName(catalogDisplayName(item, language));
              setExerciseCatalogId(item.id);
            }}
            getLabel={(item) => catalogDisplayName(item, language)}
            getKey={(item) => item.id}
            placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
          />
        </View>

        {isDurationMode ? (
          <>
            {workoutType === "kardiyo" ? (
              <View>
                <FormLabel>{t("Kardiyo Türü", "Cardio Type")}</FormLabel>
                <ChipSelect
                  options={CARDIO_CATEGORIES}
                  value={cardioCategory}
                  onChange={setCardioCategory}
                  labels={CARDIO_CATEGORY_LABELS[language]}
                />
              </View>
            ) : null}
            <View style={s.repsWeightRow}>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Süre (dakika)", "Duration (minutes)")}</FormLabel>
                <Stepper value={duration} onChangeText={setDuration} step={5} min={0} />
              </View>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Yoğunluk", "Intensity")}</FormLabel>
                <ChipSelect options={INTENSITIES} value={intensity} onChange={setIntensity} labels={INTENSITY_LABELS[language]} />
              </View>
            </View>
          </>
        ) : (
          <View style={s.repsWeightRow}>
            <View style={{ flex: 1 }}>
              <FormLabel>{t("Tekrar", "Reps")}</FormLabel>
              <Stepper value={reps} onChangeText={setReps} step={1} min={0} />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel>{t("Kilo (kg)", "Weight (kg)")}</FormLabel>
              <Stepper
                value={weight}
                onChangeText={setWeight}
                step={2.5}
                min={0}
                allowDecimal
                placeholder={t("opsiyonel", "optional")}
              />
            </View>
          </View>
        )}

        <Pressable onPress={handleAddSet} style={s.secondaryButton}>
          <Plus size={16} color={c.accent} />
          <Text style={s.secondaryButtonText}>{t("Sete Ekle", "Add Set")}</Text>
        </Pressable>

        {pendingSets.length > 0 ? (
          <View style={{ gap: 6 }}>
            {pendingSets.map((set, index) => (
              <View key={index} style={s.pendingRow}>
                <Text style={s.pendingText}>
                  {set.duration_minutes != null
                    ? `${set.exercise_name} — ${set.duration_minutes} ${t("dk", "min")}${
                        set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                      }`
                    : `${set.exercise_name} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                </Text>
                <Pressable onPress={() => handleRemoveSet(index)} hitSlop={8}>
                  <X size={16} color={c.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <PrimaryButton onPress={handleSubmit} disabled={isSubmitting || pendingSets.length === 0} loading={isSubmitting}>
          {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Oturumu Kaydet", "Save Session")}
        </PrimaryButton>
        {pendingSets.length === 0 ? (
          <Text style={s.hintText}>
            {t(
              'Kaydetmeden önce en az bir set eklemelisin — yukarıdaki "Sete Ekle"yi kullan.',
              'You need to add at least one set before saving — use "Add Set" above.'
            )}
          </Text>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 16, paddingBottom: 96 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.text },
    fabWrap: {
      position: "absolute",
      right: 20,
      bottom: 24,
    },
    fab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: c.accentSolid,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 14,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    fabText: { fontSize: 14, fontFamily: "Inter_700Bold", color: c.onAccentSolid },
    sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: c.text },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text },
    cardSubtitle: { fontSize: 12, color: c.muted, marginTop: 2, marginBottom: 10 },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    exerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    exerciseRowLabel: { fontSize: 13, color: c.text },
    exerciseRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    exerciseRowMeta: { fontSize: 11, color: c.muted },
    repsWeightRow: { flexDirection: "row", gap: 10 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 10,
      paddingVertical: 10,
    },
    secondaryButtonText: { color: c.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surfaceMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    pendingText: { fontSize: 13, color: c.text, flex: 1 },
    hintText: { fontSize: 12, color: c.muted },
    sessionCard: {
      borderRadius: 10,
      backgroundColor: c.surfaceMuted,
      padding: 10,
    },
    sessionEditRow: { gap: 8 },
    sessionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sessionHeaderText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.text, flex: 1, marginRight: 8 },
    iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    setEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    setEditName: { fontSize: 12, color: c.muted },
    setEditUnit: { fontSize: 11, color: c.muted },
    setLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
    setText: { fontSize: 13, color: c.text },
    recordBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: c.insightBg,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    recordText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: c.insightAccent },
    expandSessionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.accent },
  });
}
