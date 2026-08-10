import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { AlertTriangle, Camera, Check, Image as ImageIcon, Pencil, Trash2, X } from "lucide-react-native";
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
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { formatDate, parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ChipSelect,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  SecondaryButton,
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

// web/src/app/(app)/nutrition/page.tsx'in mobil portu - Faz M4 (2/2)
// tamamlandı: önce fotoğrafsız temel canlı doğrulandı, şimdi fotoğrafla
// ekleme de eklendi (plan kararı: en riskli parça, temel doğrulandıktan
// sonra sırası geldi).
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
    <View style={thumbStyles.wrapper}>
      <View style={thumbStyles.imageBox}>
        {localUri ? (
          <Image source={{ uri: localUri }} style={thumbStyles.image} />
        ) : hasError ? (
          <Text style={thumbStyles.errorText}>{t("Yüklenemedi", "Failed to load")}</Text>
        ) : (
          <Skeleton height={96} />
        )}
      </View>
      <Pressable onPress={() => onDelete(photo.id)} style={thumbStyles.deleteButton} hitSlop={8}>
        <X size={12} color="#fff" />
      </Pressable>
      <Text style={thumbStyles.dateText} numberOfLines={1}>
        {formatPhotoDate(photo.created_at, language)}
      </Text>
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  wrapper: { width: 96 },
  imageBox: {
    width: 96,
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  errorText: { fontSize: 11, color: colors.muted },
  deleteButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: colors.error,
    borderRadius: 999,
    padding: 4,
  },
  dateText: { marginTop: 4, fontSize: 11, color: colors.muted },
});

export default function NutritionTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
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

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, entriesData, photoHistoryData] = await Promise.all([
        getDailyNutritionSummary(token),
        getMealEntries(token, 30),
        getPhotoHistory(token),
      ]);
      setSummary(summaryData);
      setEntries(entriesData);
      setPhotoHistory(photoHistoryData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("Beslenme", "Nutrition")}</Text>

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
              label={t("Bugün Kalori", "Calories Today")}
              value={`${(summary?.total_calories_kcal ?? 0).toFixed(0)} kcal`}
              color={seriesColors.series1}
            />
            <StatTile
              label={t("Bugün Protein", "Protein Today")}
              value={`${(summary?.total_protein_g ?? 0).toFixed(0)} g`}
              color={seriesColors.series2}
            />
            <StatTile
              label={t("Bugün Lif", "Fiber Today")}
              value={`${(summary?.total_fiber_g ?? 0).toFixed(0)} g`}
              color={seriesColors.series5}
            />
            <StatTile
              label={t("Bugün Sodyum", "Sodium Today")}
              value={`${(summary?.total_sodium_mg ?? 0).toFixed(0)} mg`}
              color={seriesColors.series6}
            />
            <StatTile label={t("Bugün Kayıt", "Entries Today")} value={String(summary?.entry_count ?? 0)} color={seriesColors.series3} />
          </View>
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
          <Card>
            <Text style={styles.cardTitle}>{t("Günlük Hedef Karşılaştırma", "Daily Goal Comparison")}</Text>
            <View style={{ gap: 14 }}>
              {summary.calorie_goal ? (
                <GoalMeter
                  label={t("Kalori", "Calories")}
                  value={summary.total_calories_kcal}
                  goal={summary.calorie_goal}
                  unit="kcal"
                  color={seriesColors.series1}
                />
              ) : null}
              {summary.protein_goal_g ? (
                <GoalMeter
                  label={t("Protein", "Protein")}
                  value={summary.total_protein_g}
                  goal={summary.protein_goal_g}
                  unit="g"
                  color={seriesColors.series2}
                />
              ) : null}
              {summary.carbs_goal_g ? (
                <GoalMeter
                  label={t("Karbonhidrat", "Carbs")}
                  value={summary.total_carbs_g}
                  goal={summary.carbs_goal_g}
                  unit="g"
                  color={seriesColors.series3}
                />
              ) : null}
              {summary.fat_goal_g ? (
                <GoalMeter
                  label={t("Yağ", "Fat")}
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
          <Text style={styles.cardTitle}>{t("Öğün Kaydet", "Log Meal")}</Text>
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

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <FormLabel>{t("Miktar (g)", "Quantity (g)")}</FormLabel>
              <FormInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
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

        <Card>
          <Text style={styles.cardTitle}>{t("Fotoğrafla Ekle", "Add via Photo")}</Text>
          <Text style={styles.hintText}>
            {t(
              "Yemeğinin fotoğrafını çek/yükle, koçun besinleri tanıyıp tahmini porsiyonları önersin — gördüğün gram değerleri her zaman bir tahmindir (özellikle yağ/sos gibi gözle görünmeyen bileşenler için sapabilir), kaydetmeden önce dilediğin gibi düzenleyebilir, besini değiştirebilir ya da vazgeçebilirsin.",
              "Take/upload a photo of your meal and let your coach recognize the foods and suggest estimated portions — the gram values you see are always an estimate (it can be off, especially for hidden ingredients like oil/sauce), and you can edit it however you like, change the food, or discard it before saving."
            )}
          </Text>

          <View style={styles.row}>
            <SecondaryButton onPress={handlePickFromCamera}>
              <Camera size={16} color={colors.text} /> {"  "}
              {t("Kameradan Çek", "Take Photo")}
            </SecondaryButton>
            <SecondaryButton onPress={handlePickFromLibrary}>
              <ImageIcon size={16} color={colors.text} /> {"  "}
              {t("Galeriden Seç", "Choose from Gallery")}
            </SecondaryButton>
          </View>

          {photoUri ? (
            <View style={{ gap: 12 }}>
              <View style={styles.photoPreviewRow}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Pressable onPress={handleClearPhotoReview} hitSlop={8}>
                  <Text style={styles.clearText}>{t("Temizle", "Clear")}</Text>
                </Pressable>
              </View>

              {isAnalyzingPhoto ? (
                <View style={styles.analyzingRow}>
                  <Text style={styles.hintText}>{t("Fotoğraf analiz ediliyor...", "Analyzing photo...")}</Text>
                </View>
              ) : (
                <>
                  {photoError ? <ErrorBanner message={photoError} /> : null}
                  {reviewItems.map((item) => (
                    <View key={item.key} style={styles.reviewItemBox}>
                      <Text style={styles.reviewDetected}>
                        {t("Tanınan", "Detected")}: &ldquo;{item.detectedName}&rdquo;
                        {!item.selectedFood && item.candidateNames.length > 0
                          ? ` — ${t("katalogda net eşleşme yok, öneriler", "no exact catalog match, suggestions")}: ${item.candidateNames.join(", ")}`
                          : ""}
                        {!item.selectedFood && item.candidateNames.length === 0
                          ? ` — ${t("katalogda bulunamadı, elle aramalısın", "not found in catalog, search manually")}`
                          : ""}
                      </Text>
                      {item.isUncertain ? (
                        <View style={styles.uncertainRow}>
                          <AlertTriangle size={13} color="#b45309" />
                          <Text style={styles.uncertainText}>
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
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <FormInput
                            value={item.grams}
                            onChangeText={(value) => updateReviewItem(item.key, { grams: value })}
                            keyboardType="number-pad"
                          />
                        </View>
                        <Pressable onPress={() => handleSaveReviewItem(item.key)} hitSlop={8}>
                          <Check size={20} color={colors.success} />
                        </Pressable>
                        <Pressable onPress={() => handleDiscardReviewItem(item.key)} hitSlop={8}>
                          <X size={20} color={colors.error} />
                        </Pressable>
                      </View>
                      <ChipSelect
                        options={MEAL_TYPES}
                        value={item.mealType}
                        onChange={(value) => updateReviewItem(item.key, { mealType: value })}
                        labels={MEAL_TYPE_LABELS[language]}
                      />
                      {item.error ? <Text style={styles.reviewError}>{item.error}</Text> : null}
                    </View>
                  ))}
                </>
              )}
            </View>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{t("Fotoğraf Geçmişi", "Photo History")}</Text>
          {photoHistoryError ? <ErrorBanner message={photoHistoryError} /> : null}
          {isLoading ? (
            <Skeleton height={110} />
          ) : photoHistory.length === 0 ? (
            <Text style={styles.emptyText}>
              {t(
                "Henüz analiz edilmiş bir fotoğraf yok. Yukarıdan bir yemek fotoğrafı çektikçe/yükledikçe burada birikecek.",
                "No analyzed photos yet. They'll appear here as you take/upload meal photos above."
              )}
            </Text>
          ) : (
            <View style={styles.photoGallery}>
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

        <Card>
          <Text style={styles.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
          {historyError ? <ErrorBanner message={historyError} /> : null}
          {isLoading ? (
            <Skeleton height={140} />
          ) : entries.length === 0 ? (
            <Text style={styles.emptyText}>
              {t(
                "Henüz bir öğün kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                "No meal logged yet. You can add your first entry using the form above."
              )}
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
                        {entry.food_name_snapshot} ({MEAL_TYPE_LABELS[language][entry.meal_type as MealType] ?? entry.meal_type})
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
          <Text style={styles.cardTitle}>{t("Kalori Trendi", "Calorie Trend")}</Text>
          {isLoading ? <Skeleton height={200} /> : <CalorieTrendChart entries={entries} />}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{t("Bugünkü Makro Dağılımı", "Today's Macro Breakdown")}</Text>
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
  hintText: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoPreview: { width: 88, height: 88, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  clearText: { fontSize: 13, color: colors.muted, textDecorationLine: "underline" },
  analyzingRow: { paddingVertical: 8 },
  reviewItemBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  reviewDetected: { fontSize: 11, color: colors.muted, lineHeight: 16 },
  uncertainRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  uncertainText: { flex: 1, fontSize: 11, color: "#b45309", lineHeight: 16 },
  reviewError: { fontSize: 11, color: colors.error },
  photoGallery: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
});
