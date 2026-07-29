"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Apple, ClipboardList, Flame, Save } from "lucide-react";
import {
  ApiError,
  MEAL_TYPES,
  getDailyNutritionSummary,
  getMealEntries,
  logMealEntry,
  searchFoods,
  type DailyNutritionSummary,
  type FoodCatalogItem,
  type MealEntry,
  type MealType,
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
  Select,
  Skeleton,
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

  const hasGoals =
    summary &&
    (summary.calorie_goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Beslenme</h1>

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
            />
          )}
        </Card>
      </div>
    </div>
  );
}
