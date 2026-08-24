"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Apple,
  Camera,
  Check,
  ClipboardList,
  Droplet,
  Flame,
  Pencil,
  Save,
  Trash2,
  Wheat,
  X,
} from "lucide-react";
import {
  ApiError,
  MEAL_TYPES,
  analyzeMealPhoto,
  deleteMealEntry,
  deletePhotoHistoryEntry,
  getDailyNutritionSummary,
  getMealEntries,
  getPhotoHistory,
  getPhotoImageBlob,
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
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import {
  Card,
  EmptyState,
  ErrorBanner,
  GoalMeter,
  InfoBanner,
  Label,
  NUTRIENT_SERIES_VAR,
  type NutrientKey,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Select,
  Skeleton,
  Spinner,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { CalorieTrendChart } from "@/components/charts/CalorieTrendChart";
import { MacroDistributionChart } from "@/components/charts/MacroDistributionChart";

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
  // SADECE net (matched_food) bir eşleşme varsa önceden seçili göster —
  // candidates listesindeki İLK öneriyi otomatik seçmek yanlış olurdu
  // (düşük güvenli bir tahmin, kullanıcı fark etmeden yanlış besini
  // kaydedebilir). Eşleşme yoksa alan boş kalır, kullanıcı bilinçli olarak
  // arayıp seçmeli — uygulamanın geri kalanındaki "asla tahmini değer
  // yazma" ilkesiyle tutarlı.
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

/** Geçmiş kaydı satırındaki "150 g, 240 kcal" özetinin altına eklenen besin
 * değeri dökümü (kullanıcı isteği, 2026-08-24) - mobile/app/(tabs)/
 * nutrition.tsx::EntryNutrientBreakdown ile AYNI mantık. protein/
 * karbonhidrat/yağ MealEntry'de her zaman dolu, şeker/lif/sodyum ise besin
 * kataloğunda opsiyonel olduğu için null gelebilir - null olan değer
 * satırdan tamamen çıkarılıyor ("0 g şeker" yazmak yanıltıcı olurdu, veri
 * yok demek).
 *
 * Etiket kelimesi (ör. "Protein") `NUTRIENT_SERIES_VAR`'dan RENKLİ - Makro
 * Dağılımı grafiği/Günlük Hedef ölçerleriyle AYNI besin-renk eşlemesi.
 * Sayı VE "g/mg, kcal" özet satırı bilerek gri bırakıldı - Kalori ile Şeker
 * AYNI seriyi (--series-1) paylaştığı için ikisi de renklenseydi tek kartta
 * yan yana çakışırlardı (bkz. ui.tsx::NUTRIENT_SERIES_VAR notu). */
function EntryNutrientBreakdown({ entry, t }: { entry: MealEntry; t: (tr: string, en: string) => string }) {
  const parts: { key: NutrientKey; label: string; value: string }[] = [
    { key: "protein", label: t("Protein", "Protein"), value: `${entry.protein_g.toFixed(0)} g` },
    { key: "karbonhidrat", label: t("Karbonhidrat", "Carbs"), value: `${entry.carbs_g.toFixed(0)} g` },
    { key: "yağ", label: t("Yağ", "Fat"), value: `${entry.fat_g.toFixed(0)} g` },
  ];
  if (entry.sugar_g !== null) parts.push({ key: "şeker", label: t("Şeker", "Sugar"), value: `${entry.sugar_g.toFixed(0)} g` });
  if (entry.fiber_g !== null) parts.push({ key: "lif", label: t("Lif", "Fiber"), value: `${entry.fiber_g.toFixed(0)} g` });
  if (entry.sodium_mg !== null) parts.push({ key: "sodyum", label: t("Sodyum", "Sodium"), value: `${entry.sodium_mg.toFixed(0)} mg` });

  return (
    <span className="text-xs text-zinc-500 dark:text-zinc-400">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? " · " : ""}
          <span style={{ color: `var(${NUTRIENT_SERIES_VAR[p.key]})` }}>{p.label}</span> {p.value}
        </span>
      ))}
    </span>
  );
}

function formatPhotoDate(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Galeri kartındaki tek bir küçük resim - <img src> özel Authorization
 * header'ı gönderemediği için görüntü baytları burada elle fetch edilip
 * Blob URL'e çevriliyor, unmount'ta URL geri alınıyor (bellek sızıntısı
 * olmasın diye). */
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isCancelled = false;

    getPhotoImageBlob(token, photo.id)
      .then((blob) => {
        if (isCancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!isCancelled) setHasError(true);
      });

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, photo.id]);

  return (
    <div className="group relative">
      <div
        className="h-28 w-28 overflow-hidden rounded-lg bg-[var(--surface-muted)]"
        title={`${photo.detected_items_summary || t("Tanınan besin yok", "No food recognized")} — ${formatPhotoDate(photo.created_at, language)}`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- yerel blob: URL, next/image optimize edemiyor
          <img src={imageUrl} alt={photo.detected_items_summary || t("Yemek fotoğrafı", "Meal photo")} className="h-full w-full object-cover" />
        ) : hasError ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">{t("Yüklenemedi", "Failed to load")}</div>
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(photo.id)}
        className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
        aria-label={t("Fotoğrafı sil", "Delete photo")}
      >
        <X className="h-3 w-3" />
      </button>
      <p className="mt-1 max-w-28 truncate text-xs text-zinc-500">{formatPhotoDate(photo.created_at, language)}</p>
    </div>
  );
}

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme + gün başlıklarına gruplama (Progress/Workouts ile AYNI desen).
// Progress'ten (20) FARKLI OLARAK 10 - kullanıcı canlı telefon testinde
// beslenme/antrenman sayfalarının 20 ile bile aşırı uzadığını belirtti.
const HISTORY_PAGE_SIZE = 10;

export default function NutritionPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [summary, setSummary] = useState<DailyNutritionSummary | null>(null);
  const [entries, setEntries] = useState<MealEntry[]>([]);

  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [mealType, setMealType] = useState<MealType>("öğle");
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
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<PhotoReviewItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [photoHistory, setPhotoHistory] = useState<MealPhoto[]>([]);
  const [photoHistoryError, setPhotoHistoryError] = useState<string | null>(null);

  // "Geçmiş Kayıtlar" listesi için BAĞIMSIZ, sayfalı bir veri akışı -
  // grafiği besleyen `entries`/`getMealEntries(token, 30)` çağrısından
  // KASITLI OLARAK ayrı (2026-08-14, kullanıcı isteği: uzun listeler görsel
  // olarak bunaltıcıydı). `entries`'i limit'e çevirmek CalorieTrendChart'ın
  // 30 günlük trendini kırardı.
  const [historyItems, setHistoryItems] = useState<MealEntry[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  async function loadHistoryPage(offset: number, replace: boolean) {
    if (!token) return;
    const page = await getMealEntries(token, undefined, HISTORY_PAGE_SIZE, offset);
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

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const [summaryData, entriesData, photoHistoryData] = await Promise.all([
      getDailyNutritionSummary(token),
      getMealEntries(token, 30),
      getPhotoHistory(token),
      loadHistoryPage(0, true),
    ]);
    setSummary(summaryData);
    setEntries(entriesData);
    setPhotoHistory(photoHistoryData);
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    resetFormMessages();

    if (!selectedFood) {
      setFormError(t("Listeden bir besin seçmelisin (kalori/makro hesaplaması için gerekli).", "You need to pick a food from the list (required to calculate calories/macros)."));
      return;
    }
    const quantityNumber = Number(quantity);
    if (!quantityNumber || quantityNumber <= 0) {
      setFormError(t("Miktar (gram) sıfırdan büyük olmalı.", "Quantity (grams) must be greater than zero."));
      return;
    }

    await submit(async () => {
      await logMealEntry(token, {
        food_catalog_id: selectedFood.id,
        quantity_grams: quantityNumber,
        meal_type: mealType,
      });
      setFormSuccess(t("Öğün kaydedildi!", "Meal saved!"));
      setSelectedFood(null);
      setFoodQuery("");
      setQuantity("100");
      await loadData();
    });
  }

  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !token) return;

    setPhotoError(null);
    setReviewItems([]);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setIsAnalyzingPhoto(true);

    try {
      const result = await analyzeMealPhoto(token, file);
      if (result.items.length === 0) {
        setPhotoError(
          t(
            "Fotoğrafta tanınabilir bir besin bulunamadı. Farklı bir fotoğraf deneyebilir ya da elle ekleyebilirsin.",
            "No recognizable food was found in the photo. You can try a different photo or add it manually."
          )
        );
      }
      setReviewItems(result.items.map((item, index) => reviewItemFromDetected(item, index, language)));
      const updatedHistory = await getPhotoHistory(token);
      setPhotoHistory(updatedHistory);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : t("Fotoğraf analiz edilemedi, tekrar dener misin?", "Couldn't analyze photo, want to try again?"));
    } finally {
      setIsAnalyzingPhoto(false);
    }
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

  function handleClearPhotoReview() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
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
    const gramsNumber = Number(item.grams);
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

  function handleStartEditEntry(entry: MealEntry) {
    setEditingEntryId(entry.id);
    setEditQuantity(String(entry.quantity_grams));
  }

  async function handleSaveEntry(entryId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await updateMealEntry(token, entryId, { quantity_grams: Number(editQuantity) });
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

  const hasGoals =
    summary &&
    (summary.calorie_goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Beslenme", "Nutrition")}</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label={t("Bugün Kalori", "Calories Today")}
            value={`${(summary?.total_calories_kcal ?? 0).toFixed(0)} kcal`}
            icon={<Flame className="h-4 w-4" />}
            seriesVar={NUTRIENT_SERIES_VAR.kalori}
          />
          <StatTile
            label={t("Bugün Protein", "Protein Today")}
            value={`${(summary?.total_protein_g ?? 0).toFixed(0)} g`}
            icon={<Apple className="h-4 w-4" />}
            seriesVar={NUTRIENT_SERIES_VAR.protein}
          />
          <StatTile
            label={t("Bugün Lif", "Fiber Today")}
            value={`${(summary?.total_fiber_g ?? 0).toFixed(0)} g`}
            icon={<Wheat className="h-4 w-4" />}
            seriesVar={NUTRIENT_SERIES_VAR.lif}
          />
          <StatTile
            label={t("Bugün Sodyum", "Sodium Today")}
            value={`${(summary?.total_sodium_mg ?? 0).toFixed(0)} mg`}
            icon={<Droplet className="h-4 w-4" />}
            seriesVar={NUTRIENT_SERIES_VAR.sodyum}
          />
          <StatTile
            label={t("Bugün Kayıt", "Entries Today")}
            value={String(summary?.entry_count ?? 0)}
            icon={<ClipboardList className="h-4 w-4" />}
            seriesVar={NUTRIENT_SERIES_VAR.kayıt}
          />
        </div>
      )}

      {!isLoading && summary ? (
        summary.entry_count > 0 ? (
          <InfoBanner message={summary.summary_text} />
        ) : (
          <InfoBanner
            message={t(
              "Bugün için henüz öğün kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
              "No meal logged today yet. You can add your first entry using the form below."
            )}
          />
        )
      ) : null}

      {!isLoading && hasGoals && summary ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Günlük Hedef Karşılaştırma", "Daily Goal Comparison")}
          </h2>
          <div className="space-y-4">
            {summary.calorie_goal ? (
              <GoalMeter
                label={t("Kalori", "Calories")}
                value={summary.total_calories_kcal}
                goal={summary.calorie_goal}
                unit="kcal"
                seriesVar={NUTRIENT_SERIES_VAR.kalori}
              />
            ) : null}
            {summary.protein_goal_g ? (
              <GoalMeter
                label={t("Protein", "Protein")}
                value={summary.total_protein_g}
                goal={summary.protein_goal_g}
                unit="g"
                seriesVar={NUTRIENT_SERIES_VAR.protein}
              />
            ) : null}
            {summary.carbs_goal_g ? (
              <GoalMeter
                label={t("Karbonhidrat", "Carbs")}
                value={summary.total_carbs_g}
                goal={summary.carbs_goal_g}
                unit="g"
                seriesVar={NUTRIENT_SERIES_VAR.karbonhidrat}
              />
            ) : null}
            {summary.fat_goal_g ? (
              <GoalMeter
                label={t("Yağ", "Fat")}
                value={summary.total_fat_g}
                goal={summary.fat_goal_g}
                unit="g"
                seriesVar={NUTRIENT_SERIES_VAR.yağ}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Öğün Kaydet", "Log Meal")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid gap-3 sm:grid-cols-[2fr,1fr,1fr]">
            <div>
              <Label>{t("Besin", "Food")}</Label>
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
            </div>
            <div>
              <Label htmlFor="quantity">{t("Miktar (g)", "Quantity (g)")}</Label>
              <TextInput
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mealType">{t("Öğün", "Meal")}</Label>
              <Select
                id="mealType"
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealType)}
              >
                {MEAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MEAL_TYPE_LABELS[language][type]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <PrimaryButton type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Fotoğrafla Ekle", "Add via Photo")}
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          {t("Yemeğinin fotoğrafını yükle, koçun besinleri tanıyıp tahmini porsiyonları önersin — gördüğün gram değerleri her zaman bir ", "Upload a photo of your meal and let your coach recognize the foods and suggest estimated portions — the gram values you see are always a ")}
          <strong>{t("tahmindir", "estimate")}</strong>
          {t(
            " (özellikle yağ/sos gibi gözle görünmeyen bileşenler için sapabilir), kaydetmeden önce dilediğin gibi düzenleyebilir, besini değiştirebilir ya da vazgeçebilirsin.",
            " (it can be off, especially for hidden ingredients like oil/sauce) — you can edit it however you like, change the food, or discard it before saving."
          )}
        </p>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePhotoSelected}
        />

        <div className="flex items-center gap-3">
          <SecondaryButton type="button" onClick={() => photoInputRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {t("Fotoğraf Seç", "Choose Photo")}
          </SecondaryButton>
          {photoPreviewUrl ? (
            <button
              type="button"
              onClick={handleClearPhotoReview}
              className="text-sm text-zinc-500 underline-offset-2 hover:underline"
            >
              {t("Temizle", "Clear")}
            </button>
          ) : null}
        </div>

        {photoPreviewUrl ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- yerel blob: URL, next/image optimize edemiyor */}
            <img
              src={photoPreviewUrl}
              alt={t("Yüklenen yemek fotoğrafı", "Uploaded meal photo")}
              className="h-40 w-40 shrink-0 rounded-lg object-cover"
            />
            <div className="flex-1 space-y-3">
              {isAnalyzingPhoto ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Spinner />
                  {t("Fotoğraf analiz ediliyor...", "Analyzing photo...")}
                </div>
              ) : (
                <>
                  {photoError ? <ErrorBanner message={photoError} /> : null}
                  {reviewItems.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3"
                    >
                      <p className="mb-2 text-xs text-zinc-500">
                        {t("Tanınan", "Detected")}: &ldquo;{item.detectedName}&rdquo;
                        {!item.selectedFood && item.candidateNames.length > 0 ? (
                          <> — {t("katalogda net eşleşme yok, öneriler", "no exact catalog match, suggestions")}: {item.candidateNames.join(", ")}</>
                        ) : null}
                        {!item.selectedFood && item.candidateNames.length === 0 ? (
                          <> — {t("katalogda bulunamadı, elle aramalısın", "not found in catalog, search manually")}</>
                        ) : null}
                      </p>
                      {item.isUncertain ? (
                        <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {t(
                            "Koç bu öğenin porsiyonundan/içeriğinden tam emin değil — gramajı gözden geçirmeni öneririz.",
                            "Your coach isn't fully sure about this item's portion/content — we recommend double-checking the amount."
                          )}
                        </p>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-[2fr,1fr,1fr,auto]">
                        <SearchableSelect<FoodCatalogItem>
                          selectedLabel={item.foodQuery}
                          onQueryChange={(value) =>
                            updateReviewItem(item.key, { foodQuery: value, selectedFood: null })
                          }
                          onSearch={(query) => (token ? searchFoods(token, query) : Promise.resolve([]))}
                          onSelect={(food) =>
                            updateReviewItem(item.key, {
                              selectedFood: food,
                              foodQuery: catalogDisplayName(food, language),
                            })
                          }
                          getLabel={(food) => catalogDisplayName(food, language)}
                          getKey={(food) => food.id}
                          placeholder={t("Besin adı yaz...", "Type food name...")}
                        />
                        <TextInput
                          type="number"
                          min={1}
                          value={item.grams}
                          onChange={(e) => updateReviewItem(item.key, { grams: e.target.value })}
                        />
                        <Select
                          value={item.mealType}
                          onChange={(e) =>
                            updateReviewItem(item.key, { mealType: e.target.value as MealType })
                          }
                        >
                          {MEAL_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {MEAL_TYPE_LABELS[language][type]}
                            </option>
                          ))}
                        </Select>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveReviewItem(item.key)}
                            className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                            aria-label={t("Kaydet", "Save")}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscardReviewItem(item.key)}
                            className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                            aria-label={t("Vazgeç", "Cancel")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {item.error ? (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{item.error}</p>
                      ) : null}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Fotoğraf Geçmişi", "Photo History")}
        </h2>
        {photoHistoryError ? <ErrorBanner message={photoHistoryError} /> : null}
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : photoHistory.length === 0 ? (
          <EmptyState
            icon={<Camera className="h-8 w-8" />}
            message={t(
              "Henüz analiz edilmiş bir fotoğraf yok. Yukarıdan bir yemek fotoğrafı yükledikçe burada birikecek.",
              "No analyzed photos yet. They'll appear here as you upload meal photos above."
            )}
          />
        ) : (
          <div className="flex flex-wrap gap-4">
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
        ) : historyItems.length === 0 ? (
          <EmptyState
            icon={<Apple className="h-8 w-8" />}
            message={t(
              "Henüz bir öğün kaydı yok. Yukarıdaki formdan veya fotoğrafla ilk kaydını ekleyebilirsin.",
              "No meal logged yet. You can add your first entry using the form above or a photo."
            )}
          />
        ) : (
          <div className="space-y-4">
            {groupEntriesByDate(historyItems, (entry) => entry.log_date, language).map((group) => (
              <div key={group.label}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {group.label}
                </h3>
                <div className="space-y-1.5">
                  {group.items.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {editingEntryId === entry.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {entry.food_name_snapshot} ({MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type})
                    </span>
                    <TextInput
                      type="number"
                      min={1}
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-20"
                    />
                    <span className="text-xs text-zinc-500">g</span>
                    <button
                      type="button"
                      onClick={() => handleSaveEntry(entry.id)}
                      className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                      aria-label={t("Kaydet", "Save")}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntryId(null)}
                      className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      aria-label={t("Vazgeç", "Cancel")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-zinc-700 dark:text-zinc-200">
                      {entry.food_name_snapshot} (
                      {MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type})
                      <br />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {entry.quantity_grams.toFixed(0)} g, {entry.calories_kcal.toFixed(0)} kcal
                      </span>
                      <br />
                      <EntryNutrientBreakdown entry={entry} t={t} />
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditEntry(entry)}
                        className="text-zinc-400 transition-colors hover:text-accent"
                        aria-label={t("Kaydı düzenle", "Edit entry")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        aria-label={t("Kaydı sil", "Delete entry")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
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

      <div className="grid gap-7 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Kalori Trendi", "Calorie Trend")}
          </h2>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <CalorieTrendChart entries={entries} />}
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Bugünkü Makro Dağılımı", "Today's Macro Breakdown")}
          </h2>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <MacroDistributionChart
              proteinG={summary?.total_protein_g ?? 0}
              carbsG={summary?.total_carbs_g ?? 0}
              fatG={summary?.total_fat_g ?? 0}
              sugarG={summary?.total_sugar_g ?? 0}
              sodiumMg={summary?.total_sodium_mg ?? 0}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
