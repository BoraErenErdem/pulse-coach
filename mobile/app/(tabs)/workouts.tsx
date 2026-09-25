import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, ChevronRight, Dumbbell, Flame, ListChecks, Pencil, Plus, Target, Trophy, Weight, X } from "lucide-react-native";
import {
  ApiError,
  CARDIO_CATEGORIES,
  CARDIO_CATEGORY_LABELS,
  INTENSITIES,
  INTENSITY_LABELS,
  WORKOUT_TYPES,
  deleteExerciseGoal,
  deleteWorkoutSession,
  deleteWorkoutSet,
  getExerciseGoals,
  getLoggedExercises,
  getWorkoutSessions,
  getWorkoutSummary,
  logWorkoutSession,
  searchExercises,
  setExerciseGoal,
  getWeeklyGoal,
  localDateKey,
  updateWorkoutSession,
  updateWorkoutSet,
  type CardioCategory,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
  type Intensity,
  type LoggedExercise,
  type PreferredLanguage,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutSetInput,
  type WorkoutSummary,
  type WorkoutType,
  type WeeklyGoal,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { parseLocaleNumber, toLocaleUpper } from "@/lib/format";
import {
  ChipSelect,
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  Skeleton,
  SuccessBanner,
  WORKOUT_TYPE_LABELS,
  type ThemeColors,
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
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { WeeklyGoalCard, WeeklyGoalInvite, WeeklyGoalSheet } from "@/components/weekly-goal";
import { useProfile } from "@/lib/profile-context";
import { ProgressFormCard, ProgressInsight, ProgressSectionCard, ProgressTextButton, stackTone } from "@/components/progress-cards";
import { SurfaceToneProvider, WORKOUT_SURFACE_TONE, rampColorOf } from "@/components/surface-tone";
import { ScreenGlow } from "@/components/screen-glow";
import { WorkoutTile } from "@/components/workout-cards";
import { WORKOUT_INSIGHT_TONE, useWorkoutIdentityColors, useWorkoutTypeChipColors } from "@/components/workout-identity";

// web/src/app/(app)/workouts/page.tsx'in mobil portu - Faz M4 ilk yarısı.
// 2026-08-15 (Faz M2, mobile-native redesign): "Antrenman Kaydet" formu
// ARTIK sayfanın ortasında sabit bir Card değil - odaklı bir BottomSheet
// akışı. Form/veri MANTIĞI (state, handler'lar) bu turlarda DOKUNULMADI.
//
// Tasarım turu (2026-09-22): sayfa [[reference-pulsecoach-design-language]]'a
// göre yeniden yapıldı (İlerleme sekmesiyle AYNI cam/panel dili -
// progress-cards.tsx'ten ProgressSectionCard/ProgressInsight/stackTone
// yeniden kullanılıyor) - ama sekmenin KENDİ kimliği kırmızı ağırlıklı
// (workout-cards.tsx/workout-identity.ts, İlerleme'nin çok renkli
// kimliğinden BİLEREK ayrışıyor, kullanıcı isteği: "kimliğini kaybetmeden").
// "A katmanı" (sekmeye her odaklanışta yeniden oynayan giriş animasyonu,
// `Reveal`/`useIsActiveTab`) BAŞTAN hiç eklenmedi - 2026-09-21 perf turunun
// dersi (bkz. proje belleği + reference §9): odaklanışta içerik ANINDA son
// haliyle görünür, animasyon sadece dokunma (B) veya gerçek listede
// değişiklik (giriş/çıkış geçişleri) için kullanılır.
// "+ Ekle" FAB'ı (2026-09-22, üçüncü oturum): KALDIRILDI - "Antrenman
// Kaydet" artık Modal değil sayfanın kendi akışında her zaman erişilebilir
// bir kart olduğu için (bkz. aşağıdaki `isLogFormOpen` notu) ayrı bir yüzen
// hızlı-erişim düğmesine gerek kalmadı (kullanıcı isteği: "ihtiyacımız yok").
const HISTORY_PAGE_SIZE = 3;
const SET_DISPLAY_LIMIT = 5;
const LOGGED_EXERCISES_PAGE_SIZE = 5;

const sessionsTileIcon = (color: string) => <Dumbbell size={15} color={color} />;
const setsTileIcon = (color: string) => <ListChecks size={15} color={color} />;
const volumeTileIcon = (color: string) => <Weight size={15} color={color} />;
const caloriesTileIcon = (color: string) => <Flame size={15} color={color} />;

// Antrenman Türü Dağılımı zaman aralığı seçeneği (2026-09-22, kullanıcı
// isteği) - "Tüm Zaman" YOK, bkz. workouts.tsx::typeChartSessions notu.
const RANGE_OPTIONS = ["30", "90"] as const;
const RANGE_LABELS: Record<PreferredLanguage, Record<(typeof RANGE_OPTIONS)[number], string>> = {
  tr: { "30": "Son 30 gün", "90": "Son 90 gün" },
  en: { "30": "Last 30 days", "90": "Last 90 days" },
};

// "Antrenman Kaydet" formundaki "Antrenman Türü" seçici (2026-09-22, üçüncü
// oturum, kullanıcı isteği: her tür seçilince KENDİ rengiyle vurgulansın -
// kuvvet kırmızı, kardiyo sarı, esneklik yeşil, karışık mor, bkz.
// workout-identity.ts::useWorkoutTypeChipColors). Paylaşımlı `ChipSelect`
// (ui.tsx) HER seçenek için AYNI tek accent rengini kullanıyor, kategori
// başına renk desteklemiyor - onu app genelinde değiştirmek yerine (10+
// kullanım yeri, aşırı geniş etki alanı) SADECE bu forma özel, küçük bir
// yerel bileşen yazıldı (görsel kalıp - hap, dolgu/kenarlık - `ChipSelect`
// ile AYNI, sadece renk kaynağı seçeneğe göre değişiyor).
function WorkoutTypeChips({
  value,
  onChange,
  labels,
}: {
  value: WorkoutType;
  onChange: (next: WorkoutType) => void;
  labels: Record<WorkoutType, string>;
}) {
  const c = useThemeColors();
  const chipColors = useWorkoutTypeChipColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {WORKOUT_TYPES.map((type) => {
        const active = type === value;
        const color = chipColors[type];
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: active ? `${color}26` : c.surfaceMuted,
              borderWidth: 1,
              borderColor: active ? color : "transparent",
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? color : c.muted }}>
              {labels[type]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function WorkoutsTab() {
  const { token } = useAuth();
  const router = useRouter();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const workoutIds = useWorkoutIdentityColors();
  const insets = useSafeAreaInsets();
  // Koyu modda paneller sıcak kahve - ortak `c.muted` (soğuk teal-gri) bu
  // zeminde düşük kontrastlı kalıyor (İlerleme'deki AYNI bulgu/düzeltme,
  // bkz. progress.tsx::panelMuted).
  const panelMuted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  const panelBorder = isDark ? "rgba(255,255,255,0.15)" : c.border;
  // GoalMeter'ın boş çubuk rengi - progress-cards.tsx::GoalsCard'ın kendi
  // panelinde kullandığı AYNI iki değer (kullanıcı bulgusu: gri metin/çubuk
  // sıcak panelde okunmuyordu).
  const goalTrackColor = isDark ? "rgba(255,255,255,0.20)" : "rgba(36,29,20,0.10)";
  // GoalMeter'ın "140/140 kg" ölçüm metni - `panelMuted`dan daha belirgin
  // (kullanıcı ikinci turda "daha da belirgin olsun" dedi, 0.72 opaklık
  // hâlâ soluk bulundu) - etiketle (label, tam metin rengi) aynı seviyeye
  // yakın ama % rozetiyle (bkz. goal-meter.tsx::pct) görsel hiyerarşi için
  // hâlâ ayırt edilebilir.
  const goalMeterValueColor = isDark ? "rgba(255,255,255,0.92)" : c.text;
  // Grafiklerin (react-native-gifted-charts) eksen/etiket renkleri ortak
  // ekran zeminine göre ayarlı - sıcak panelin içine konunca override gerekir
  // (bkz. workout-type-chart.tsx/workout-volume-chart.tsx'teki `themeColors` notu).
  const panelChartColors: ThemeColors = useMemo(
    () => ({ ...c, muted: panelMuted, border: panelBorder }),
    [c, panelMuted, panelBorder]
  );
  const s = useMemo(() => makeStyles(c, insets.bottom, isDark), [c, insets.bottom, isDark]);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseGoals, setExerciseGoals] = useState<ExerciseGoalProgress[]>([]);
  // Haftalık antrenman günü hedefi (2026-09-23) - bkz. components/weekly-goal.tsx.
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null);
  const [isWeeklyGoalSheetOpen, setIsWeeklyGoalSheetOpen] = useState(false);
  const openWeeklyGoalSheet = useCallback(() => {
    tapLight();
    setIsWeeklyGoalSheetOpen(true);
  }, []);
  const closeWeeklyGoalSheet = useCallback(() => setIsWeeklyGoalSheetOpen(false), []);
  const { profile } = useProfile();
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Perf taraması dersi (bkz. progress.tsx::chartsReady notu): ilk (soğuk)
  // yüklemede iki gifted-charts panelini bir kare erteleyip AYRI bir commit'e
  // koyuyoruz - bir kez true olunca BİR DAHA sıfırlanmıyor (her gerçek
  // yeniden yüklemede grafiklerin unmount/remount olup yeniden çizilmesini
  // önlemek için).
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (chartsReady) return;
    const raf = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(raf);
  }, [chartsReady]);

  // Antrenman Türü Dağılımı'na zaman aralığı filtresi (2026-09-22, kullanıcı
  // isteği). `sessions` her zaman son 90 günü taşıyor (bkz. loadData) - "Tüm
  // Zaman" burada YOK çünkü daha geniş bir aralık ayrı bir API çağrısı
  // gerektirir, kapsamı BİLEREK mevcut veriyle sınırlı tutuldu.
  const [typeChartRangeDays, setTypeChartRangeDays] = useState<"30" | "90">("90");
  const typeChartSessions = useMemo(() => {
    if (typeChartRangeDays === "90") return sessions;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = localDateKey(cutoff);
    return sessions.filter((session) => session.session_date >= cutoffKey);
  }, [sessions, typeChartRangeDays]);

  // Kullanıcı bulgusu (2026-09-22, ÜÇ tur): "Antrenman Kaydet" formu
  // (uygulamanın EN ağır içerikli formu - ChipSelect+SearchableSelect+2
  // Stepper) bir `Modal` tabanlı `BottomSheet` İÇİNDE açılırken CİHAZDA hâlâ
  // kasıyordu - hem "rAF ile bir kare ertele" (tur 6) hem "içeriği native
  // `onShow`'a bağla" (tur 7) denendi, İKİSİ DE YETERSİZ kaldı. Kök neden
  // muhtemelen JS-taraflı mount zamanlamasından bile DAHA temel: RN `Modal`
  // Android'de AYRI bir native pencere (Dialog/Window) açıyor - bu pencere
  // OLUŞUMUNUN kendisi (içerik ne zaman mount olursa olsun) maliyetli.
  // Kullanıcı isteğiyle (2026-09-22, ikinci oturum) mimari değişti: İlerleme
  // sekmesinin "Kilo Kaydet" kartıyla (bkz. progress.tsx::isFormOpen/
  // ProgressFormCard) AYNI desen - Modal YOK, sayfanın KENDİ akışı içinde
  // açılıp kapanan katlanır bir `ProgressFormCard`. Bu, native pencere
  // maliyetini kökten ortadan kaldırıyor (sadece normal bir React state
  // değişimi + ScrollView reflow'u - Progress'in kendi formu cihazda
  // sorunsuz, bkz. proje belleği).
  const [isLogFormOpen, setIsLogFormOpen] = useState(false);
  const { workoutSheetRequestId } = useQuickAdd();
  const scrollRef = useRef<ScrollView>(null);
  const formYRef = useRef(0);
  const pendingFormScrollRef = useRef(false);
  const scrollToForm = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(formYRef.current - 16, 0), animated: true });
  }, []);
  // Sohbet "+" menüsünden "Antrenman Ekle" (cross-tab) - progress.tsx'teki
  // `weightFormRequestId` efektiyle BİREBİR AYNI mantık: formu aç, görünür
  // alana kaydır, üstteki kartlar yüklenince konum değişirse (yavaş bağlantı)
  // birkaç saniye boyunca yeniden kaydırmaya devam et.
  useEffect(() => {
    if (workoutSheetRequestId === 0) return;
    setIsLogFormOpen(true);
    setFormSuccess(null);
    setFormError(null);
    pendingFormScrollRef.current = true;
    const first = setTimeout(scrollToForm, 200);
    const stop = setTimeout(() => {
      pendingFormScrollRef.current = false;
    }, 10000);
    return () => {
      clearTimeout(first);
      clearTimeout(stop);
    };
  }, [workoutSheetRequestId, scrollToForm]);

  // Egzersiz hedefi ekleme sayfası (2026-09-22, kullanıcı isteği): önceden
  // SADECE Profil > Hedefler ekranından yapılabiliyordu - İlerleme'nin kendi
  // GoalSheet'i (sayfadan ayrılmadan hedef belirleme) örneğiyle AYNI mantık:
  // hedefi en sık burada, antrenman loglarken düşünürsün, buraya da bir
  // giriş noktası ekleniyor (goals.tsx'teki tam form MANTIĞI - SearchableSelect
  // + süre/kg+tekrar ikili modu - birebir aynı, sadece bu sayfaya taşındı).
  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false);
  const [goalExerciseName, setGoalExerciseName] = useState("");
  const [goalExerciseCatalogId, setGoalExerciseCatalogId] = useState<number | null>(null);
  const [goalExerciseCategory, setGoalExerciseCategory] = useState<string | null>(null);
  const isGoalDurationMode = goalExerciseCategory === "kardiyo" || goalExerciseCategory === "esneklik";
  const [goalTarget, setGoalTarget] = useState("");
  const [goalReps, setGoalReps] = useState("");
  const [goalDuration, setGoalDuration] = useState("");
  const [goalFormError, setGoalFormError] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  // Hedef düzenleme (2026-09-22, kullanıcı isteği): backend'de hedef "upsert"
  // (aynı egzersiz adına tekrar POST = güncelleme, bkz. exercise_goal_
  // service.py::set_exercise_goal) - ayrı bir PATCH uç noktası yok. Bu yüzden
  // "düzenleme" aslında AYNI ekleme formunu hedefin GÜNCEL değerleriyle
  // önceden doldurup tekrar göndermek - `editingGoalName` dolu olduğu sürece
  // egzersiz alanı KİLİTLİ (değiştirilirse upsert farklı/yeni bir hedefe
  // yazar, eskisi öksüz kalır).
  const [editingGoalName, setEditingGoalName] = useState<string | null>(null);
  function openAddGoalSheet() {
    setEditingGoalName(null);
    setGoalExerciseName("");
    setGoalExerciseCatalogId(null);
    setGoalExerciseCategory(null);
    setGoalTarget("");
    setGoalReps("");
    setGoalDuration("");
    setGoalFormError(null);
    setIsGoalSheetOpen(true);
  }
  function handleEditExerciseGoal(goal: ExerciseGoalProgress) {
    const isDuration = goal.target_duration_minutes != null;
    setEditingGoalName(goal.exercise_name);
    setGoalExerciseName(goal.exercise_name);
    setGoalExerciseCatalogId(null);
    setGoalExerciseCategory(isDuration ? "kardiyo" : null);
    setGoalDuration(isDuration ? String(goal.target_duration_minutes) : "");
    setGoalTarget(!isDuration ? String(goal.target_weight_kg ?? "") : "");
    setGoalReps(!isDuration && goal.target_reps != null ? String(goal.target_reps) : "");
    setGoalFormError(null);
    setIsGoalSheetOpen(true);
  }

  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  const isDurationMode = workoutType === "kardiyo" || workoutType === "esneklik";
  const [exerciseName, setExerciseName] = useState("");
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
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<number>>(new Set());

  function toggleExpandSession(sessionId: number) {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

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

  // Tab bar unmount ETMEDİĞİ için (bkz. [[feedback-rn-tabs-dont-unmount]])
  // sekmeye her odaklanışta yeniden ateşleniyor - bkz. progress.tsx::
  // loadGenerationRef'teki AYNI bulgu/düzeltme (2026-09-21). Yalnızca EN SON
  // çağrının yanıtı state'e yazılır.
  const loadGenerationRef = useRef(0);
  const loadData = useCallback(async () => {
    if (!token) return;
    const myGeneration = (loadGenerationRef.current += 1);
    setLoadError(null);
    try {
      const [summaryData, sessionsData, exerciseGoalsData, weeklyGoalData] = await Promise.all([
        getWorkoutSummary(token, 7),
        getWorkoutSessions(token, 90),
        getExerciseGoals(token),
        // Kart yardımcı bir bileşen - hatası sayfanın geri kalanını düşürmesin.
        getWeeklyGoal(token).catch(() => null),
        loadLoggedExercisesPage(0, true),
        loadHistoryPage(0, true),
      ]);
      if (loadGenerationRef.current !== myGeneration) return;
      setSummary(summaryData);
      setSessions(sessionsData);
      setExerciseGoals(exerciseGoalsData);
      setWeeklyGoal(weeklyGoalData);
    } catch (err) {
      if (loadGenerationRef.current !== myGeneration) return;
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      if (loadGenerationRef.current === myGeneration) setIsLoading(false);
    }
  }, [token, t, loadHistoryPage, loadLoggedExercisesPage]);

  useDebouncedFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Hedef sheet'ten (ya da sohbetten) değişince kartı tazele - profil
  // context'i paylaşımlı, ilerleme ise ayrı bir endpoint.
  const weeklyGoalDays = profile?.weekly_workout_goal_days ?? null;
  useEffect(() => {
    if (!token) return;
    getWeeklyGoal(token)
      .then(setWeeklyGoal)
      .catch(() => {});
  }, [token, weeklyGoalDays]);

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
      // progress.tsx::handleSubmit'in AYNI ilkesi (artık Modal değil, aynı
      // katlanır kart deseni): kaydedince HEMEN katla, başarı banner'ı
      // kapanmış kartın ÜSTÜNDE gösterilir (bkz. JSX'teki `!isLogFormOpen &&
      // formSuccess` koşulu) - eski 700ms'lik "açık kalsın da görülsün"
      // gecikmesine gerek yok.
      setIsLogFormOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function replaceSession(updated: WorkoutSession) {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setHistoryItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function refreshDerivedStats() {
    if (!token) return;
    const [summaryData, exerciseGoalsData] = await Promise.all([
      getWorkoutSummary(token, 7),
      getExerciseGoals(token),
    ]);
    setSummary(summaryData);
    setExerciseGoals(exerciseGoalsData);
  }

  // goals.tsx::handleAddExerciseGoal/handleDeleteExerciseGoal'ün BİREBİR AYNI
  // mantığı - sadece bu sayfanın kendi state adlarına (`goal*`) bağlı.
  async function handleAddExerciseGoal() {
    if (!token) return;
    setGoalFormError(null);

    if (!goalExerciseName.trim()) {
      setGoalFormError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }

    let payload: Parameters<typeof setExerciseGoal>[1];
    if (isGoalDurationMode) {
      const durationNumber = parseLocaleNumber(goalDuration);
      if (!durationNumber || durationNumber <= 0) {
        setGoalFormError(t("Hedef süre sıfırdan büyük olmalı.", "Target duration must be greater than zero."));
        return;
      }
      payload = {
        exercise_name: goalExerciseName.trim(),
        target_duration_minutes: durationNumber,
        exercise_catalog_id: goalExerciseCatalogId ?? undefined,
      };
    } else {
      const targetNumber = parseLocaleNumber(goalTarget);
      if (!targetNumber || targetNumber <= 0) {
        setGoalFormError(t("Hedef ağırlık sıfırdan büyük olmalı.", "Target weight must be greater than zero."));
        return;
      }
      let repsNumber: number | undefined;
      if (goalReps.trim()) {
        repsNumber = parseLocaleNumber(goalReps) ?? undefined;
        if (!repsNumber || repsNumber <= 0) {
          setGoalFormError(t("Hedef tekrar sayısı sıfırdan büyük olmalı.", "Target reps must be greater than zero."));
          return;
        }
      }
      payload = {
        exercise_name: goalExerciseName.trim(),
        target_weight_kg: targetNumber,
        target_reps: repsNumber,
        exercise_catalog_id: goalExerciseCatalogId ?? undefined,
      };
    }

    setIsSavingGoal(true);
    try {
      await setExerciseGoal(token, payload);
      tapSuccess();
      setGoalExerciseName("");
      setGoalTarget("");
      setGoalReps("");
      setGoalDuration("");
      setGoalExerciseCatalogId(null);
      setGoalExerciseCategory(null);
      setEditingGoalName(null);
      await refreshDerivedStats();
      setIsGoalSheetOpen(false);
    } catch (err) {
      setGoalFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingGoal(false);
    }
  }

  async function handleDeleteExerciseGoal(goalId: number) {
    if (!token) return;
    try {
      await deleteExerciseGoal(token, goalId);
      await refreshDerivedStats();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
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

  // Perf taraması ilkesi (2026-09-21, bkz. §9): sabit değer nesneleri
  // `useMemo`'suz her render'da YENİ referans üretip `WorkoutTile`'ın
  // `memo`'sunu geçersiz kılardı.
  const sessionsCountUp = useMemo(() => ({ value: summary?.session_count ?? 0 }), [summary?.session_count]);
  const setsCountUp = useMemo(() => ({ value: summary?.total_sets ?? 0 }), [summary?.total_sets]);
  const volumeCountUp = useMemo(
    () => ({ value: summary?.total_volume_kg ?? 0, decimals: 0, suffix: " kg" }),
    [summary?.total_volume_kg]
  );
  const caloriesCountUp = useMemo(
    () => ({ value: summary?.total_calories_burned ?? 0, decimals: 0, suffix: " kcal" }),
    [summary?.total_calories_burned]
  );

  const panelTotal = 5;
  // Sıralama (2026-09-22, kullanıcı isteği - İlerleme'deki AYNI ilke: önce
  // görsel özet/grafikler, sonra gözat/yönet listeleri, en altta ham
  // geçmiş): hedefler → grafikler → egzersizlerim → geçmiş kayıtlar.
  const tones = {
    goals: stackTone(0, panelTotal),
    typeChart: stackTone(1, panelTotal),
    volumeChart: stackTone(2, panelTotal),
    exercises: stackTone(3, panelTotal),
    history: stackTone(4, panelTotal),
  };

  return (
    // Sekmenin yüzey tonu (kırmızı parıltı + nötr panel, bkz. surface-tone.tsx).
    <SurfaceToneProvider tone={WORKOUT_SURFACE_TONE}>
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenGlow height={460} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} tintColor={c.accent} />}
      >
        <Text style={s.title}>{t("Antrenman", "Workouts")}</Text>

        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <View style={s.statGridRows}>
            <View style={s.statGridRow}>
              <View style={s.statTileEqual}>
                <Skeleton height={124} />
              </View>
              <View style={s.statTileEqual}>
                <Skeleton height={124} />
              </View>
            </View>
            <View style={s.statGridRow}>
              <View style={s.statTileEqual}>
                <Skeleton height={124} />
              </View>
              <View style={s.statTileEqual}>
                <Skeleton height={124} />
              </View>
            </View>
          </View>
        ) : (
          <View style={s.statGridRows}>
            <View style={s.statGridRow}>
              <WorkoutTile
                identity="sessions"
                icon={sessionsTileIcon}
                label={t("Bu Hafta Oturum", "Sessions This Week")}
                value={String(summary?.session_count ?? 0)}
                countUp={sessionsCountUp}
                onPress={tapLight}
                containerStyle={s.statTileEqual}
              />
              <WorkoutTile
                identity="sets"
                icon={setsTileIcon}
                label={t("Bu Hafta Set", "Sets This Week")}
                value={String(summary?.total_sets ?? 0)}
                countUp={setsCountUp}
                onPress={tapLight}
                containerStyle={s.statTileEqual}
              />
            </View>
            <View style={s.statGridRow}>
              <WorkoutTile
                identity="volume"
                icon={volumeTileIcon}
                label={t("Toplam Hacim", "Total Volume")}
                value={`${(summary?.total_volume_kg ?? 0).toFixed(0)} kg`}
                countUp={volumeCountUp}
                onPress={tapLight}
                containerStyle={s.statTileEqual}
              />
              <WorkoutTile
                identity="calories"
                icon={caloriesTileIcon}
                label={t("Yakılan Kalori", "Calories Burned")}
                value={`~${(summary?.total_calories_burned ?? 0).toFixed(0)} kcal`}
                countUp={caloriesCountUp}
                onPress={tapLight}
                containerStyle={s.statTileEqual}
              />
            </View>
          </View>
        )}

        {!isLoading && weeklyGoal ? (
          weeklyGoal.goal_days !== null ? (
            <WeeklyGoalCard goal={weeklyGoal} onEdit={openWeeklyGoalSheet} />
          ) : (
            <WeeklyGoalInvite onPress={openWeeklyGoalSheet} />
          )
        ) : null}

        {!isLoading && summary ? (
          summary.session_count > 0 ? (
            <ProgressInsight title={t("Bu Haftaki Antrenman Özetin", "Your Training Summary This Week")} message={summary.summary_text} tone={WORKOUT_INSIGHT_TONE} />
          ) : (
            <InfoBanner
              message={t(
                "Henüz bu hafta bir antrenman kaydı yok. Yukarıdaki \"Antrenman Kaydet\"e dokunarak ilk kaydını ekleyebilirsin.",
                "No workout logged this week yet. Tap \"Log Workout\" above to add your first entry."
              )}
            />
          )
        ) : null}

        {/* "Antrenman Kaydet" (2026-09-22, ikinci oturum): ÖNCEDEN Modal
            tabanlı bir BottomSheet'ti - cihazda İKİ ayrı deneme (rAF, sonra
            native onShow) sonrasında hâlâ kasıyordu. Kök neden muhtemelen
            Modal'ın kendisi (Android'de ayrı native pencere) - kullanıcı
            isteğiyle İlerleme'nin "Kilo Kaydet" kartıyla AYNI mimariye
            geçildi: Modal YOK, sayfanın kendi akışında açılıp kapanan
            katlanır bir kart (`ProgressFormCard`, artık `accent` override
            alıyor - bkz. progress-cards.tsx notu). FAB (2026-09-22, üçüncü
            oturum) kullanıcı isteğiyle KALDIRILDI - kart zaten sayfanın
            üst kısmında her zaman görünür/erişilebilir, ayrı bir hızlı-erişim
            düğmesine gerek kalmadı; cross-tab tetikleyici (`workoutSheetRequestId`)
            hâlâ çalışıyor, Sohbet'in "+" menüsünden erişim korunuyor. */}
        {!isLogFormOpen && formSuccess ? <SuccessBanner message={formSuccess} /> : null}
        <View
          onLayout={(e) => {
            formYRef.current = e.nativeEvent.layout.y;
            if (pendingFormScrollRef.current) scrollToForm();
          }}
        >
          <ProgressFormCard
            title={t("Antrenman Kaydet", "Log Workout")}
            open={isLogFormOpen}
            accent={workoutIds.sessions}
            onToggle={() => {
              setIsLogFormOpen((open) => !open);
              setFormSuccess(null);
              setFormError(null);
            }}
          >
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

            <View>
              <FormLabel>{t("Antrenman Türü", "Workout Type")}</FormLabel>
              <WorkoutTypeChips value={workoutType} onChange={setWorkoutType} labels={WORKOUT_TYPE_LABELS[language]} />
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

            <Pressable onPress={handleAddSet} style={[s.secondaryButton, { borderColor: workoutIds.sessions }]}>
              <Plus size={16} color={workoutIds.sessions} />
              <Text style={[s.secondaryButtonText, { color: workoutIds.sessions }]}>{t("Sete Ekle", "Add Set")}</Text>
            </Pressable>

            {pendingSets.length > 0 ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: 6 }}>
                {pendingSets.map((set, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    layout={LinearTransition.duration(200)}
                    style={s.pendingRow}
                  >
                    <Text style={s.pendingText}>
                      {set.duration_minutes != null
                        ? `${set.exercise_name} — ${set.duration_minutes} ${t("dk", "min")}${
                            set.intensity ? ` (${INTENSITY_LABELS[language][set.intensity]})` : ""
                          }`
                        : `${set.exercise_name} — ${set.reps} ${t("tekrar", "reps")}${set.weight_kg ? `, ${set.weight_kg} kg` : ""}`}
                    </Text>
                    <Pressable onPress={() => handleRemoveSet(index)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Seti kaldır", "Remove set")}>
                      <X size={16} color={panelMuted} />
                    </Pressable>
                  </Animated.View>
                ))}
              </Animated.View>
            ) : null}

            <PrimaryButton
              onPress={handleSubmit}
              disabled={isSubmitting || pendingSets.length === 0}
              loading={isSubmitting}
              color={workoutIds.sessions}
              textColor="#FFFFFF"
            >
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Oturumu Kaydet", "Save Session")}
            </PrimaryButton>
            {pendingSets.length === 0 ? (
              <Text style={[s.hintText, { color: panelMuted }]}>
                {t(
                  'Kaydetmeden önce en az bir set eklemelisin — yukarıdaki "Sete Ekle"yi kullan.',
                  'You need to add at least one set before saving — use "Add Set" above.'
                )}
              </Text>
            ) : null}
          </ProgressFormCard>
        </View>

        {!isLoading ? (
          <ProgressSectionCard
            title={t("Egzersiz Hedefleri", "Exercise Goals")}
            subtitle={
              exerciseGoals.length > 0
                ? t("Düzenlemek için sağa, silmek için sola kaydır.", "Swipe right to edit, left to delete.")
                : undefined
            }
            {...tones.goals}
          >
            {exerciseGoals.length > 0 ? (
              <ExerciseGoalsList
                goals={exerciseGoals}
                onDelete={handleDeleteExerciseGoal}
                onEdit={handleEditExerciseGoal}
                mutedColor={goalMeterValueColor}
                trackColor={goalTrackColor}
              />
            ) : (
              <EmptyState
                icon={<Target size={28} color={panelMuted} />}
                message={t(
                  "Henüz bir egzersiz hedefi yok. Aşağıdan ekleyebilirsin.",
                  "No exercise goal yet. You can add one below."
                )}
              />
            )}
            <ProgressTextButton onPress={openAddGoalSheet} color={workoutIds.sessions}>
              {t("+ Hedef Ekle", "+ Add Goal")}
            </ProgressTextButton>
          </ProgressSectionCard>
        ) : null}

        {/* Sıralama (2026-09-22, kullanıcı isteği): grafikler artık listelerin
            ÜSTÜNDE - İlerleme'deki "önce görsel özet, sonra liste" düzeniyle
            AYNI ilke. */}
        <ProgressSectionCard title={t("Antrenman Türü Dağılımı", "Workout Type Distribution")} {...tones.typeChart}>
          {isLoading || !chartsReady ? (
            <Skeleton height={260} />
          ) : (
            <>
              <View style={s.rangeRow}>
                <ChipSelect
                  options={RANGE_OPTIONS}
                  value={typeChartRangeDays}
                  onChange={setTypeChartRangeDays}
                  labels={RANGE_LABELS[language]}
                />
              </View>
              <WorkoutTypeChart sessions={typeChartSessions} themeColors={panelChartColors} />
            </>
          )}
        </ProgressSectionCard>

        <ProgressSectionCard title={t("Ağırlık Hacmi Trendi", "Weight Volume Trend")} {...tones.volumeChart}>
          {isLoading || !chartsReady ? (
            <Skeleton height={260} />
          ) : (
            <WorkoutVolumeChart sessions={sessions} themeColors={panelChartColors} accentColor={workoutIds.sessions} />
          )}
        </ProgressSectionCard>

        <ProgressSectionCard
          title={t("Egzersizlerim", "My Exercises")}
          subtitle={t(
            "Bir egzersize dokunarak haftalık/aylık ilerlemeni kendi geçmişinle kıyasla.",
            "Tap an exercise to compare your weekly/monthly progress against your own history."
          )}
          {...tones.exercises}
        >
          {isLoading ? (
            <Skeleton height={100} />
          ) : loggedExercises.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={28} color={panelMuted} />}
              message={t(
                "Henüz bir egzersiz loglamadın. İlk setini kaydedince burada listelenecek.",
                "You haven't logged an exercise yet. It'll appear here once you log your first set."
              )}
            />
          ) : (
            <View style={{ gap: 8 }}>
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
                    <Text style={[s.exerciseRowMeta, { color: panelMuted }]}>
                      {t(`${exercise.set_count} set`, `${exercise.set_count} sets`)}
                    </Text>
                    <ChevronRight size={16} color={panelMuted} />
                  </View>
                </Pressable>
              ))}
              {hasMoreLoggedExercises ? (
                <ProgressTextButton
                  onPress={handleLoadMoreLoggedExercises}
                  disabled={isLoadingMoreLoggedExercises}
                  loading={isLoadingMoreLoggedExercises}
                  color={workoutIds.sessions}
                >
                  {t("Daha Fazla Göster", "Show More")}
                </ProgressTextButton>
              ) : null}
            </View>
          )}
        </ProgressSectionCard>

        <ProgressSectionCard
          title={t("Geçmiş Kayıtlar", "History")}
          subtitle={t("Düzenlemek için sağa, silmek için sola kaydır.", "Swipe right to edit, left to delete.")}
          {...tones.history}
        >
          {historyError ? <ErrorBanner message={historyError} /> : null}
          {isLoading ? (
            <Skeleton height={140} />
          ) : historyItems.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={28} color={panelMuted} />}
              message={t(
                "Henüz bir antrenman kaydı yok. Yukarıdaki \"Antrenman Kaydet\"e dokunarak ilk kaydını ekleyebilirsin.",
                "No workout logged yet. Tap \"Log Workout\" above to add your first entry."
              )}
            />
          ) : (
            <View style={{ gap: 16 }}>
              {groupEntriesByDate(historyItems, (session) => session.session_date, language).map((group) => (
                <View key={group.label} style={{ gap: 12 }}>
                  <Text style={[s.groupLabel, { color: panelMuted }]}>{toLocaleUpper(group.label, language)}</Text>
                  {group.items.map((session) => (
                    <SwipeableRow
                      key={session.id}
                      onDelete={() => handleDeleteSession(session.id)}
                      onEdit={() => handleStartEditSession(session)}
                    >
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
                              <Pressable onPress={() => handleSaveSession(session.id)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Kaydet", "Save")}>
                                <Check size={18} color={c.success} />
                              </Pressable>
                              <Pressable onPress={() => setEditingSessionId(null)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("İptal", "Cancel")}>
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
                            <Pressable onPress={() => handleStartEditSession(session)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Düzenle", "Edit")}>
                              <Pencil size={16} color={panelMuted} />
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
                              <SwipeableRow
                                key={set.id}
                                onDelete={() => handleDeleteSet(session.id, set.id)}
                                onEdit={() => handleStartEditSet(set)}
                              >
                                <View style={s.setRow}>
                                  {editingSetId === set.id ? (
                                    isDurationSet ? (
                                      <View style={s.setEditRow}>
                                        <Text style={[s.setEditName, { color: panelMuted }]}>{set.exercise_name_snapshot}</Text>
                                        <FormInput
                                          value={editDuration}
                                          onChangeText={setEditDuration}
                                          keyboardType="number-pad"
                                          style={{ width: 56 }}
                                        />
                                        <Text style={[s.setEditUnit, { color: panelMuted }]}>{t("dk", "min")}</Text>
                                        <ChipSelect
                                          options={INTENSITIES}
                                          value={editIntensity}
                                          onChange={setEditIntensity}
                                          labels={INTENSITY_LABELS[language]}
                                        />
                                        <Pressable onPress={() => handleSaveSet(session.id, set.id, true)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Kaydet", "Save")}>
                                          <Check size={16} color={c.success} />
                                        </Pressable>
                                        <Pressable onPress={() => setEditingSetId(null)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("İptal", "Cancel")}>
                                          <X size={16} color={c.error} />
                                        </Pressable>
                                      </View>
                                    ) : (
                                      <View style={s.setEditRow}>
                                        <Text style={[s.setEditName, { color: panelMuted }]}>{set.exercise_name_snapshot}</Text>
                                        <FormInput
                                          value={editReps}
                                          onChangeText={setEditReps}
                                          keyboardType="number-pad"
                                          style={{ width: 56 }}
                                        />
                                        <Text style={[s.setEditUnit, { color: panelMuted }]}>{t("tekrar", "reps")}</Text>
                                        <FormInput
                                          value={editWeight}
                                          onChangeText={setEditWeight}
                                          keyboardType="numeric"
                                          placeholder={t("kg", "kg")}
                                          style={{ width: 64 }}
                                        />
                                        <Pressable onPress={() => handleSaveSet(session.id, set.id, false)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Kaydet", "Save")}>
                                          <Check size={16} color={c.success} />
                                        </Pressable>
                                        <Pressable onPress={() => setEditingSetId(null)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("İptal", "Cancel")}>
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
                                          <View
                                            style={[
                                              s.recordBadge,
                                              {
                                                backgroundColor: `${workoutIds.sessions}${isDark ? "3D" : "1F"}`,
                                                borderColor: `${workoutIds.sessions}${isDark ? "99" : "55"}`,
                                              },
                                            ]}
                                          >
                                            <Trophy size={12} color={workoutIds.sessions} />
                                            <Text style={[s.recordText, { color: workoutIds.sessions }]}>{t("Rekor", "Record")}</Text>
                                          </View>
                                        ) : null}
                                      </View>
                                      <Pressable onPress={() => handleStartEditSet(set)} style={s.iconHit} accessibilityRole="button" accessibilityLabel={t("Düzenle", "Edit")}>
                                        <Pencil size={14} color={panelMuted} />
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
                            <Text style={[s.expandSessionText, { color: workoutIds.sessions }]}>
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
                <ProgressTextButton
                  onPress={handleLoadMoreHistory}
                  disabled={isLoadingMoreHistory}
                  loading={isLoadingMoreHistory}
                  color={workoutIds.sessions}
                >
                  {t("Daha Fazla Göster", "Show More")}
                </ProgressTextButton>
              ) : null}
            </View>
          )}
        </ProgressSectionCard>
      </ScrollView>

      <WeeklyGoalSheet visible={isWeeklyGoalSheetOpen} onClose={closeWeeklyGoalSheet} />

      <BottomSheet
        visible={isGoalSheetOpen}
        onClose={() => {
          setIsGoalSheetOpen(false);
          setEditingGoalName(null);
        }}
        backgroundColor={isDark ? rampColorOf(WORKOUT_SURFACE_TONE.ramp, 1) : c.surface}
        handleColor={isDark ? "rgba(255,255,255,0.35)" : c.border}
      >
        <View style={s.sheetHeader}>
          <View style={[s.sheetIconCircle, { backgroundColor: `${workoutIds.sessions}26`, borderColor: `${workoutIds.sessions}66` }]}>
            <Target size={20} color={workoutIds.sessions} strokeWidth={2.3} />
          </View>
          <Text style={s.sheetTitle}>
            {editingGoalName ? t("Egzersiz Hedefini Düzenle", "Edit Exercise Goal") : t("Egzersiz Hedefi Ekle", "Add Exercise Goal")}
          </Text>
        </View>
        {goalFormError ? <ErrorBanner message={goalFormError} /> : null}

        <View>
          <FormLabel>{t("Egzersiz", "Exercise")}</FormLabel>
          {editingGoalName ? (
            // Düzenlerken egzersiz adı KİLİTLİ - backend upsert aynı ada göre
            // eşleştiriyor (bkz. dosya başındaki not), ad değişirse GÜNCELLEME
            // değil YENİ bir hedef oluşur, eskisi öksüz kalır.
            <View style={s.lockedField}>
              <Text style={[s.lockedFieldText, { color: isDark ? "#FFFFFF" : c.text }]}>{goalExerciseName}</Text>
            </View>
          ) : (
            <SearchableSelect<ExerciseCatalogItem>
              selectedLabel={goalExerciseName}
              onQueryChange={(value) => {
                setGoalExerciseName(value);
                setGoalExerciseCatalogId(null);
                setGoalExerciseCategory(null);
              }}
              onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
              onSelect={(item) => {
                setGoalExerciseName(catalogDisplayName(item, language));
                setGoalExerciseCatalogId(item.id);
                setGoalExerciseCategory(item.category_tr);
              }}
              getLabel={(item) => catalogDisplayName(item, language)}
              getKey={(item) => item.id}
              placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
            />
          )}
        </View>

        {isGoalDurationMode ? (
          <View>
            <FormLabel>{t("Hedef Süre (dakika)", "Target Duration (min)")}</FormLabel>
            <Stepper value={goalDuration} onChangeText={setGoalDuration} step={5} min={0} />
          </View>
        ) : (
          <View style={s.repsWeightRow}>
            <View style={{ flex: 1 }}>
              <FormLabel>{t("Hedef (kg)", "Target (kg)")}</FormLabel>
              <Stepper value={goalTarget} onChangeText={setGoalTarget} step={2.5} min={0} allowDecimal />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel>{t("Hedef Tekrar (opsiyonel)", "Target Reps (optional)")}</FormLabel>
              <Stepper
                value={goalReps}
                onChangeText={setGoalReps}
                step={1}
                min={0}
                placeholder={t("opsiyonel", "optional")}
              />
            </View>
          </View>
        )}

        <PrimaryButton
          onPress={handleAddExerciseGoal}
          disabled={isSavingGoal}
          loading={isSavingGoal}
          color={workoutIds.sessions}
          textColor="#FFFFFF"
        >
          {isSavingGoal
            ? t("Kaydediliyor...", "Saving...")
            : editingGoalName
              ? t("Hedefi Güncelle", "Update Goal")
              : t("Hedefi Kaydet", "Save Goal")}
        </PrimaryButton>
      </BottomSheet>
    </SafeAreaView>
    </SurfaceToneProvider>
  );
}

function makeStyles(c: ThemeColors, insetBottom: number, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 16, paddingBottom: 32 + getFloatingTabBarClearance(insetBottom) },
    // İlerleme'yle AYNI başlık tipografisi (bkz. progress.tsx::title notu) -
    // sayfa başlığı Inter Medium 30, eski 22/700Bold'un yerine.
    title: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 4,
    },
    sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    sheetIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: isDark ? "#FFFFFF" : c.text, flex: 1 },
    lockedField: {
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.15)" : c.border,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    lockedFieldText: { fontSize: 15, fontFamily: "Inter_500Medium" },
    rangeRow: { alignItems: "flex-start", marginBottom: 10 },
    statGridRows: { gap: 10 },
    statGridRow: { flexDirection: "row", gap: 10 },
    // İlerleme'deki AYNI kesin 50/50 ızgara çözümü (bkz. progress.tsx::
    // statTileEqual notu - flexBasis:0+flexGrow:1+minWidth:0).
    statTileEqual: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
    groupLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.4,
    },
    exerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    exerciseRowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: isDark ? "#FFFFFF" : c.text, flexShrink: 1 },
    exerciseRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    exerciseRowMeta: { fontSize: 12 },
    repsWeightRow: { flexDirection: "row", gap: 10 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
    },
    secondaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(245,162,107,0.12)",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    pendingText: { fontSize: 13, color: isDark ? "#FFFFFF" : c.text, flex: 1 },
    hintText: { fontSize: 12 },
    sessionCard: {
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      padding: 12,
    },
    sessionEditRow: { gap: 8 },
    sessionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sessionHeaderText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: isDark ? "#FFFFFF" : c.text,
      flex: 1,
      marginRight: 8,
    },
    // Düzenle/sil/kaydet/iptal ikon butonları: önceden 15px ikon + hitSlop 8
    // (~31px) - 44pt minimumun altındaydı, hitSlop büyütmek de yan yana
    // duran butonların alanlarını ÇAKIŞTIRIRDI (yanlışlıkla sil). Sabit 44x44
    // kutu çakışmaz; negatif dikey marj satır yüksekliğini değiştirmez.
    iconRow: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: -10 },
    iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginVertical: -10 },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    setEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    setEditName: { fontSize: 12 },
    setEditUnit: { fontSize: 11 },
    setLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
    setText: { fontSize: 13, color: isDark ? "#FFFFFF" : c.text },
    // Kullanıcı bulgusu (2026-09-22, üçüncü oturum): "Rekor" rozeti çok
    // soluktu - kök neden İKİ KATLIYDI: (1) dolgu alfası çok düşüktü (%12-18)
    // VE kenarlık YOKTU, (2) yazı 10px'ti - tasarım dilinin kendi kuralı
    // (§2: "küçük yazı ≥11-13px, 10px kullanma") burada ihlal edilmişti.
    // Artık chip formülü (`${hex}xx` dolgu + `${hex}xx` kenarlık, bkz.
    // reference-pulsecoach-design-language §2) JSX'te workoutIds.sessions'tan
    // hesaplanıyor, yazı 11px+Bold oldu.
    recordBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    recordText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    expandSessionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.accent },
  });
}
