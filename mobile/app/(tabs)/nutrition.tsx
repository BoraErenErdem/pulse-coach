import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Check, Pencil, Trash2, X } from "lucide-react-native";
import {
  ApiError,
  MEAL_TYPES,
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
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  ChipSelect,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  colors,
  seriesColors,
} from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";
import { SearchableSelect } from "@/components/searchable-select";
import { CalorieTrendChart } from "@/components/charts/calorie-trend-chart";
import { MacroDistributionChart } from "@/components/charts/macro-distribution-chart";

// web/src/app/(app)/nutrition/page.tsx'in mobil portu - Faz M4 (2/2), önce
// fotoğrafsız temel (bu dosya), fotoğrafla ekleme ayrı bir canlı-test
// adımında eklenecek (plan kararı: en riskli parça, önce temel doğrulansın).
const MEAL_TYPE_LABELS: Record<MealType, string> = {
  kahvaltı: "Kahvaltı",
  öğle: "Öğle",
  akşam: "Akşam",
  atıştırmalık: "Atıştırmalık",
};

export default function NutritionTab() {
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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function parseLocaleNumber(text: string): number {
    return Number(text.replace(",", "."));
  }

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!selectedFood) {
      setFormError("Listeden bir besin seçmelisin (kalori/makro hesaplaması için gerekli).");
      return;
    }
    const quantityNumber = parseLocaleNumber(quantity);
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
    summary && (summary.calorie_goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Beslenme</Text>

        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <View style={styles.statGrid}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : (
          <View style={styles.statGrid}>
            <StatTile
              label="Bugün Kalori"
              value={`${(summary?.total_calories_kcal ?? 0).toFixed(0)} kcal`}
              color={seriesColors.series1}
            />
            <StatTile
              label="Bugün Protein"
              value={`${(summary?.total_protein_g ?? 0).toFixed(0)} g`}
              color={seriesColors.series2}
            />
            <StatTile
              label="Bugün Lif"
              value={`${(summary?.total_fiber_g ?? 0).toFixed(0)} g`}
              color={seriesColors.series5}
            />
            <StatTile
              label="Bugün Sodyum"
              value={`${(summary?.total_sodium_mg ?? 0).toFixed(0)} mg`}
              color={seriesColors.series6}
            />
            <StatTile label="Bugün Kayıt" value={String(summary?.entry_count ?? 0)} color={seriesColors.series3} />
          </View>
        )}

        {!isLoading && summary ? (
          <InfoBanner
            message={
              summary.entry_count > 0
                ? summary.summary_text
                : "Bugün için henüz öğün kaydı yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin."
            }
          />
        ) : null}

        {!isLoading && hasGoals && summary ? (
          <Card>
            <Text style={styles.cardTitle}>Günlük Hedef Karşılaştırma</Text>
            <View style={{ gap: 14 }}>
              {summary.calorie_goal ? (
                <GoalMeter
                  label="Kalori"
                  value={summary.total_calories_kcal}
                  goal={summary.calorie_goal}
                  unit="kcal"
                  color={seriesColors.series1}
                />
              ) : null}
              {summary.protein_goal_g ? (
                <GoalMeter
                  label="Protein"
                  value={summary.total_protein_g}
                  goal={summary.protein_goal_g}
                  unit="g"
                  color={seriesColors.series2}
                />
              ) : null}
              {summary.carbs_goal_g ? (
                <GoalMeter
                  label="Karbonhidrat"
                  value={summary.total_carbs_g}
                  goal={summary.carbs_goal_g}
                  unit="g"
                  color={seriesColors.series3}
                />
              ) : null}
              {summary.fat_goal_g ? (
                <GoalMeter
                  label="Yağ"
                  value={summary.total_fat_g}
                  goal={summary.fat_goal_g}
                  unit="g"
                  color={seriesColors.series4}
                />
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.cardTitle}>Öğün Kaydet</Text>
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <View>
            <FormLabel>Besin</FormLabel>
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
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <FormLabel>Miktar (g)</FormLabel>
              <FormInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
            </View>
          </View>

          <View>
            <FormLabel>Öğün</FormLabel>
            <ChipSelect options={MEAL_TYPES} value={mealType} onChange={setMealType} labels={MEAL_TYPE_LABELS} />
          </View>

          <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Geçmiş Kayıtlar</Text>
          {historyError ? <ErrorBanner message={historyError} /> : null}
          {isLoading ? (
            <Skeleton height={140} />
          ) : entries.length === 0 ? (
            <Text style={styles.emptyText}>
              Henüz bir öğün kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {[...entries].reverse().map((entry) => (
                <View key={entry.id} style={styles.entryRow}>
                  {editingEntryId === entry.id ? (
                    <View style={styles.entryEditRow}>
                      <Text style={styles.entryEditName}>{entry.food_name_snapshot}</Text>
                      <FormInput
                        value={editQuantity}
                        onChangeText={setEditQuantity}
                        keyboardType="number-pad"
                        style={{ width: 64 }}
                      />
                      <Text style={styles.entryEditUnit}>g</Text>
                      <Pressable onPress={() => handleSaveEntry(entry.id)} hitSlop={8}>
                        <Check size={16} color={colors.success} />
                      </Pressable>
                      <Pressable onPress={() => setEditingEntryId(null)} hitSlop={8}>
                        <X size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.entryText}>
                        {entry.food_name_snapshot} ({MEAL_TYPE_LABELS[entry.meal_type as MealType] ?? entry.meal_type})
                        {"\n"}
                        <Text style={styles.entryMeta}>
                          {entry.quantity_grams.toFixed(0)} g, {entry.calories_kcal.toFixed(0)} kcal
                        </Text>
                      </Text>
                      <View style={styles.iconRow}>
                        <Pressable onPress={() => handleStartEditEntry(entry)} hitSlop={8}>
                          <Pencil size={14} color={colors.muted} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteEntry(entry.id)} hitSlop={8}>
                          <Trash2 size={14} color={colors.muted} />
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Kalori Trendi</Text>
          {isLoading ? <Skeleton height={200} /> : <CalorieTrendChart entries={entries} />}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Bugünkü Makro Dağılımı</Text>
          {isLoading ? (
            <Skeleton height={200} />
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
  entryEditName: { fontSize: 12, color: colors.muted },
  entryEditUnit: { fontSize: 11, color: colors.muted },
  entryText: { fontSize: 13, color: colors.text, flex: 1 },
  entryMeta: { fontSize: 12, color: colors.muted },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
