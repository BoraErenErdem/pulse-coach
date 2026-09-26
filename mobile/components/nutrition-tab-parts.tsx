// Beslenme sekmesinin yardımcı bileşen/fonksiyonları (2026-09-26,
// app/(tabs)/nutrition.tsx'ten taşındı - mantık aynı).
import { type NutrientKey } from "@/components/nutrition-identity";
import { Skeleton, useThemeColors } from "@/components/ui";
import { getPhotoImageLocalUri, type DailyNutritionSummary, type FoodCatalogItem, type MealEntry, type MealPhoto, type MealType, type PhotoMealItem, type PreferredLanguage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
export interface PhotoReviewItem {
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

export function reviewItemFromDetected(
  item: PhotoMealItem,
  index: number,
  language: PreferredLanguage,
  mealType: MealType
): PhotoReviewItem {
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
    mealType,
    error: null,
    isUncertain: item.is_uncertain,
  };
}

export function formatPhotoDate(iso: string, language: PreferredLanguage): string {
  return formatDate(iso, language, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("tr-TR");
}

/** Satırdaki besin değeri dökümü (kullanıcı isteği, 2026-08-24): etiket
 * kelimesi besin renginde, sayı nötr - hepsini renklendirmek satırı konfetiye
 * çevirirdi. Şeker/lif/sodyum katalogda opsiyonel; null olan satırdan çıkar
 * ("0 g şeker" yazmak yanıltıcı olurdu, veri yok demek). */
export function EntryNutrientBreakdown({
  entry,
  t,
  nutrientColors,
}: {
  entry: MealEntry;
  t: (tr: string, en: string) => string;
  nutrientColors: Record<NutrientKey, string>;
}) {
  const parts: { key: NutrientKey; label: string; value: string }[] = [
    { key: "protein", label: t("Protein", "Protein"), value: `${entry.protein_g.toFixed(0)} g` },
    { key: "karbonhidrat", label: t("Karb.", "Carbs"), value: `${entry.carbs_g.toFixed(0)} g` },
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
          <Text style={{ color: nutrientColors[p.key], fontFamily: "Inter_600SemiBold" }}>{p.label}</Text> {p.value}
        </Text>
      ))}
    </>
  );
}

/** Galeri kartındaki tek küçük resim - RN <Image source={{uri}}> özel
 * Authorization header gönderemediği için önce yerel cache'e indirilir
 * (web'de blob URL, bkz. api.ts::getPhotoImageLocalUri). */
export function PhotoHistoryThumbnail({
  photo,
  token,
  onDelete,
  muted,
}: {
  photo: MealPhoto;
  token: string;
  onDelete: (photoId: number) => void;
  muted: string;
}) {
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
      <View style={[thumbStyles.imageBox, { backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(245,162,107,0.12)" }]}>
        {localUri ? (
          <Image source={{ uri: localUri }} style={thumbStyles.image} />
        ) : hasError ? (
          <Text style={[thumbStyles.errorText, { color: muted }]}>{t("Yüklenemedi", "Failed to load")}</Text>
        ) : (
          <Skeleton height={96} />
        )}
      </View>
      {/* Önceden ~20px'lik küçük bir daire (hitSlop 8 ile bile 44pt altı) -
          artık 44x44 dokunma kutusu, görsel rozet içinde küçük kalıyor. */}
      <Pressable
        onPress={() => onDelete(photo.id)}
        style={thumbStyles.deleteHit}
        accessibilityRole="button"
        accessibilityLabel={t("Fotoğrafı sil", "Delete photo")}
      >
        <View style={[thumbStyles.deleteBadge, { backgroundColor: c.error }]}>
          <X size={12} color="#fff" strokeWidth={2.6} />
        </View>
      </Pressable>
      <Text style={[thumbStyles.dateText, { color: muted }]} numberOfLines={1}>
        {formatPhotoDate(photo.created_at, language)}
      </Text>
    </View>
  );
}

export const thumbStyles = StyleSheet.create({
  wrapper: { width: 96 },
  imageBox: {
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  errorText: { fontSize: 11, textAlign: "center" },
  deleteHit: {
    position: "absolute",
    top: -14,
    right: -14,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dateText: { marginTop: 5, fontSize: 11 },
});

/** Bugünün kayıtlarından istemci tarafında 1-2 cümlelik özet (backend
 * `summary_text` "Bugün kartı"ndaki sayıları AYNEN tekrarlıyordu ve kayıt
 * sayısına "öğün" diyordu - gösterilmiyor). Burada YENİ bilgi: en çok kalori
 * getiren besin + enerjinin makrolara dağılımı. */
export function buildTodayInsight(
  todayEntries: MealEntry[],
  summary: DailyNutritionSummary,
  t: (tr: string, en: string) => string
): string | null {
  if (todayEntries.length === 0 || summary.total_calories_kcal <= 0) return null;
  const byFood = new Map<string, number>();
  for (const e of todayEntries) byFood.set(e.food_name_snapshot, (byFood.get(e.food_name_snapshot) ?? 0) + e.calories_kcal);
  const [topName, topKcal] = [...byFood.entries()].sort((a, b) => b[1] - a[1])[0];
  const topPct = Math.round((topKcal / summary.total_calories_kcal) * 100);
  const pE = summary.total_protein_g * 4;
  const cE = summary.total_carbs_g * 4;
  const fE = summary.total_fat_g * 9;
  const total = pE + cE + fE;
  const first =
    byFood.size > 1
      ? t(
          `En çok kalori ${topName} kaydından geldi (${fmt(topKcal)} kcal, %${topPct}).`,
          `Most calories came from ${topName} (${fmt(topKcal)} kcal, ${topPct}%).`
        )
      : t(`Bugünkü kalorinin tamamı ${topName} kaydından.`, `All of today's calories came from ${topName}.`);
  if (total <= 0) return first;
  const p = Math.round((pE / total) * 100);
  const c = Math.round((cE / total) * 100);
  const f = 100 - p - c;
  return `${first} ${t(
    // Yüzde eki ("%14'ü", "%67'si") sayının okunuşuna göre değişiyor - ek
    // gerektirmeyen kalıp seçildi (ilk sürüm "%67'i" yazıyordu).
    `Makro enerji dağılımı: %${p} protein, %${c} karbonhidrat, %${f} yağ.`,
    `Macro energy split: ${p}% protein, ${c}% carbs, ${f}% fat.`
  )}`;
}
