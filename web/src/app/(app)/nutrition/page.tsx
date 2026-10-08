"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Apple,
  Camera,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
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
import { catalogDisplayName, foodDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { formatInt, toLocaleUpper } from "@/lib/format";
import { buildTodayInsight } from "@/lib/nutrition-insight";
import {
  Card,
  FormCard,
  EmptyState,
  ErrorBanner,
  IconButton,
  InsightCard,
  Label,
  NUTRIENT_SERIES_VAR,
  type NutrientKey,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Select,
  Skeleton,
  Spinner,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { DailyCalorieChart } from "@/components/charts/DailyCalorieChart";
import { PillToggle } from "@/components/charts/panel-parts";
import { Stepper } from "@/components/form-controls";
import { FoodPreview, MEAL_LABELS as MEAL_TYPE_LABELS, MealTypeChips, MealTypeIcon, mealTypeForNow } from "@/components/nutrition-parts";

import { MacroDistributionChart } from "@/components/charts/MacroDistributionChart";
import { NutritionHero } from "@/components/NutritionHero";

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
    { key: "karbonhidrat", label: t("Karb.", "Carbs"), value: `${entry.carbs_g.toFixed(0)} g` },
    { key: "yağ", label: t("Yağ", "Fat"), value: `${entry.fat_g.toFixed(0)} g` },
  ];
  if (entry.sugar_g !== null) parts.push({ key: "şeker", label: t("Şeker", "Sugar"), value: `${entry.sugar_g.toFixed(0)} g` });
  if (entry.fiber_g !== null) parts.push({ key: "lif", label: t("Lif", "Fiber"), value: `${entry.fiber_g.toFixed(0)} g` });
  if (entry.sodium_mg !== null) parts.push({ key: "sodyum", label: t("Sodyum", "Sodium"), value: `${entry.sodium_mg.toFixed(0)} mg` });

  return (
    <p className="text-xs leading-relaxed text-zinc-500 dark:text-white/75">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? " · " : ""}
          <span className="font-semibold" style={{ color: `var(${NUTRIENT_SERIES_VAR[p.key]})` }}>{p.label}</span> {p.value}
        </span>
      ))}
    </p>
  );
}

// mood-history.tsx (mobil)::todayIso ile AYNI desen - MealEntry.log_date
// ("YYYY-MM-DD") ile karşılaştırmak için yerel (UTC değil) bugünün tarihi.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const [logMode, setLogMode] = useState<"search" | "photo">("search");
  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [mealType, setMealType] = useState<MealType>(() => mealTypeForNow());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [calorieRange, setCalorieRange] = useState<7 | 14 | 30>(14);
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


  // Bugün = kullanıcının YEREL günü; `entries` son 30 günü kapsıyor (mobil nutrition.tsx ile aynı).
  const todayKey = todayIso();
  const todayEntries = useMemo(() => entries.filter((e) => e.log_date === todayKey), [entries, todayKey]);
  const mealGroups = MEAL_TYPES.map((type) => {
    const items = todayEntries.filter((e) => e.meal_type === type);
    return { type, items, kcal: items.reduce((sum, e) => sum + e.calories_kcal, 0) };
  });
  // Geçmiş = ÖNCEKİ günler (bugün "Bugünkü Öğünler"de). Gün toplamı tam veriden (`entries` 30 gün);
  // daha eski günde yalnız yüklenenlerin toplamı, "≥" ile.
  const olderHistory = historyItems.filter((e) => e.log_date !== todayKey);
  const dayTotals = new Map<string, number>();
  for (const e of entries) dayTotals.set(e.log_date, (dayTotals.get(e.log_date) ?? 0) + e.calories_kcal);
  const oldestFullDay = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const fmtInt = (n: number) => formatInt(n, language);
  const quantityNumber = Number(quantity.replace(",", "."));

  function openFormFor(type: MealType) {
    setMealType(type);
    setLogMode("search");
    setIsFormOpen(true);
    requestAnimationFrame(() => document.getElementById("meal-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function renderEntryRow(entry: MealEntry, showMealType: boolean) {
    const name = foodDisplayName(entry, language);
    return (
      <div key={entry.id} className="flex items-start gap-2 rounded-[14px] bg-[var(--pc-box)] py-2.5 pl-3.5 pr-1.5">
        {editingEntryId === entry.id ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white">{name}</span>
            <TextInput
              type="number"
              min={1}
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
              className="w-20"
              aria-label={t("Miktar (gram)", "Quantity (grams)")}
            />
            <span className="text-xs text-zinc-500">g</span>
            <IconButton label={t("Kaydet", "Save")} onClick={() => handleSaveEntry(entry.id)} className="hover:text-green-600 dark:hover:text-green-400">
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("Vazgeç", "Cancel")} onClick={() => setEditingEntryId(null)} className="hover:text-red-600 dark:hover:text-red-400">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {name}
                {showMealType ? (
                  <span className="ml-2 text-xs font-normal text-zinc-500">{MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type}</span>
                ) : null}
              </p>
              <p className="text-xs text-zinc-500">
                {fmtInt(entry.quantity_grams)} g · <span className="font-bold text-[var(--tone-accent)]">{fmtInt(entry.calories_kcal)} kcal</span>
              </p>
              <EntryNutrientBreakdown entry={entry} t={t} />
            </div>
            <IconButton label={t(`${name} miktarını düzenle`, `Edit ${name} quantity`)} onClick={() => handleStartEditEntry(entry)} className="hover:text-[var(--tone-accent)]">
              <Pencil className="h-[15px] w-[15px]" />
            </IconButton>
            <IconButton label={t("Kaydı sil", "Delete entry")} onClick={() => handleDeleteEntry(entry.id)} className="hover:text-red-600 dark:hover:text-red-400">
              <Trash2 className="h-[15px] w-[15px]" />
            </IconButton>
          </>
        )}
      </div>
    );
  }

  // Masaüstü düzeni (2026-10-08): mobil SIRASIYLA bantlar - Bugün kartı + koç özeti solda, Öğün
  // Kaydet + Bugünkü Öğünler sağda; Kalori Trendi ile Makro Dağılımı yan yana; Geçmiş ve Fotoğraf
  // Geçmişi tam genişlik ızgara.
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Beslenme", "Nutrition")}</h1>
      {loadError ? <ErrorBanner message={loadError} /> : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {isLoading ? (
            <Skeleton className="h-72 rounded-[20px]" />
          ) : summary ? (
            <NutritionHero summary={summary} sodiumIncomplete={todayEntries.some((e) => e.sodium_mg === null)} />
          ) : null}
          {!isLoading && summary && summary.entry_count > 0 ? (
            <InsightCard title={t("Bugünün Özeti", "Today at a Glance")} message={buildTodayInsight(todayEntries, summary, t, language) ?? summary.summary_text} />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {!isFormOpen && formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          <FormCard id="meal-form" title={t("Öğün Kaydet", "Log Meal")} open={isFormOpen} onOpenChange={setIsFormOpen}>
            <div role="tablist" aria-label={t("Kayıt yöntemi", "Logging method")} className="mb-4 flex gap-[3px] rounded-2xl bg-[var(--pc-tabs)] p-[3px]">
              {(
                [
                  { key: "search", label: t("Listeden Ara", "Search"), icon: Search },
                  { key: "photo", label: t("Fotoğrafla", "From Photo"), icon: Camera },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  role="tab"
                  aria-selected={logMode === mode.key}
                  onClick={() => setLogMode(mode.key)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[13px] px-3 text-sm font-semibold transition-colors ${
                    logMode === mode.key ? "bg-[var(--tone-fill)] text-[var(--tone-on-fill)] shadow-sm" : "text-zinc-600 hover:text-zinc-900 dark:text-white/80 dark:hover:text-white"
                  }`}
                >
                  <mode.icon className="h-4 w-4" aria-hidden="true" />
                  {mode.label}
                </button>
              ))}
            </div>
            {logMode === "search" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
                {formError ? <ErrorBanner message={formError} /> : null}
                <div>
                  <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Öğün", "Meal")}</p>
                  <MealTypeChips value={mealType} onChange={setMealType} />
                </div>
                <div>
                  <Label htmlFor="foodSearch">{t("Besin", "Food")}</Label>
                  <SearchableSelect<FoodCatalogItem>
                    id="foodSearch"
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
                  <Stepper id="quantity" value={quantity} onChange={setQuantity} step={25} min={0} />
                </div>
                {selectedFood && quantityNumber > 0 ? <FoodPreview food={selectedFood} grams={quantityNumber} /> : null}
                <PrimaryButton type="submit" disabled={isSubmitting} className="w-full">
                  <Plus className="h-4 w-4" />
                  {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Öğüne Ekle", "Add to Meal")}
                </PrimaryButton>
              </form>
            ) : (
              <>
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
              </>
            )}
          </FormCard>

          <Card>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Bugünkü Öğünler", "Today's Meals")}</h2>
            <p className="mb-4 mt-1 text-sm text-zinc-500">
              {todayEntries.length > 0
                ? t("Düzenlemek ya da silmek için satırdaki simgeleri kullan.", "Use the icons on a row to edit or delete.")
                : t("Bir öğüne tıklayarak hızlıca kayıt ekleyebilirsin.", "Click a meal to quickly add an entry.")}
            </p>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <div className="flex flex-col gap-3">
                {mealGroups.map((group) => (
                  <div key={group.type} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tone-fill)_35%,transparent)] text-[var(--tone-accent)] dark:bg-[color-mix(in_srgb,var(--tone-accent)_20%,transparent)] dark:text-white">
                        <MealTypeIcon type={group.type} className="h-[15px] w-[15px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">{MEAL_TYPE_LABELS[language][group.type]}</p>
                        {group.items.length === 0 ? <p className="text-xs text-zinc-500">{t("Henüz kayıt yok", "Nothing logged yet")}</p> : null}
                      </div>
                      {group.items.length > 0 ? (
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {fmtInt(group.kcal)} <span className="font-medium text-zinc-500">kcal</span>
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openFormFor(group.type)}
                        aria-label={t(`${MEAL_TYPE_LABELS.tr[group.type]} öğününe ekle`, `Add to ${MEAL_TYPE_LABELS.en[group.type].toLowerCase()}`)}
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--tone-accent)_70%,transparent)] text-[var(--tone-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--tone-accent)_15%,transparent)]">
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                        </span>
                      </button>
                    </div>
                    {group.items.length > 0 ? <div className="flex flex-col gap-2">{group.items.map((entry) => renderEntryRow(entry, false))}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Kalori Trendi", "Calorie Trend")}</h2>
            <PillToggle
              label={t("Zaman aralığı", "Time range")}
              options={[
                { key: 7, label: t("7 gün", "7 days") },
                { key: 14, label: t("14 gün", "14 days") },
                { key: 30, label: t("30 gün", "30 days") },
              ]}
              active={calorieRange}
              onChange={setCalorieRange}
            />
          </div>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <DailyCalorieChart entries={entries} days={calorieRange} goal={summary?.calorie_goal ?? null} />}
        </Card>
        <Card>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Bugünkü Makro Dağılımı", "Today's Macro Breakdown")}</h2>
          {todayEntries.length > 0 ? (
            <p className="mt-1 text-sm text-zinc-500">{t("Bir çubuğa tıklayarak hangi besinden geldiğini gör.", "Click a bar to see which foods it came from.")}</p>
          ) : null}
          <div className="mt-4">
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
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
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Geçmiş Kayıtlar", "History")}</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-500">{t("Önceki günler.", "Previous days.")}</p>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : olderHistory.length === 0 && !hasMoreHistory ? (
          <EmptyState icon={<Apple className="h-8 w-8" />} message={t("Önceki günlere ait bir öğün kaydı yok.", "No meals logged on previous days.")} />
        ) : (
          <div className="space-y-5">
            {groupEntriesByDate(olderHistory, (entry) => entry.log_date, language).map((group) => {
              const dayKey = group.items[0]?.log_date ?? "";
              const isFull = dayKey >= oldestFullDay && dayTotals.has(dayKey);
              const dayKcal = isFull ? (dayTotals.get(dayKey) ?? 0) : group.items.reduce((sum, e) => sum + e.calories_kcal, 0);
              return (
                <div key={group.label}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold tracking-wide text-zinc-500">{toLocaleUpper(group.label, language)}</h3>
                    <span className="text-xs font-semibold text-zinc-500">
                      {isFull ? "" : "≥ "}
                      {fmtInt(dayKcal)} kcal
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">{group.items.map((entry) => renderEntryRow(entry, true))}</div>
                </div>
              );
            })}
            {hasMoreHistory ? (
              <SecondaryButton onClick={handleLoadMoreHistory} disabled={isLoadingMoreHistory} className="w-full">
                {isLoadingMoreHistory ? t("Yükleniyor...", "Loading...") : t("Daha Fazla Göster", "Show More")}
              </SecondaryButton>
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Fotoğraf Geçmişi", "Photo History")}</h2>
        {photoHistoryError ? <ErrorBanner message={photoHistoryError} /> : null}
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : photoHistory.length === 0 ? (
          <EmptyState
            icon={<Camera className="h-8 w-8" />}
            message={t(
              "Henüz analiz edilmiş bir fotoğraf yok. Öğün Kaydet > Fotoğrafla ile yüklediğin fotoğraflar burada birikir.",
              "No analyzed photos yet. Photos from Log Meal > From Photo will collect here."
            )}
          />
        ) : (
          <div className="flex flex-wrap gap-4">
            {photoHistory.map((photo) =>
              token ? <PhotoHistoryThumbnail key={photo.id} photo={photo} token={token} onDelete={handleDeletePhotoHistoryEntry} /> : null
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
