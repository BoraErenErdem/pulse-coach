import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { AlertTriangle, Apple, Camera, Check, Image as ImageIcon, Pencil, X } from "lucide-react-native";
import {
  ApiError,
  MEAL_TYPES,
  analyzeMealPhoto,
  deleteMealEntry,
  deletePhotoHistoryEntry,
  getDailyNutritionSummary,
  getMealEntries,
  getPhotoHistory,
  getPhotoImageLocalUri,
  logMealEntry,
  searchFoods,
  updateMealEntry,
  type DailyNutritionSummary,
  type FoodCatalogItem,
  type MealEntry,
  type MealPhoto,
  type MealType,
  type PhotoMealItem,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { formatDate, parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ChipSelect,
  EmptyState,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  Reveal,
  SecondaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  type ThemeColors,
  TypingIndicator,
  useNutrientColors,
  useThemeColors,
} from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";
import { SearchableSelect } from "@/components/searchable-select";
import { Stepper } from "@/components/stepper";
import { SwipeableRow } from "@/components/swipeable-row";
import { CalorieTrendChart } from "@/components/charts/calorie-trend-chart";
import { MacroDistributionChart } from "@/components/charts/macro-distribution-chart";
import { tapLight, tapSuccess } from "@/lib/haptics";

// web/src/app/(app)/nutrition/page.tsx'in mobil portu - Faz M4 (2/2)
// tamamlandı: önce fotoğrafsız temel canlı doğrulandı, şimdi fotoğrafla
// ekleme de eklendi (plan kararı: en riskli parça, temel doğrulandıktan
// sonra sırası geldi).
// Redesign (Faz M2b, 2026-08-15): bu ekran o zamana kadar HİÇ tema
// düzeltmesi görmemişti - statik (sadece açık tema) `colors` kullanıyordu,
// koyu modda kırık/okunaksız kalıyordu. Artık diğer sekmelerle aynı
// `useThemeColors()`+`makeStyles(c)` deseni. Ayrıca miktar alanlarına
// Stepper, geçmiş satırlarına SwipeableRow eklendi (Antrenman'la aynı
// desen) - kullanıcının "projenin geri kalanını tamamla" isteği.
const MEAL_TYPE_LABELS: Record<PreferredLanguage, Record<MealType, string>> = {
  tr: { kahvaltı: "Kahvaltı", öğle: "Öğle", akşam: "Akşam", atıştırmalık: "Atıştırmalık" },
  en: { kahvaltı: "Breakfast", öğle: "Lunch", akşam: "Dinner", atıştırmalık: "Snack" },
};

interface PhotoReviewItem {
  key: string;
  detectedName: string;
  foodQuery: string;
  selectedFood: FoodCatalogItem | null;
  candidateNames: string[];
  grams: string;
  mealType: MealType;
  error: string | null;
  isUncertain: boolean;
}

function reviewItemFromDetected(item: PhotoMealItem, index: number, language: PreferredLanguage): PhotoReviewItem {
  // web'deki reviewItemFromDetected'la AYNI ilke: SADECE net (matched_food)
  // bir eşleşme varsa önceden seçili göster - candidates'teki ilk öneriyi
  // otomatik seçmek yanlış olurdu (düşük güvenli tahmin, kullanıcı fark
  // etmeden yanlış besini kaydedebilir).
  return {
    key: `${index}-${item.food_name}`,
    detectedName: item.food_name,
    foodQuery: item.matched_food ? catalogDisplayName(item.matched_food, language) : item.food_name,
    selectedFood: item.matched_food,
    candidateNames: item.candidates.map((c) => catalogDisplayName(c, language)),
    grams: String(Math.round(item.estimated_grams)),
    mealType: "öğle",
    error: null,
    isUncertain: item.is_uncertain,
  };
}

function formatPhotoDate(iso: string, language: PreferredLanguage): string {
  return formatDate(iso, language, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// mood-history.tsx::todayIso ile AYNI desen - MealEntry.log_date ("YYYY-MM-
// DD") ile karşılaştırmak için yerel (UTC değil) bugünün tarihi.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Geçmiş kaydı satırındaki "150 g, 240 kcal" özetinin altına eklenen besin
 * değeri dökümü (kullanıcı isteği, 2026-08-24). protein/karbonhidrat/yağ
 * MealEntry'de her zaman dolu, şeker/lif/sodyum ise besin kataloğunda
 * opsiyonel olduğu için null gelebilir - null olan değer satırdan tamamen
 * çıkarılıyor ("0 g şeker" yazmak yanıltıcı olurdu, veri yok demek).
 *
 * Etiket kelimesi (ör. "Protein") `useNutrientColors()`'tan RENKLİ - Makro
 * Dağılımı grafiği/Günlük Hedef ölçerleriyle AYNI besin-renk eşlemesi,
 * kullanıcı bu listede de aynı görsel dili tanısın diye (2026-08-24 kullanıcı
 * kararı). Sayı VE "g/mg, kcal" özet satırı bilerek gri bırakıldı - hepsini
 * renklendirmek (kalori dahil) satırı "konfeti"ye çevirirdi, üstelik Kalori
 * ile Şeker AYNI rengi (series1) paylaşıyor - ikisi tek kartta yan yana
 * göründüğü için renklenselerdi çakışırlardı (workoutTypeColors'taki AYNI
 * hata sınıfı, bkz. ui.tsx::buildNutrientColors notu). */
function EntryNutrientBreakdown({
  entry,
  t,
  nutrientColors,
}: {
  entry: MealEntry;
  t: (tr: string, en: string) => string;
  nutrientColors: ReturnType<typeof useNutrientColors>;
}) {
  const parts: { key: "protein" | "karbonhidrat" | "yağ" | "şeker" | "lif" | "sodyum"; label: string; value: string }[] = [
    { key: "protein", label: t("Protein", "Protein"), value: `${entry.protein_g.toFixed(0)} g` },
    { key: "karbonhidrat", label: t("Karbonhidrat", "Carbs"), value: `${entry.carbs_g.toFixed(0)} g` },
    { key: "yağ", label: t("Yağ", "Fat"), value: `${entry.fat_g.toFixed(0)} g` },
  ];
  if (entry.sugar_g !== null) parts.push({ key: "şeker", label: t("Şeker", "Sugar"), value: `${entry.sugar_g.toFixed(0)} g` });
  if (entry.fiber_g !== null) parts.push({ key: "lif", label: t("Lif", "Fiber"), value: `${entry.fiber_g.toFixed(0)} g` });
  if (entry.sodium_mg !== null) parts.push({ key: "sodyum", label: t("Sodyum", "Sodium"), value: `${entry.sodium_mg.toFixed(0)} mg` });

  return (
    <>
      {parts.map((p, i) => (
        <Text key={p.key}>
          {i > 0 ? " · " : ""}
          <Text style={{ color: nutrientColors[p.key] }}>{p.label}</Text> {p.value}
        </Text>
      ))}
    </>
  );
}

/** Galeri kartındaki tek bir küçük resim - RN'in <Image source={{uri}}>'i
 * özel Authorization header gönderemediği için görüntü önce yerel cache'e
 * indiriliyor (getPhotoImageLocalUri), sonra o yerel uri gösteriliyor
 * (web'deki blob-fetch deseninin RN karşılığı). */
function PhotoHistoryThumbnail({
  photo,
  token,
  onDelete,
}: {
  photo: MealPhoto;
  token: string;
  onDelete: (photoId: number) => void;
}) {
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeThumbStyles(c), [c]);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    getPhotoImageLocalUri(token, photo.id)
      .then((uri) => {
        if (!isCancelled) setLocalUri(uri);
      })
      .catch(() => {
        if (!isCancelled) setHasError(true);
      });
    return () => {
      isCancelled = true;
    };
  }, [token, photo.id]);

  return (
    <View style={s.wrapper}>
      <View style={s.imageBox}>
        {localUri ? (
          <Image source={{ uri: localUri }} style={s.image} />
        ) : hasError ? (
          <Text style={s.errorText}>{t("Yüklenemedi", "Failed to load")}</Text>
        ) : (
          <Skeleton height={96} />
        )}
      </View>
      <Pressable onPress={() => onDelete(photo.id)} style={s.deleteButton} hitSlop={8}>
        <X size={12} color="#fff" />
      </Pressable>
      <Text style={s.dateText} numberOfLines={1}>
        {formatPhotoDate(photo.created_at, language)}
      </Text>
    </View>
  );
}

function makeThumbStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrapper: { width: 96 },
    imageBox: {
      width: 96,
      height: 96,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: c.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    image: { width: "100%", height: "100%" },
    errorText: { fontSize: 11, color: c.muted },
    deleteButton: {
      position: "absolute",
      top: -6,
      right: -6,
      backgroundColor: c.error,
      borderRadius: 999,
      padding: 4,
    },
    dateText: { marginTop: 4, fontSize: 11, color: c.muted },
  });
}

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme + gün başlıklarına gruplama (web ile AYNI desen). Web'de HÂLÂ
// 10 (kullanıcı web'den şikayet etmedi) - mobile'da kullanıcı 10'u da
// şişkin bulup 5'e düşürttü (2026-08-14, aynı gün 2. tur telefon testi).
const HISTORY_PAGE_SIZE = 5;

export default function NutritionTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const nutrientColors = useNutrientColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [summary, setSummary] = useState<DailyNutritionSummary | null>(null);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [mealType, setMealType] = useState<MealType>("öğle");
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

  // "Geçmiş Kayıtlar" listesi için BAĞIMSIZ, sayfalı bir veri akışı -
  // grafiği besleyen `entries`/getMealEntries(token, 30) çağrısından
  // KASITLI OLARAK ayrı (2026-08-14, kullanıcı isteği: uzun listeler görsel
  // olarak bunaltıcıydı). `entries`'i limit'e çevirmek CalorieTrendChart'ın
  // 30 günlük trendini kırardı.
  const [historyItems, setHistoryItems] = useState<MealEntry[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

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

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, entriesData, photoHistoryData] = await Promise.all([
        getDailyNutritionSummary(token),
        getMealEntries(token, 30),
        getPhotoHistory(token),
        loadHistoryPage(0, true),
      ]);
      setSummary(summaryData);
      setEntries(entriesData);
      setPhotoHistory(photoHistoryData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t, loadHistoryPage]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      setFormSuccess(t("Öğün kaydedildi!", "Meal saved!"));
      setSelectedFood(null);
      setFoodQuery("");
      setQuantity("100");
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
    try {
      const updated = await updateMealEntry(token, entryId, {
        quantity_grams: parseLocaleNumber(editQuantity),
      });
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
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
      setReviewItems(result.items.map((item, index) => reviewItemFromDetected(item, index, language)));
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

  const hasGoals =
    summary && (summary.calorie_goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  // Makro Dağılımı grafiğinin dokunma-detayı için - `entries` son 30 günü
  // kapsıyor (limitsiz istek, bkz. loadData), bugüne ait olanlar filtreleniyor.
  const todayEntries = useMemo(() => entries.filter((e) => e.log_date === todayIso()), [entries]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{t("Beslenme", "Nutrition")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {isLoading ? (
            <View style={s.statGrid}>
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
            </View>
          ) : (
            // 2026-08-22 ("genel renk düzeni" incelemesi): kutular, Günlük
            // Hedef ölçerleri ve MacroDistributionChart AYNI besin
            // değerlerini gösteriyor ama üçü BİRBİRİNDEN habersiz kendi
            // seriesColors.seriesN'ini seçmişti (ör. Karbonhidrat kutuda
            // mor, grafikte altındı) - hepsi artık paylaşımlı
            // `useNutrientColors()`'tan (bkz. ui.tsx) besleniyor.
            <Reveal style={s.statGrid}>
              <StatTile
                label={t("Bugün Kalori", "Calories Today")}
                value={`${(summary?.total_calories_kcal ?? 0).toFixed(0)} kcal`}
                color={nutrientColors.kalori}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
              <StatTile
                label={t("Bugün Protein", "Protein Today")}
                value={`${(summary?.total_protein_g ?? 0).toFixed(0)} g`}
                color={nutrientColors.protein}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
              {/* Kullanıcı isteği (2026-08-22): "5 yerine 6 tab olsun, diğer
                  sekmelerdeki gibi eşit bölünerek simetrik görünsün" - tek
                  başına kalan 5. kutu ızgarayı çift satırlarda asimetrik
                  bırakıyordu, Karbonhidrat eklenince 6'ya (3 tam satır)
                  tamamlanıyor. */}
              <StatTile
                label={t("Bugün Karbonhidrat", "Carbs Today")}
                value={`${(summary?.total_carbs_g ?? 0).toFixed(0)} g`}
                color={nutrientColors.karbonhidrat}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
              <StatTile
                label={t("Bugün Lif", "Fiber Today")}
                value={`${(summary?.total_fiber_g ?? 0).toFixed(0)} g`}
                color={nutrientColors.lif}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
              <StatTile
                label={t("Bugün Sodyum", "Sodium Today")}
                value={`${(summary?.total_sodium_mg ?? 0).toFixed(0)} mg`}
                color={nutrientColors.sodyum}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
              <StatTile
                label={t("Bugün Kayıt", "Entries Today")}
                value={String(summary?.entry_count ?? 0)}
                color={nutrientColors.kayıt}
                onPress={tapLight}
                containerStyle={s.statTileTouchable}
              />
            </Reveal>
          )}

          {!isLoading && summary ? (
            <InfoBanner
              message={
                summary.entry_count > 0
                  ? summary.summary_text
                  : t(
                      "Bugün için henüz öğün kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
                      "No meal logged today yet. You can add your first entry using the form below."
                    )
              }
            />
          ) : null}

          {!isLoading && hasGoals && summary ? (
            <Reveal delay={60}>
            <Card>
              <Text style={s.cardTitle}>{t("Günlük Hedef Karşılaştırma", "Daily Goal Comparison")}</Text>
              <View style={{ gap: 14 }}>
                {summary.calorie_goal ? (
                  <GoalMeter
                    label={t("Kalori", "Calories")}
                    value={summary.total_calories_kcal}
                    goal={summary.calorie_goal}
                    unit="kcal"
                    color={nutrientColors.kalori}
                  />
                ) : null}
                {summary.protein_goal_g ? (
                  <GoalMeter
                    label={t("Protein", "Protein")}
                    value={summary.total_protein_g}
                    goal={summary.protein_goal_g}
                    unit="g"
                    color={nutrientColors.protein}
                  />
                ) : null}
                {summary.carbs_goal_g ? (
                  <GoalMeter
                    label={t("Karbonhidrat", "Carbs")}
                    value={summary.total_carbs_g}
                    goal={summary.carbs_goal_g}
                    unit="g"
                    color={nutrientColors.karbonhidrat}
                  />
                ) : null}
                {summary.fat_goal_g ? (
                  <GoalMeter
                    label={t("Yağ", "Fat")}
                    value={summary.total_fat_g}
                    goal={summary.fat_goal_g}
                    unit="g"
                    color={nutrientColors.yağ}
                  />
                ) : null}
              </View>
            </Card>
            </Reveal>
          ) : null}

          <Reveal delay={60}>
          <Card>
            <Text style={s.cardTitle}>{t("Öğün Kaydet", "Log Meal")}</Text>
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

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

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Miktar (g)", "Quantity (g)")}</FormLabel>
                <Stepper value={quantity} onChangeText={setQuantity} step={25} min={0} />
              </View>
            </View>

            <View>
              <FormLabel>{t("Öğün", "Meal")}</FormLabel>
              <ChipSelect options={MEAL_TYPES} value={mealType} onChange={setMealType} labels={MEAL_TYPE_LABELS[language]} />
            </View>

            <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
            </PrimaryButton>
          </Card>
          </Reveal>

          <Reveal delay={120}>
          <Card>
            <Text style={s.cardTitle}>{t("Fotoğrafla Ekle", "Add via Photo")}</Text>
            <Text style={s.hintText}>
              {t(
                "Yemeğinin fotoğrafını çek/yükle, koçun besinleri tanıyıp tahmini porsiyonları önersin — gördüğün gram değerleri her zaman bir tahmindir (özellikle yağ/sos gibi gözle görünmeyen bileşenler için sapabilir), kaydetmeden önce dilediğin gibi düzenleyebilir, besini değiştirebilir ya da vazgeçebilirsin.",
                "Take/upload a photo of your meal and let your coach recognize the foods and suggest estimated portions — the gram values you see are always an estimate (it can be off, especially for hidden ingredients like oil/sauce), and you can edit it however you like, change the food, or discard it before saving."
              )}
            </Text>

            <View style={s.row}>
              <SecondaryButton onPress={handlePickFromCamera}>
                <Camera size={16} color={c.text} /> {"  "}
                {t("Kameradan Çek", "Take Photo")}
              </SecondaryButton>
              <SecondaryButton onPress={handlePickFromLibrary}>
                <ImageIcon size={16} color={c.text} /> {"  "}
                {t("Galeriden Seç", "Choose from Gallery")}
              </SecondaryButton>
            </View>

            {photoUri ? (
              <View style={{ gap: 12 }}>
                <View style={s.photoPreviewRow}>
                  <Image source={{ uri: photoUri }} style={s.photoPreview} />
                  <Pressable onPress={handleClearPhotoReview} hitSlop={8}>
                    <Text style={s.clearText}>{t("Temizle", "Clear")}</Text>
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
                        <Text style={s.reviewDetected}>
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
                            <AlertTriangle size={13} color={c.insightAccent} />
                            <Text style={s.uncertainText}>
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
                        <View style={s.row}>
                          <View style={{ flex: 1 }}>
                            <Stepper
                              value={item.grams}
                              onChangeText={(value) => updateReviewItem(item.key, { grams: value })}
                              step={25}
                              min={0}
                            />
                          </View>
                          <Pressable onPress={() => handleSaveReviewItem(item.key)} hitSlop={8}>
                            <Check size={20} color={c.success} />
                          </Pressable>
                          <Pressable onPress={() => handleDiscardReviewItem(item.key)} hitSlop={8}>
                            <X size={20} color={c.error} />
                          </Pressable>
                        </View>
                        <ChipSelect
                          options={MEAL_TYPES}
                          value={item.mealType}
                          onChange={(value) => updateReviewItem(item.key, { mealType: value })}
                          labels={MEAL_TYPE_LABELS[language]}
                        />
                        {item.error ? <Text style={s.reviewError}>{item.error}</Text> : null}
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : null}
          </Card>
          </Reveal>

          <Reveal delay={120}>
          <Card>
            <Text style={s.cardTitle}>{t("Fotoğraf Geçmişi", "Photo History")}</Text>
            {photoHistoryError ? <ErrorBanner message={photoHistoryError} /> : null}
            {isLoading ? (
              <Skeleton height={110} />
            ) : photoHistory.length === 0 ? (
              <EmptyState
                icon={<Camera size={28} color={c.muted} />}
                message={t(
                  "Henüz analiz edilmiş bir fotoğraf yok. Yukarıdan bir yemek fotoğrafı çektikçe/yükledikçe burada birikecek.",
                  "No analyzed photos yet. They'll appear here as you take/upload meal photos above."
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
                    />
                  ) : null
                )}
              </View>
            )}
          </Card>
          </Reveal>

          <Reveal delay={180}>
          <Card>
            <Text style={s.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
            <Text style={s.hintText}>{t("Silmek için sola kaydır.", "Swipe left to delete.")}</Text>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {isLoading ? (
              <Skeleton height={140} />
            ) : historyItems.length === 0 ? (
              <EmptyState
                icon={<Apple size={28} color={c.muted} />}
                message={t(
                  "Henüz bir öğün kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No meal logged yet. You can add your first entry using the form above."
                )}
              />
            ) : (
              <View style={{ gap: 14 }}>
                {groupEntriesByDate(historyItems, (entry) => entry.log_date, language).map((group) => (
                  <View key={group.label} style={{ gap: 6 }}>
                    <Text style={s.groupLabel}>{group.label}</Text>
                    {group.items.map((entry) => (
                      <SwipeableRow key={entry.id} onDelete={() => handleDeleteEntry(entry.id)}>
                        <View style={s.entryRow}>
                          {editingEntryId === entry.id ? (
                            <View style={s.entryEditRow}>
                              <Text style={s.entryEditName}>{entry.food_name_snapshot}</Text>
                              <FormInput
                                value={editQuantity}
                                onChangeText={setEditQuantity}
                                keyboardType="numeric"
                                style={{ width: 64 }}
                              />
                              <Text style={s.entryEditUnit}>g</Text>
                              <Pressable onPress={() => handleSaveEntry(entry.id)} hitSlop={8}>
                                <Check size={16} color={c.success} />
                              </Pressable>
                              <Pressable onPress={() => setEditingEntryId(null)} hitSlop={8}>
                                <X size={16} color={c.error} />
                              </Pressable>
                            </View>
                          ) : (
                            <>
                              <Text style={s.entryText}>
                                {entry.food_name_snapshot} ({MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type})
                                {"\n"}
                                <Text style={s.entryMeta}>
                                  {entry.quantity_grams.toFixed(0)} g, {entry.calories_kcal.toFixed(0)} kcal
                                </Text>
                                {"\n"}
                                <Text style={s.entryNutrients}>
                                  <EntryNutrientBreakdown entry={entry} t={t} nutrientColors={nutrientColors} />
                                </Text>
                              </Text>
                              <Pressable onPress={() => handleStartEditEntry(entry)} hitSlop={8}>
                                <Pencil size={14} color={c.muted} />
                              </Pressable>
                            </>
                          )}
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
          </Reveal>

          <Reveal delay={180}>
          <Card>
            <Text style={s.cardTitle}>{t("Kalori Trendi", "Calorie Trend")}</Text>
            {isLoading ? <Skeleton height={200} /> : <CalorieTrendChart entries={entries} />}
          </Card>
          </Reveal>

          <Reveal delay={240}>
          <Card>
            <Text style={s.cardTitle}>{t("Bugünkü Makro Dağılımı", "Today's Macro Breakdown")}</Text>
            {isLoading ? (
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
              />
            )}
          </Card>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.text },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    // İlerleme sekmesindeki AYNI dokunma animasyonu (kullanıcı isteği,
    // 2026-08-22) - bkz. workouts.tsx'teki AYNI isimli stildeki not.
    statTileTouchable: { flexBasis: "48%", flexGrow: 1 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    row: { flexDirection: "row", gap: 10 },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surfaceMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    entryEditName: { fontSize: 12, color: c.muted },
    entryEditUnit: { fontSize: 11, color: c.muted },
    entryText: { fontSize: 13, color: c.text, flex: 1 },
    entryMeta: { fontSize: 12, color: c.muted },
    entryNutrients: { fontSize: 11, color: c.muted },
    hintText: { fontSize: 12, color: c.muted, lineHeight: 18 },
    photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    photoPreview: { width: 88, height: 88, borderRadius: 10, backgroundColor: c.surfaceMuted },
    clearText: { fontSize: 13, color: c.muted, textDecorationLine: "underline" },
    analyzingRow: { paddingVertical: 8 },
    reviewItemBox: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceMuted,
      borderRadius: 10,
      padding: 12,
      gap: 8,
    },
    reviewDetected: { fontSize: 11, color: c.muted, lineHeight: 16 },
    uncertainRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    uncertainText: { flex: 1, fontSize: 11, color: c.insightAccent, lineHeight: 16 },
    reviewError: { fontSize: 11, color: c.error },
    photoGallery: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  });
}
