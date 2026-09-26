import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { AlertTriangle, Apple, Camera, Check, Image as ImageIcon, Pencil, Plus, Search, X } from "lucide-react-native";
import {
  ApiError,
  MEAL_TYPES,
  analyzeMealPhoto,
  deleteMealEntry,
  deletePhotoHistoryEntry,
  getDailyNutritionSummary,
  getMealEntries,
  getPhotoHistory,
  localDateKey,
  logMealEntry,
  searchFoods,
  updateMealEntry,
  type DailyNutritionSummary,
  type FoodCatalogItem,
  type MealEntry,
  type MealPhoto,
  type MealType,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { parseLocaleNumber, toLocaleUpper } from "@/lib/format";
import {
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  PrimaryButton,
  Skeleton,
  SuccessBanner,
  type ThemeColors,
  TypingIndicator,
  useThemeColors,
} from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { Stepper } from "@/components/stepper";
import { SwipeableRow } from "@/components/swipeable-row";
import { MacroDistributionChart } from "@/components/charts/macro-distribution-chart";
import { DailyCalorieChart } from "@/components/charts/daily-calorie-chart";
import { ProgressFormCard, ProgressInsight, ProgressSectionCard, ProgressTextButton, stackTone } from "@/components/progress-cards";
import { ScreenGlow } from "@/components/screen-glow";
import { NUTRITION_SURFACE_TONE, SurfaceToneProvider } from "@/components/surface-tone";
import {
  FoodPreview,
  MEAL_TYPE_LABELS,
  MealTypeChips,
  MealTypeIcon,
  NutritionHeroCard,
  SegmentToggle,
  mealTypeForNow,
} from "@/components/nutrition-cards";
import { NutritionGoalSheet } from "@/components/nutrition-goal-sheet";
import {
  NUTRITION_INSIGHT_TONE,
  useCalorieOverColor,
  useNutrientColors,
  useNutritionAccent,
  useNutritionFill,
} from "@/components/nutrition-identity";
import { useQuickAdd } from "@/lib/quick-add-context";
import { useProfile } from "@/lib/profile-context";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { makeStyles } from "@/components/nutrition-styles";
import { buildTodayInsight, EntryNutrientBreakdown, fmt, PhotoHistoryThumbnail, reviewItemFromDetected, type PhotoReviewItem } from "@/components/nutrition-tab-parts";

// web/src/app/(app)/nutrition/page.tsx'in mobil portu (Faz M4).
//
// Tasarım turu (2026-09-24): sayfa [[reference-pulsecoach-design-language]]'a
// göre yeniden yapıldı - İlerleme/Antrenman'la AYNI cam/panel dili
// (progress-cards.tsx'ten ProgressSectionCard/ProgressFormCard/stackTone),
// ama kendi ALTIN kimliğiyle (nutrition-identity.ts / nutrition-cards.tsx):
// - 6 ayrı istatistik kutusu + "Günlük Hedef Karşılaştırma" kartı -> TEK
//   "Bugün" kartı (kalori halkası + makro çubukları + lif/şeker/sodyum).
// - "Öğün Kaydet" ve "Fotoğrafla Ekle" iki ayrı sabit kart yerine TEK katlanır
//   form (İlerleme'nin Kilo Kaydet deseni, Modal YOK) + içinde mod seçimi.
// - Bugünün kayıtları öğün türüne göre gruplu ("Bugünkü Öğünler"), boş öğünden
//   tek dokunuşla o öğüne kayıt; eski kayıtlar ayrı "Geçmiş Kayıtlar"da.
// - Kalori Trendi takvime ölçekli günlük çubuk + hedef çizgisi (bkz.
//   daily-calorie-chart.tsx).
// "A katmanı" (odaklanışta replay eden `Reveal` girişleri) BAŞTAN kaldırıldı
// (§6/§9 perf dersleri): içerik veri gelince ANINDA son haliyle görünür.


// Geçmiş listesi kademeli yüklenir (2026-08-14 kullanıcı isteği: uzun liste
// mobilde bunaltıcıydı). Bugünün kayıtları artık "Bugünkü Öğünler"de - geçmiş
// yalnızca önceki günleri gösterir, sayfa boyutu bu yüzden biraz büyütüldü.
const HISTORY_PAGE_SIZE = 8;

const CALORIE_RANGES = ["7", "14", "30"] as const;
type CalorieRange = (typeof CALORIE_RANGES)[number];
const CALORIE_RANGE_LABELS: Record<PreferredLanguage, Record<CalorieRange, string>> = {
  tr: { "7": "7 gün", "14": "14 gün", "30": "30 gün" },
  en: { "7": "7 days", "14": "14 days", "30": "30 days" },
};

type LogMode = "search" | "photo";


export default function NutritionTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const nutrientColors = useNutrientColors();
  const accent = useNutritionAccent();
  const overColor = useCalorieOverColor();
  const insets = useSafeAreaInsets();
  // Koyu modda paneller sıcak kahve - ortak `c.muted` (soğuk teal-gri) bu
  // zeminde soluk kalıyor (İlerleme/Antrenman'daki AYNI bulgu).
  const panelMuted = isDark ? "rgba(255,255,255,0.78)" : c.muted;
  const panelBorder = isDark ? "rgba(255,255,255,0.15)" : c.border;
  const panelChartColors: ThemeColors = useMemo(
    () => ({ ...c, muted: panelMuted, border: panelBorder, text: isDark ? "#FFFFFF" : c.text }),
    [c, panelMuted, panelBorder, isDark]
  );
  // Büyük yüzeyler (düğme, form "+" dairesi) kimliğin DOLGU rolünde: iki
  // temada da parlak bal üstünde koyu metin (bkz. nutrition-identity.ts).
  const { fill: accentFill, onFill: onAccent } = useNutritionFill();
  const s = useMemo(() => makeStyles(c, insets.bottom, isDark), [c, insets.bottom, isDark]);

  const [summary, setSummary] = useState<DailyNutritionSummary | null>(null);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Perf ilkesi (bkz. workouts.tsx::chartsReady): ilk (soğuk) yüklemede grafik
  // panellerini bir kare ertele - bir kez true olunca BİR DAHA sıfırlanmaz.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (chartsReady) return;
    const raf = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(raf);
  }, [chartsReady]);

  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false);
  const openGoalSheet = useCallback(() => setIsGoalSheetOpen(true), []);
  const closeGoalSheet = useCallback(() => setIsGoalSheetOpen(false), []);

  // "Öğün Kaydet" - İlerleme'nin "Kilo Kaydet" kartıyla AYNI katlanır desen
  // (Modal YOK, bkz. workouts.tsx::isLogFormOpen notundaki cihaz kasması dersi).
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [logMode, setLogMode] = useState<LogMode>("search");
  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [mealType, setMealType] = useState<MealType>(() => mealTypeForNow());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<PhotoReviewItem[]>([]);
  const [photoHistory, setPhotoHistory] = useState<MealPhoto[]>([]);
  const [photoHistoryError, setPhotoHistoryError] = useState<string | null>(null);

  const [calorieRange, setCalorieRange] = useState<CalorieRange>("14");

  // "Geçmiş Kayıtlar" için BAĞIMSIZ, sayfalı veri akışı - grafiği besleyen
  // `entries`/getMealEntries(token, 30)'dan KASITLI OLARAK ayrı (2026-08-14).
  const [historyItems, setHistoryItems] = useState<MealEntry[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const formYRef = useRef(0);
  const pendingFormScrollRef = useRef(false);
  const scrollToForm = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(formYRef.current - 16, 0), animated: true });
  }, []);

  const openForm = useCallback(
    (preset?: MealType) => {
      setIsFormOpen(true);
      setLogMode("search");
      setMealType(preset ?? mealTypeForNow());
      setFormError(null);
      setFormSuccess(null);
      pendingFormScrollRef.current = true;
      setTimeout(scrollToForm, 200);
      setTimeout(() => {
        pendingFormScrollRef.current = false;
      }, 3000);
    },
    [scrollToForm]
  );

  // Sohbet "+" menüsünden "Beslenme Ekle" (cross-tab) - progress.tsx'teki
  // `weightFormRequestId` efektiyle AYNI mantık.
  const { mealFormRequestId } = useQuickAdd();
  useEffect(() => {
    if (mealFormRequestId === 0) return;
    openForm();
  }, [mealFormRequestId, openForm]);

  const loadHistoryPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (!token) return;
      const page = await getMealEntries(token, undefined, HISTORY_PAGE_SIZE, offset);
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

  // Tab bar unmount ETMEDİĞİ için her odaklanışta yeniden ateşlenir - yalnızca
  // EN SON çağrının yanıtı state'e yazılır (bkz. progress.tsx::loadGenerationRef).
  const loadGenerationRef = useRef(0);
  const loadData = useCallback(async () => {
    if (!token) return;
    const myGeneration = (loadGenerationRef.current += 1);
    setLoadError(null);
    try {
      const [summaryData, entriesData, photoHistoryData] = await Promise.all([
        getDailyNutritionSummary(token),
        getMealEntries(token, 30),
        // Galeri yardımcı bir bölüm - hatası sayfanın geri kalanını düşürmesin.
        getPhotoHistory(token).catch(() => null),
        loadHistoryPage(0, true),
      ]);
      if (loadGenerationRef.current !== myGeneration) return;
      setSummary(summaryData);
      setEntries(entriesData);
      if (photoHistoryData) setPhotoHistory(photoHistoryData);
    } catch (err) {
      if (loadGenerationRef.current !== myGeneration) return;
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      if (loadGenerationRef.current === myGeneration) setIsLoading(false);
    }
  }, [token, t, loadHistoryPage]);

  useDebouncedFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Hedefler sheet'ten (ya da Profil/sohbetten) değişince "Bugün" kartındaki
  // hedefler de tazelensin - hedefler özet uç noktasından geliyor.
  const { profile } = useProfile();
  const goalsSignature = profile
    ? `${profile.daily_calorie_goal}|${profile.daily_protein_goal_g}|${profile.daily_carbs_goal_g}|${profile.daily_fat_goal_g}`
    : "";
  const lastGoalsSignature = useRef(goalsSignature);
  useEffect(() => {
    if (!token || goalsSignature === lastGoalsSignature.current) return;
    lastGoalsSignature.current = goalsSignature;
    getDailyNutritionSummary(token)
      .then(setSummary)
      .catch(() => {});
  }, [token, goalsSignature]);

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!selectedFood) {
      setFormError(
        t(
          "Listeden bir besin seçmelisin (kalori/makro hesaplaması için gerekli).",
          "You need to pick a food from the list (required to calculate calories/macros)."
        )
      );
      return;
    }
    const quantityNumber = parseLocaleNumber(quantity);
    if (!quantityNumber || quantityNumber <= 0) {
      setFormError(t("Miktar (gram) sıfırdan büyük olmalı.", "Quantity (grams) must be greater than zero."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logMealEntry(token, {
        food_catalog_id: selectedFood.id,
        quantity_grams: quantityNumber,
        meal_type: mealType,
      });
      tapSuccess();
      const savedName = catalogDisplayName(selectedFood, language);
      setFormSuccess(
        t(
          `${savedName} ${MEAL_TYPE_LABELS.tr[mealType].toLocaleLowerCase("tr-TR")} öğününe eklendi.`,
          `${savedName} added to ${MEAL_TYPE_LABELS.en[mealType].toLowerCase()}.`
        )
      );
      setSelectedFood(null);
      setFoodQuery("");
      setQuantity("100");
      // Form AÇIK kalır (Antrenman'ın aksine): bir öğün genelde birden çok
      // besinden oluşuyor (ekmek + peynir + çay) - her kayıttan sonra katlanıp
      // yeniden açmak gereksiz adım olurdu. Öğün türü de korunur.
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEditEntry(entry: MealEntry) {
    setEditingEntryId(entry.id);
    setEditQuantity(String(entry.quantity_grams));
  }

  async function handleSaveEntry(entryId: number) {
    if (!token) return;
    setHistoryError(null);
    const grams = parseLocaleNumber(editQuantity);
    if (!grams || grams <= 0) {
      setHistoryError(t("Miktar (gram) sıfırdan büyük olmalı.", "Quantity (grams) must be greater than zero."));
      return;
    }
    try {
      await updateMealEntry(token, entryId, { quantity_grams: grams });
      setEditingEntryId(null);
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  async function handleDeleteEntry(entryId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteMealEntry(token, entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setHistoryItems((prev) => prev.filter((e) => e.id !== entryId));
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  async function analyzePickedPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!token) return;
    setPhotoError(null);
    setReviewItems([]);
    setPhotoUri(asset.uri);
    setIsAnalyzingPhoto(true);
    try {
      const result = await analyzeMealPhoto(token, {
        uri: asset.uri,
        name: asset.fileName ?? "meal.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      setReviewItems(result.items.map((item, index) => reviewItemFromDetected(item, index, language, mealType)));
      if (result.items.length === 0) {
        setPhotoError(
          t(
            "Fotoğrafta tanınabilir bir besin bulunamadı. Farklı bir fotoğraf deneyebilir ya da elle ekleyebilirsin.",
            "No recognizable food was found in the photo. You can try a different photo or add it manually."
          )
        );
      }
      const updatedHistory = await getPhotoHistory(token);
      setPhotoHistory(updatedHistory);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : t("Fotoğraf analiz edilemedi, tekrar dener misin?", "Couldn't analyze photo, want to try again?"));
    } finally {
      setIsAnalyzingPhoto(false);
    }
  }

  async function handlePickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(t("Kamera izni verilmedi — ayarlardan izin vermen gerekiyor.", "Camera permission not granted — you need to allow it from settings."));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) await analyzePickedPhoto(result.assets[0]);
  }

  async function handlePickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(t("Galeri izni verilmedi — ayarlardan izin vermen gerekiyor.", "Gallery permission not granted — you need to allow it from settings."));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) await analyzePickedPhoto(result.assets[0]);
  }

  function handleClearPhotoReview() {
    setPhotoUri(null);
    setReviewItems([]);
    setPhotoError(null);
  }

  function updateReviewItem(key: string, patch: Partial<PhotoReviewItem>) {
    setReviewItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function handleSaveReviewItem(key: string) {
    if (!token) return;
    const item = reviewItems.find((i) => i.key === key);
    if (!item) return;

    if (!item.selectedFood) {
      updateReviewItem(key, { error: t("Listeden bir besin seçmelisin.", "You need to pick a food from the list.") });
      return;
    }
    const gramsNumber = parseLocaleNumber(item.grams);
    if (!gramsNumber || gramsNumber <= 0) {
      updateReviewItem(key, { error: t("Miktar (gram) sıfırdan büyük olmalı.", "Quantity (grams) must be greater than zero.") });
      return;
    }

    updateReviewItem(key, { error: null });
    try {
      await logMealEntry(token, {
        food_catalog_id: item.selectedFood.id,
        quantity_grams: gramsNumber,
        meal_type: item.mealType,
      });
      tapSuccess();
      setReviewItems((prev) => prev.filter((i) => i.key !== key));
      await loadData();
    } catch (err) {
      updateReviewItem(key, {
        error: err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"),
      });
    }
  }

  function handleDiscardReviewItem(key: string) {
    setReviewItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleDeletePhotoHistoryEntry(photoId: number) {
    if (!token) return;
    setPhotoHistoryError(null);
    try {
      await deletePhotoHistoryEntry(token, photoId);
      setPhotoHistory((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      setPhotoHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  // Bugün = kullanıcının YEREL günü (bkz. CLAUDE.md "user-local dates");
  // `entries` son 30 günü kapsıyor.
  const todayKey = localDateKey();
  const todayEntries = useMemo(() => entries.filter((e) => e.log_date === todayKey), [entries, todayKey]);
  const mealGroups = useMemo(
    () =>
      MEAL_TYPES.map((type) => {
        const items = todayEntries.filter((e) => e.meal_type === type);
        return { type, items, kcal: items.reduce((sum, e) => sum + e.calories_kcal, 0) };
      }),
    [todayEntries]
  );
  const olderHistory = useMemo(() => historyItems.filter((e) => e.log_date !== todayKey), [historyItems, todayKey]);
  // Gün toplamı TAM veriden: geçmiş sayfalı yüklendiği için bir günün yalnızca
  // bir kısmı yüklenmiş olabilir - yüklenenlerden toplamak yanlış (düşük)
  // toplam gösteriyordu (canlı testte "31 Ağustos: 75 kcal" görüldü). `entries`
  // son 30 günü eksiksiz taşıyor; daha eski günde yalnızca yüklenenlerin
  // toplamı gösterilir ve "≥" ile işaretlenir.
  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.log_date, (map.get(e.log_date) ?? 0) + e.calories_kcal);
    return map;
  }, [entries]);
  const oldestFullDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return localDateKey(d);
  }, []);
  const insight = useMemo(() => (summary ? buildTodayInsight(todayEntries, summary, t) : null), [todayEntries, summary, t]);

  const quantityNumber = parseLocaleNumber(quantity);
  const logModeOptions = useMemo(
    () =>
      [
        { key: "search" as const, label: t("Listeden Ara", "Search"), icon: (color: string) => <Search size={15} color={color} /> },
        { key: "photo" as const, label: t("Fotoğrafla", "From Photo"), icon: (color: string) => <Camera size={15} color={color} /> },
      ],
    [t]
  );
  const calorieRangeOptions = useMemo(
    () => CALORIE_RANGES.map((key) => ({ key, label: CALORIE_RANGE_LABELS[language][key] })),
    [language]
  );

  const panelTotal = 5;
  // Sıralama (İlerleme/Antrenman'daki ilke): önce bugün + görsel özet, sonra
  // ham geçmiş/galeri.
  const tones = {
    today: stackTone(0, panelTotal),
    trend: stackTone(1, panelTotal),
    macro: stackTone(2, panelTotal),
    history: stackTone(3, panelTotal),
    photos: stackTone(4, panelTotal),
  };

  function renderEntryRow(entry: MealEntry, showMealType: boolean) {
    const isEditing = editingEntryId === entry.id;
    return (
      <SwipeableRow key={entry.id} onDelete={() => handleDeleteEntry(entry.id)} onEdit={() => handleStartEditEntry(entry)}>
        <View style={s.entryRow}>
          {isEditing ? (
            <View style={s.entryEditRow}>
              <Text style={s.entryName} numberOfLines={1}>
                {entry.food_name_snapshot}
              </Text>
              <View style={s.entryEditControls}>
                <FormInput
                  value={editQuantity}
                  onChangeText={setEditQuantity}
                  keyboardType="numeric"
                  style={{ width: 76 }}
                  accessibilityLabel={t("Miktar (gram)", "Quantity (grams)")}
                />
                <Text style={[s.entryUnit, { color: panelMuted }]}>g</Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => handleSaveEntry(entry.id)}
                  style={s.iconHit}
                  accessibilityRole="button"
                  accessibilityLabel={t("Kaydet", "Save")}
                >
                  <Check size={18} color={c.success} />
                </Pressable>
                <Pressable
                  onPress={() => setEditingEntryId(null)}
                  style={s.iconHit}
                  accessibilityRole="button"
                  accessibilityLabel={t("İptal", "Cancel")}
                >
                  <X size={18} color={c.error} />
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.entryName}>
                  {entry.food_name_snapshot}
                  {showMealType ? (
                    <Text style={[s.entryMealTag, { color: panelMuted }]}>
                      {"  "}
                      {MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type}
                    </Text>
                  ) : null}
                </Text>
                <Text style={[s.entryMeta, { color: panelMuted }]}>
                  {fmt(entry.quantity_grams)} g ·{" "}
                  <Text style={{ color: accent, fontFamily: "Inter_700Bold" }}>{fmt(entry.calories_kcal)} kcal</Text>
                </Text>
                <Text style={[s.entryNutrients, { color: panelMuted }]}>
                  <EntryNutrientBreakdown entry={entry} t={t} nutrientColors={nutrientColors} />
                </Text>
              </View>
              <Pressable
                onPress={() => handleStartEditEntry(entry)}
                style={s.iconHit}
                accessibilityRole="button"
                accessibilityLabel={t(`${entry.food_name_snapshot} miktarını düzenle`, `Edit ${entry.food_name_snapshot} quantity`)}
              >
                <Pencil size={15} color={panelMuted} />
              </Pressable>
            </>
          )}
        </View>
      </SwipeableRow>
    );
  }

  return (
    // Sekmenin yüzey tonu (zeytin parıltı + nötr panel, bkz. surface-tone.tsx) -
    // sheet'ler de bu ağacın içinde render olduğu için aynı tonu alır.
    <SurfaceToneProvider tone={NUTRITION_SURFACE_TONE}>
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenGlow height={460} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} tintColor={accent} />}
        >
          <Text style={s.title}>{t("Beslenme", "Nutrition")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {isLoading || !summary ? (
            <Skeleton height={300} />
          ) : (
            <NutritionHeroCard summary={summary} onEditGoals={openGoalSheet} />
          )}

          {!isLoading && insight ? <ProgressInsight title={t("Bugünün Özeti", "Today at a Glance")} message={insight} tone={NUTRITION_INSIGHT_TONE} /> : null}

          {!isFormOpen && formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          <View
            onLayout={(e) => {
              formYRef.current = e.nativeEvent.layout.y;
              if (pendingFormScrollRef.current) scrollToForm();
            }}
          >
            <ProgressFormCard
              title={t("Öğün Kaydet", "Log Meal")}
              open={isFormOpen}
              accent={accentFill}
              onAccent={onAccent}
              onToggle={() => {
                tapLight();
                if (!isFormOpen) setMealType(mealTypeForNow());
                setIsFormOpen((open) => !open);
                setFormSuccess(null);
                setFormError(null);
              }}
            >
              <SegmentToggle
                options={logModeOptions}
                value={logMode}
                onChange={setLogMode}
              />

              {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
              {formError ? <ErrorBanner message={formError} /> : null}

              <View>
                <FormLabel>{t("Öğün", "Meal")}</FormLabel>
                <MealTypeChips value={mealType} onChange={setMealType} labels={MEAL_TYPE_LABELS[language]} />
              </View>

              {logMode === "search" ? (
                <>
                  <View>
                    <FormLabel>{t("Besin", "Food")}</FormLabel>
                    <SearchableSelect<FoodCatalogItem>
                      selectedLabel={foodQuery}
                      onQueryChange={(value) => {
                        setFoodQuery(value);
                        setSelectedFood(null);
                      }}
                      onSearch={(query) => (token ? searchFoods(token, query) : Promise.resolve([]))}
                      onSelect={(item) => {
                        setSelectedFood(item);
                        setFoodQuery(catalogDisplayName(item, language));
                      }}
                      getLabel={(item) => catalogDisplayName(item, language)}
                      getKey={(item) => item.id}
                      placeholder={t("Besin adı yaz...", "Type food name...")}
                    />
                  </View>

                  <View>
                    <FormLabel>{t("Miktar (g)", "Quantity (g)")}</FormLabel>
                    <Stepper value={quantity} onChangeText={setQuantity} step={25} min={0} />
                  </View>

                  {selectedFood && quantityNumber > 0 ? <FoodPreview food={selectedFood} grams={quantityNumber} /> : null}

                  <PrimaryButton
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    color={accentFill}
                    textColor={onAccent}
                  >
                    {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Öğüne Ekle", "Add to Meal")}
                  </PrimaryButton>
                </>
              ) : (
                <>
                  <Text style={[s.hintText, { color: panelMuted }]}>
                    {t(
                      "Koçun fotoğraftaki besinleri tanıyıp porsiyon tahmin eder. Gramajlar tahmindir (özellikle yağ/sos) - kaydetmeden önce düzeltebilirsin.",
                      "Your coach recognizes the foods and estimates portions. Grams are estimates (especially oil/sauce) - you can fix them before saving."
                    )}
                  </Text>
                  <View style={s.row}>
                    <Pressable onPress={handlePickFromCamera} style={[s.outlineButton, { borderColor: `${accent}B3` }]} accessibilityRole="button">
                      <Camera size={16} color={accent} />
                      <Text style={[s.outlineButtonText, { color: accent }]}>{t("Kameradan Çek", "Take Photo")}</Text>
                    </Pressable>
                    <Pressable onPress={handlePickFromLibrary} style={[s.outlineButton, { borderColor: `${accent}B3` }]} accessibilityRole="button">
                      <ImageIcon size={16} color={accent} />
                      <Text style={[s.outlineButtonText, { color: accent }]}>{t("Galeriden Seç", "Gallery")}</Text>
                    </Pressable>
                  </View>

                  {photoUri ? (
                    <View style={{ gap: 12 }}>
                      <View style={s.photoPreviewRow}>
                        <Image source={{ uri: photoUri }} style={s.photoPreview} />
                        <Pressable onPress={handleClearPhotoReview} style={s.clearHit} accessibilityRole="button">
                          <Text style={[s.clearText, { color: panelMuted }]}>{t("Temizle", "Clear")}</Text>
                        </Pressable>
                      </View>

                      {isAnalyzingPhoto ? (
                        <View style={s.analyzingRow}>
                          <TypingIndicator label={t("Fotoğraf analiz ediliyor...", "Analyzing photo...")} />
                        </View>
                      ) : (
                        <>
                          {photoError ? <ErrorBanner message={photoError} /> : null}
                          {reviewItems.map((item) => (
                            <View key={item.key} style={s.reviewItemBox}>
                              <Text style={[s.reviewDetected, { color: panelMuted }]}>
                                {t("Tanınan", "Detected")}: &ldquo;{item.detectedName}&rdquo;
                                {!item.selectedFood && item.candidateNames.length > 0
                                  ? ` — ${t("katalogda net eşleşme yok, öneriler", "no exact catalog match, suggestions")}: ${item.candidateNames.join(", ")}`
                                  : ""}
                                {!item.selectedFood && item.candidateNames.length === 0
                                  ? ` — ${t("katalogda bulunamadı, elle aramalısın", "not found in catalog, search manually")}`
                                  : ""}
                              </Text>
                              {item.isUncertain ? (
                                <View style={s.uncertainRow}>
                                  <AlertTriangle size={13} color={accent} />
                                  <Text style={[s.uncertainText, { color: isDark ? "#FFFFFF" : c.text }]}>
                                    {t(
                                      "Koç bu öğenin porsiyonundan/içeriğinden tam emin değil — gramajı gözden geçirmeni öneririz.",
                                      "Your coach isn't fully sure about this item's portion/content — we recommend double-checking the amount."
                                    )}
                                  </Text>
                                </View>
                              ) : null}
                              <SearchableSelect<FoodCatalogItem>
                                selectedLabel={item.foodQuery}
                                onQueryChange={(value) => updateReviewItem(item.key, { foodQuery: value, selectedFood: null })}
                                onSearch={(query) => (token ? searchFoods(token, query) : Promise.resolve([]))}
                                onSelect={(food) =>
                                  updateReviewItem(item.key, { selectedFood: food, foodQuery: catalogDisplayName(food, language) })
                                }
                                getLabel={(food) => catalogDisplayName(food, language)}
                                getKey={(food) => food.id}
                                placeholder={t("Besin adı yaz...", "Type food name...")}
                              />
                              <Stepper
                                value={item.grams}
                                onChangeText={(value) => updateReviewItem(item.key, { grams: value })}
                                step={25}
                                min={0}
                              />
                              {item.selectedFood && parseLocaleNumber(item.grams) > 0 ? (
                                <FoodPreview food={item.selectedFood} grams={parseLocaleNumber(item.grams)} />
                              ) : null}
                              <MealTypeChips
                                value={item.mealType}
                                onChange={(value) => updateReviewItem(item.key, { mealType: value })}
                                labels={MEAL_TYPE_LABELS[language]}
                              />
                              {/* Eylemler ayrı satırda (canlı test: ✓/✕ ikonları Stepper'la
                                  aynı satırda onun +/- düğmelerinin üstüne biniyordu) -
                                  metinli, 44pt'lik iki düğme. */}
                              <View style={s.row}>
                                <Pressable
                                  onPress={() => handleSaveReviewItem(item.key)}
                                  style={[s.reviewSave, { backgroundColor: accentFill }]}
                                  accessibilityRole="button"
                                  accessibilityLabel={t(`${item.detectedName} kaydet`, `Save ${item.detectedName}`)}
                                >
                                  <Check size={17} color={onAccent} strokeWidth={2.6} />
                                  <Text style={[s.reviewSaveText, { color: onAccent }]}>{t("Kaydet", "Save")}</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => handleDiscardReviewItem(item.key)}
                                  style={[s.reviewDiscard, { borderColor: panelBorder }]}
                                  accessibilityRole="button"
                                  accessibilityLabel={t(`${item.detectedName} vazgeç`, `Discard ${item.detectedName}`)}
                                >
                                  <X size={16} color={panelMuted} />
                                  <Text style={[s.reviewDiscardText, { color: panelMuted }]}>{t("Vazgeç", "Discard")}</Text>
                                </Pressable>
                              </View>
                              {item.error ? <Text style={s.reviewError}>{item.error}</Text> : null}
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  ) : null}
                </>
              )}
            </ProgressFormCard>
          </View>

          <ProgressSectionCard
            title={t("Bugünkü Öğünler", "Today's Meals")}
            subtitle={
              todayEntries.length > 0
                ? t("Düzenlemek için sağa, silmek için sola kaydır.", "Swipe right to edit, left to delete.")
                : t("Bir öğüne dokunarak hızlıca kayıt ekleyebilirsin.", "Tap a meal to quickly add an entry.")
            }
            {...tones.today}
          >
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {isLoading ? (
              <Skeleton height={180} />
            ) : (
              <View style={{ gap: 12 }}>
                {mealGroups.map((group) => (
                  <View key={group.type} style={{ gap: 8 }}>
                    <View style={s.mealHead}>
                      <View style={[s.mealIcon, { backgroundColor: isDark ? `${accent}33` : `${accentFill}59` }]}>
                        <MealTypeIcon type={group.type} size={15} color={isDark ? "#FFFFFF" : accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.mealTitle}>{MEAL_TYPE_LABELS[language][group.type]}</Text>
                        {group.items.length === 0 ? (
                          <Text style={[s.mealEmpty, { color: panelMuted }]}>{t("Henüz kayıt yok", "Nothing logged yet")}</Text>
                        ) : null}
                      </View>
                      {group.items.length > 0 ? (
                        <Text style={[s.mealKcal, { color: isDark ? "#FFFFFF" : c.text }]}>
                          {fmt(group.kcal)} <Text style={{ color: panelMuted, fontFamily: "Inter_500Medium" }}>kcal</Text>
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          tapLight();
                          openForm(group.type);
                        }}
                        style={s.iconHit}
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          `${MEAL_TYPE_LABELS.tr[group.type]} öğününe ekle`,
                          `Add to ${MEAL_TYPE_LABELS.en[group.type].toLowerCase()}`
                        )}
                      >
                        <View style={[s.mealAdd, { borderColor: `${accent}B3` }]}>
                          <Plus size={14} color={accent} strokeWidth={2.6} />
                        </View>
                      </Pressable>
                    </View>
                    {group.items.length > 0 ? (
                      <View style={{ gap: 8 }}>{group.items.map((entry) => renderEntryRow(entry, false))}</View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ProgressSectionCard>

          <ProgressSectionCard title={t("Kalori Trendi", "Calorie Trend")} {...tones.trend}>
            {isLoading || !chartsReady ? (
              <Skeleton height={260} />
            ) : (
              <>
                <SegmentToggle options={calorieRangeOptions} value={calorieRange} onChange={setCalorieRange} compact />
                <DailyCalorieChart
                  key={calorieRange}
                  entries={entries}
                  days={Number(calorieRange)}
                  goal={summary?.calorie_goal ?? null}
                  color={nutrientColors.kalori}
                  textColor={accent}
                  overColor={overColor}
                />
              </>
            )}
          </ProgressSectionCard>

          <ProgressSectionCard
            title={t("Bugünkü Makro Dağılımı", "Today's Macro Breakdown")}
            subtitle={todayEntries.length > 0 ? t("Bir çubuğa dokunarak hangi besinden geldiğini gör.", "Tap a bar to see which foods it came from.") : undefined}
            {...tones.macro}
          >
            {isLoading || !chartsReady ? (
              <Skeleton height={200} />
            ) : (
              <MacroDistributionChart
                proteinG={summary?.total_protein_g ?? 0}
                carbsG={summary?.total_carbs_g ?? 0}
                fatG={summary?.total_fat_g ?? 0}
                sugarG={summary?.total_sugar_g ?? 0}
                fiberG={summary?.total_fiber_g ?? 0}
                sodiumMg={summary?.total_sodium_mg ?? 0}
                todayEntries={todayEntries}
                themeColors={panelChartColors}
              />
            )}
          </ProgressSectionCard>

          <ProgressSectionCard
            title={t("Geçmiş Kayıtlar", "History")}
            subtitle={t("Önceki günler. Düzenlemek için sağa, silmek için sola kaydır.", "Previous days. Swipe right to edit, left to delete.")}
            {...tones.history}
          >
            {isLoading ? (
              <Skeleton height={140} />
            ) : olderHistory.length === 0 && !hasMoreHistory ? (
              <EmptyState
                icon={<Apple size={28} color={panelMuted} />}
                message={t("Önceki günlere ait bir öğün kaydı yok.", "No meals logged on previous days.")}
              />
            ) : (
              <View style={{ gap: 16 }}>
                {groupEntriesByDate(olderHistory, (entry) => entry.log_date, language).map((group) => {
                  const dayKey = group.items[0]?.log_date ?? "";
                  const isFull = dayKey >= oldestFullDay && dayTotals.has(dayKey);
                  const dayKcal = isFull ? dayTotals.get(dayKey)! : group.items.reduce((sum, e) => sum + e.calories_kcal, 0);
                  return (
                    <View key={group.label} style={{ gap: 8 }}>
                      <View style={s.dayHead}>
                        <Text style={[s.groupLabel, { color: panelMuted }]}>
                          {toLocaleUpper(group.label, language)}
                        </Text>
                        <Text style={[s.dayKcal, { color: panelMuted }]}>
                          {isFull ? "" : "≥ "}
                          {fmt(dayKcal)} kcal
                        </Text>
                      </View>
                      {group.items.map((entry) => renderEntryRow(entry, true))}
                    </View>
                  );
                })}
                {hasMoreHistory ? (
                  <ProgressTextButton
                    onPress={handleLoadMoreHistory}
                    disabled={isLoadingMoreHistory}
                    loading={isLoadingMoreHistory}
                    color={accent}
                  >
                    {t("Daha Fazla Göster", "Show More")}
                  </ProgressTextButton>
                ) : null}
              </View>
            )}
          </ProgressSectionCard>

          <ProgressSectionCard title={t("Fotoğraf Geçmişi", "Photo History")} {...tones.photos}>
            {photoHistoryError ? <ErrorBanner message={photoHistoryError} /> : null}
            {isLoading ? (
              <Skeleton height={110} />
            ) : photoHistory.length === 0 ? (
              <EmptyState
                icon={<Camera size={28} color={panelMuted} />}
                message={t(
                  "Henüz analiz edilmiş bir fotoğraf yok. Öğün Kaydet > Fotoğrafla ile çektiğin fotoğraflar burada birikir.",
                  "No analyzed photos yet. Photos from Log Meal > From Photo will collect here."
                )}
              />
            ) : (
              <View style={s.photoGallery}>
                {photoHistory.map((photo) =>
                  token ? (
                    <PhotoHistoryThumbnail
                      key={photo.id}
                      photo={photo}
                      token={token}
                      onDelete={handleDeletePhotoHistoryEntry}
                      muted={panelMuted}
                    />
                  ) : null
                )}
              </View>
            )}
          </ProgressSectionCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <NutritionGoalSheet visible={isGoalSheetOpen} onClose={closeGoalSheet} />
    </SafeAreaView>
    </SurfaceToneProvider>
  );
}

