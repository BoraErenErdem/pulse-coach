"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Apple, Camera, Check, ClipboardList, Droplet, Flame, Pencil, Save, Trash2, X } from "lucide-react";
import {
  ApiError,
  MEAL_TYPES,
  analyzeMealPhoto,
  deleteMealEntry,
  getDailyNutritionSummary,
  getMealEntries,
  logMealEntry,
  searchFoods,
  updateMealEntry,
  type DailyNutritionSummary,
  type FoodCatalogItem,
  type MealEntry,
  type MealType,
  type PhotoMealItem,
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
  Select,
  Skeleton,
  Spinner,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { CalorieTrendChart } from "@/components/charts/CalorieTrendChart";
import { MacroDistributionChart } from "@/components/charts/MacroDistributionChart";

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  kahvaltı: "Kahvaltı",
  öğle: "Öğle",
  akşam: "Akşam",
  atıştırmalık: "Atıştırmalık",
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
}

function reviewItemFromDetected(item: PhotoMealItem, index: number): PhotoReviewItem {
  // SADECE net (matched_food) bir eşleşme varsa önceden seçili göster —
  // candidates listesindeki İLK öneriyi otomatik seçmek yanlış olurdu
  // (düşük güvenli bir tahmin, kullanıcı fark etmeden yanlış besini
  // kaydedebilir). Eşleşme yoksa alan boş kalır, kullanıcı bilinçli olarak
  // arayıp seçmeli — uygulamanın geri kalanındaki "asla tahmini değer
  // yazma" ilkesiyle tutarlı.
  return {
    key: `${index}-${item.food_name}`,
    detectedName: item.food_name,
    foodQuery: item.matched_food?.name_tr ?? item.food_name,
    selectedFood: item.matched_food,
    candidateNames: item.candidates.map((c) => c.name_tr),
    grams: String(Math.round(item.estimated_grams)),
    mealType: "öğle",
    error: null,
  };
}

export default function NutritionPage() {
  const { token } = useAuth();
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

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<PhotoReviewItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, entriesData] = await Promise.all([
        getDailyNutritionSummary(token),
        getMealEntries(token, 30),
      ]);
      setSummary(summaryData);
      setEntries(entriesData);
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!selectedFood) {
      setFormError("Listeden bir besin seçmelisin (kalori/makro hesaplaması için gerekli).");
      return;
    }
    const quantityNumber = Number(quantity);
    if (!quantityNumber || quantityNumber <= 0) {
      setFormError("Miktar (gram) sıfırdan büyük olmalı.");
      return;
    }

    setIsSubmitting(true);
    try {
      await logMealEntry(token, {
        food_catalog_id: selectedFood.id,
        quantity_grams: quantityNumber,
        meal_type: mealType,
      });
      setFormSuccess("Öğün kaydedildi!");
      setSelectedFood(null);
      setFoodQuery("");
      setQuantity("100");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSubmitting(false);
    }
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
        setPhotoError("Fotoğrafta tanınabilir bir besin bulunamadı. Farklı bir fotoğraf deneyebilir ya da elle ekleyebilirsin.");
      }
      setReviewItems(result.items.map(reviewItemFromDetected));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Fotoğraf analiz edilemedi, tekrar dener misin?");
    } finally {
      setIsAnalyzingPhoto(false);
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
      updateReviewItem(key, { error: "Listeden bir besin seçmelisin." });
      return;
    }
    const gramsNumber = Number(item.grams);
    if (!gramsNumber || gramsNumber <= 0) {
      updateReviewItem(key, { error: "Miktar (gram) sıfırdan büyük olmalı." });
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
        error: err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?",
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
      setHistoryError(err instanceof ApiError ? err.message : "Güncellenemedi, tekrar dener misin?");
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
      setHistoryError(err instanceof ApiError ? err.message : "Silinemedi, tekrar dener misin?");
    }
  }

  const hasGoals =
    summary &&
    (summary.calorie_goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Beslenme</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-4">
          <StatTile
            label="Bugün Kalori"
            value={`${(summary?.total_calories_kcal ?? 0).toFixed(0)} kcal`}
            icon={<Flame className="h-4 w-4" />}
            seriesVar="--series-1"
          />
          <StatTile
            label="Bugün Protein"
            value={`${(summary?.total_protein_g ?? 0).toFixed(0)} g`}
            icon={<Apple className="h-4 w-4" />}
            seriesVar="--series-2"
          />
          <StatTile
            label="Bugün Sodyum"
            value={`${(summary?.total_sodium_mg ?? 0).toFixed(0)} mg`}
            icon={<Droplet className="h-4 w-4" />}
            seriesVar="--series-4"
          />
          <StatTile
            label="Bugün Kayıt"
            value={String(summary?.entry_count ?? 0)}
            icon={<ClipboardList className="h-4 w-4" />}
            seriesVar="--series-3"
          />
        </div>
      )}

      {!isLoading && summary ? (
        summary.entry_count > 0 ? (
          <InfoBanner message={summary.summary_text} />
        ) : (
          <InfoBanner message="Bugün için henüz öğün kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin." />
        )
      ) : null}

      {!isLoading && hasGoals && summary ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Günlük Hedef Karşılaştırma
          </h2>
          <div className="space-y-4">
            {summary.calorie_goal ? (
              <GoalMeter
                label="Kalori"
                value={summary.total_calories_kcal}
                goal={summary.calorie_goal}
                unit="kcal"
                seriesVar="--series-1"
              />
            ) : null}
            {summary.protein_goal_g ? (
              <GoalMeter
                label="Protein"
                value={summary.total_protein_g}
                goal={summary.protein_goal_g}
                unit="g"
                seriesVar="--series-2"
              />
            ) : null}
            {summary.carbs_goal_g ? (
              <GoalMeter
                label="Karbonhidrat"
                value={summary.total_carbs_g}
                goal={summary.carbs_goal_g}
                unit="g"
                seriesVar="--series-3"
              />
            ) : null}
            {summary.fat_goal_g ? (
              <GoalMeter
                label="Yağ"
                value={summary.total_fat_g}
                goal={summary.fat_goal_g}
                unit="g"
                seriesVar="--series-4"
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Öğün Kaydet
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid gap-3 sm:grid-cols-[2fr,1fr,1fr]">
            <div>
              <Label>Besin</Label>
              <SearchableSelect<FoodCatalogItem>
                selectedLabel={foodQuery}
                onQueryChange={(value) => {
                  setFoodQuery(value);
                  setSelectedFood(null);
                }}
                onSearch={(query) => (token ? searchFoods(token, query) : Promise.resolve([]))}
                onSelect={(item) => {
                  setSelectedFood(item);
                  setFoodQuery(item.name_tr);
                }}
                getLabel={(item) => item.name_tr}
                getKey={(item) => item.id}
                placeholder="Besin adı yaz..."
              />
            </div>
            <div>
              <Label htmlFor="quantity">Miktar (g)</Label>
              <TextInput
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mealType">Öğün</Label>
              <Select
                id="mealType"
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealType)}
              >
                {MEAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MEAL_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <PrimaryButton type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Fotoğrafla Ekle
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Yemeğinin fotoğrafını yükle, koçun besinleri tanıyıp tahmini porsiyonları önersin —
          kalori/makro hesabı her zaman katalogdan geldiği için kaydetmeden önce her besini
          gözden geçirip onaylaman gerekir.
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
            Fotoğraf Seç
          </SecondaryButton>
          {photoPreviewUrl ? (
            <button
              type="button"
              onClick={handleClearPhotoReview}
              className="text-sm text-zinc-500 underline-offset-2 hover:underline"
            >
              Temizle
            </button>
          ) : null}
        </div>

        {photoPreviewUrl ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- yerel blob: URL, next/image optimize edemiyor */}
            <img
              src={photoPreviewUrl}
              alt="Yüklenen yemek fotoğrafı"
              className="h-40 w-40 shrink-0 rounded-lg object-cover"
            />
            <div className="flex-1 space-y-3">
              {isAnalyzingPhoto ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Spinner />
                  Fotoğraf analiz ediliyor...
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
                        Tanınan: &ldquo;{item.detectedName}&rdquo;
                        {!item.selectedFood && item.candidateNames.length > 0 ? (
                          <> — katalogda net eşleşme yok, öneriler: {item.candidateNames.join(", ")}</>
                        ) : null}
                        {!item.selectedFood && item.candidateNames.length === 0 ? (
                          <> — katalogda bulunamadı, elle aramalısın</>
                        ) : null}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-[2fr,1fr,1fr,auto]">
                        <SearchableSelect<FoodCatalogItem>
                          selectedLabel={item.foodQuery}
                          onQueryChange={(value) =>
                            updateReviewItem(item.key, { foodQuery: value, selectedFood: null })
                          }
                          onSearch={(query) => (token ? searchFoods(token, query) : Promise.resolve([]))}
                          onSelect={(food) =>
                            updateReviewItem(item.key, { selectedFood: food, foodQuery: food.name_tr })
                          }
                          getLabel={(food) => food.name_tr}
                          getKey={(food) => food.id}
                          placeholder="Besin adı yaz..."
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
                              {MEAL_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </Select>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveReviewItem(item.key)}
                            className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                            aria-label="Kaydet"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscardReviewItem(item.key)}
                            className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                            aria-label="Vazgeç"
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
          Geçmiş Kayıtlar
        </h2>
        {historyError ? <ErrorBanner message={historyError} /> : null}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500">Henüz bir öğün kaydı yok.</p>
        ) : (
          <div className="space-y-1.5">
            {[...entries].reverse().map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {editingEntryId === entry.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {entry.food_name_snapshot} ({MEAL_TYPE_LABELS[entry.meal_type as MealType] ?? entry.meal_type})
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
                      aria-label="Kaydet"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntryId(null)}
                      className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Vazgeç"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-zinc-700 dark:text-zinc-200">
                      {entry.log_date} — {entry.food_name_snapshot} (
                      {MEAL_TYPE_LABELS[entry.meal_type as MealType] ?? entry.meal_type}),{" "}
                      {entry.quantity_grams.toFixed(0)} g, {entry.calories_kcal.toFixed(0)} kcal
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditEntry(entry)}
                        className="text-zinc-400 transition-colors hover:text-accent"
                        aria-label="Kaydı düzenle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Kaydı sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-7 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Kalori Trendi
          </h2>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <CalorieTrendChart entries={entries} />}
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Bugünkü Makro Dağılımı
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
