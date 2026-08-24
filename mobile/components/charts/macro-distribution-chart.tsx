import { useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { BarChart } from "react-native-gifted-charts";
import type { MealEntry } from "@/lib/api";
import { type ThemeColors, useNutrientColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { chartWidthFor } from "./chart-utils";

// web/src/components/charts/MacroDistributionChart.tsx'in mobil portu.
// ÖNCEDEN sodyum (mg) makrolardan (g) farklı ölçekte olduğu için AYRI bir
// alt grafikte gösteriliyordu (dataviz kuralı: farklı birimleri aynı ekseni
// paylaştırma). Kullanıcı isteği (2026-08-22): "tek grafikte hepsini
// görebilsin" - iki ayrı grafik yerine TEK bir çubuk grafik istendi, lif de
// eklendi. Ölçek sorunu hâlâ GERÇEK (sodyum ham haliyle ~2000+, makrolar
// ~20-300 arası - aynı eksende sodyum diğer TÜM çubukları görünmez
// kılardı) - bu yüzden sodyumun ÇUBUK YÜKSEKLİĞİ diğerleriyle kıyaslanabilir
// bir ölçeğe küçültüldü (÷10, "psödo-birim" - sadece görsel yükseklik için),
// ama üstündeki etiket YİNE DE gerçek mg değerini gösteriyor
// (`topLabelComponent` - her çubuk kendi gerçek değerini yazıyor, sadece
// sodyumun ÇUBUĞU küçültülmüş görünüyor). Kullanıcı hâlâ doğru sayıyı
// okuyor, hiçbir çubuk diğerini görünmez kılmıyor.
const SODIUM_BAR_SCALE = 1 / 10;

// Dokunma-detayı (kullanıcı isteği, 2026-08-24): workout-volume-chart.tsx'
// teki AYNI desen (onPress + kendi React "Seçili Gün" panelimiz, gifted-
// charts'ın pointerConfig'i kaydırmayla çakışıyor - bkz. o dosyadaki not).
// Buradaki fark: seçilen "gün" değil "besin değeri" (Protein/Karbonhidrat/
// ...) - bir çubuğa dokunulunca altta o besin değerine BUGÜN hangi
// yiyecekten ne kadar geldiği listeleniyor.
//
// Seçili çubuk kenarlığı (kullanıcı isteği, 2026-08-24 2. tur: "Ağırlık
// Hacmi Trendi'ndeki AYNI dış çizgi"): workout-volume-chart'taki
// `barBorderColor: c.secondary` (=seriesColors.series1) BURADA DOĞRUDAN
// kullanılamıyor - o grafikte workoutTypeColors series1'i hiç kullanmadığı
// için boştaydı, ama buradaki 6 çubuk nutrientColors'ın 6 serisinin
// (series1..6) TAMAMINI kaplıyor, boşta kalan bir seri yok. Çözüm: kenarlık
// serisi PALETTEN değil `c.text`'ten - seri paleti hiçbir zaman c.text'i
// KULLANMIYOR (workoutTypeColors/nutrientColors ikisi de sadece
// seriesColors.seriesN'den besleniyor, c.text ayrı bir token), yani
// hangi çubuk seçilirse seçilsin kenarlık kendi dolgusunun ÜSTÜNDE her
// zaman görünür kalıyor - workout-volume-chart'ın "boş seri bul" taktiğinin
// bu grafikte çalışmayan bir genellemesi yerine daha sağlam bir çözüm.
type NutrientKey = "protein" | "karbonhidrat" | "yağ" | "şeker" | "lif" | "sodyum";
const NUTRIENT_KEYS: NutrientKey[] = ["protein", "karbonhidrat", "yağ", "şeker", "lif", "sodyum"];
const NUTRIENT_UNIT: Record<NutrientKey, string> = {
  protein: "g",
  karbonhidrat: "g",
  yağ: "g",
  şeker: "g",
  lif: "g",
  sodyum: "mg",
};
function nutrientEntryValue(entry: MealEntry, key: NutrientKey): number {
  switch (key) {
    case "protein":
      return entry.protein_g;
    case "karbonhidrat":
      return entry.carbs_g;
    case "yağ":
      return entry.fat_g;
    case "şeker":
      return entry.sugar_g ?? 0;
    case "lif":
      return entry.fiber_g ?? 0;
    case "sodyum":
      return entry.sodium_mg ?? 0;
  }
}

export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
  sugarG,
  fiberG,
  sodiumMg,
  todayEntries,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
  /** Bugüne ait öğün kayıtları (parent'ta log_date'e göre önceden
   * filtrelenmiş) - dokunma-detayı panelinin "hangi yiyecekten ne kadar"
   * dökümünü buradan hesaplıyoruz. */
  todayEntries: MealEntry[];
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const t = useT();
  const c = useThemeColors();
  // 2026-08-22 ("genel renk düzeni" incelemesi): bu grafik ile nutrition.tsx
  // 'un istatistik kutuları/Günlük Hedef ölçerleri AYNI besin değerlerini
  // gösteriyor - önceden burada `seriesColors.seriesN` doğrudan seçiliyordu,
  // diğer ikisinden HABERSİZ (ör. Lif burada teal, kutuda pembeydi). Artık
  // paylaşımlı `useNutrientColors()`'tan (bkz. ui.tsx) besleniyor - üç yer
  // de AYNI besin için AYNI rengi kullanıyor.
  const nutrientColors = useNutrientColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [selectedKey, setSelectedKey] = useState<NutrientKey | null>(null);

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>{t("Bugün için henüz öğün kaydı yok.", "No meal logged today yet.")}</Text>
    );
  }

  const NUTRIENT_LABEL: Record<NutrientKey, string> = {
    protein: t("Protein", "Protein"),
    karbonhidrat: t("Karbonhidrat", "Carbs"),
    yağ: t("Yağ", "Fat"),
    şeker: t("Şeker", "Sugar"),
    lif: t("Lif", "Fiber"),
    sodyum: t("Sodyum", "Sodium"),
  };
  const NUTRIENT_TOTAL: Record<NutrientKey, number> = {
    protein: proteinG,
    karbonhidrat: carbsG,
    yağ: fatG,
    şeker: sugarG,
    lif: fiberG,
    sodyum: sodiumMg,
  };

  // Her çubuğun kendi doğru değerini gösteren etiket - `showValuesAsTopLabel`
  // KAPALI (sodyumun ölçeklenmiş/sahte değerini göstermesin diye), bu yüzden
  // 6 çubuğun HEPSİ kendi `topLabelComponent`'ini taşıyor (yoksa etiketsiz
  // kalırlardı).
  function topLabel(text: string) {
    function TopLabel() {
      return <Text style={s.topLabel}>{text}</Text>;
    }
    return TopLabel;
  }

  // Alt eksen etiketi dar çubuklara sığsın diye Karbonhidrat KISALTILMIŞ
  // ("Karb.") - diğer 5'i zaten tek kelime, kısaltmaya gerek yok, panel
  // başlığındaki (NUTRIENT_LABEL) tam adla aynı kalıyor.
  const axisLabels: Record<NutrientKey, string> = { ...NUTRIENT_LABEL, karbonhidrat: t("Karb.", "Carb.") };

  const data = NUTRIENT_KEYS.map((key) => {
    const isSelected = key === selectedKey;
    const displayValue = NUTRIENT_TOTAL[key];
    const barValue = key === "sodyum" ? displayValue * SODIUM_BAR_SCALE : displayValue;
    return {
      value: barValue,
      label: axisLabels[key],
      frontColor: nutrientColors[key],
      topLabelComponent: topLabel(`${displayValue.toFixed(0)}${NUTRIENT_UNIT[key]}`),
      // workout-volume-chart.tsx'teki AYNI seçili-çubuk kenarlığı - bkz.
      // dosya başındaki not (burada c.text, orada c.secondary).
      barBorderWidth: isSelected ? 3 : 0,
      barBorderColor: c.text,
      onPress: () => setSelectedKey(key),
    };
  });

  // 6 sabit çubuk (bkz. yukarısı) - sabit barWidth/spacing dar ekranlarda
  // chartWidth'i aşabiliyordu (2026-08-22 taşma düzeltmesi, bkz.
  // chart-utils.ts::chartWidthFor notu + workout-type-chart.tsx'teki AYNI
  // desen). Veri sayısı sabit (6) olsa da hesap chartWidth'e göre yapılıyor
  // ki farklı ekran genişliklerinde HER ZAMAN sığsın. `endSpacing={0}`:
  // aynı ikinci-tur bulgusu (bkz. workout-type-chart.tsx'teki notun aynısı) -
  // BarChart, açıkça vermezsen `endSpacing`'i `spacing` ile AYNI değere
  // düşürüyor, son çubuktan sonra hesaba katılmamış bir boşluk daha
  // ekliyordu.
  const initialSpacing = 10;
  const perItem = (chartWidth - initialSpacing) / data.length;
  const barWidth = Math.max(18, Math.min(28, perItem * 0.6));
  const spacing = Math.max(10, perItem - barWidth);

  // Seçili besin değerine BUGÜN hangi yiyecekten ne kadar geldiği - aynı
  // yiyecek birden çok öğünde/kayıtta geçtiyse toplanıyor (workout-volume-
  // chart.tsx::byExercise ile AYNI desen), 0 katkı veren yiyecek listeden
  // düşüyor (ör. Şeker seçiliyken şekersiz bir yiyecek satırı boş yer
  // kaplamasın diye).
  const breakdown = selectedKey
    ? (() => {
        const byFood = new Map<string, number>();
        for (const entry of todayEntries) {
          const value = nutrientEntryValue(entry, selectedKey);
          if (value <= 0) continue;
          byFood.set(entry.food_name_snapshot, (byFood.get(entry.food_name_snapshot) ?? 0) + value);
        }
        return Array.from(byFood.entries()).sort((a, b) => b[1] - a[1]);
      })()
    : [];

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={180}
        barWidth={barWidth}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={0}
        barBorderRadius={4}
        showValuesAsTopLabel={false}
        xAxisLabelTextStyle={{ color: c.muted, fontSize: 11 }}
        yAxisTextStyle={{ color: c.muted, fontSize: 11 }}
        noOfSections={4}
        rulesColor={c.border}
        yAxisColor={c.border}
        xAxisColor={c.border}
      />
      {selectedKey ? (
        <Animated.View key={selectedKey} entering={FadeIn.duration(200)} style={s.detailPanel}>
          <Text style={s.detailDate}>
            {NUTRIENT_LABEL[selectedKey]} · {t("Bugün", "Today")}
          </Text>
          {breakdown.length === 0 ? (
            <Text style={s.detailEmpty}>{t("Bugün bu değere katkısı olan bir kayıt yok.", "No entry contributed to this today.")}</Text>
          ) : (
            breakdown.map(([name, amount]) => (
              <View key={name} style={s.detailRow}>
                <Text style={s.detailFood} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={s.detailAmount}>
                  {amount.toFixed(0)}
                  {NUTRIENT_UNIT[selectedKey]}
                </Text>
              </View>
            ))
          )}
          <View style={s.detailTotalRow}>
            <Text style={s.detailTotalLabel}>{t("Toplam", "Total")}</Text>
            <Text style={s.detailTotalAmount}>
              {NUTRIENT_TOTAL[selectedKey].toFixed(0)}
              {NUTRIENT_UNIT[selectedKey]}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    topLabel: {
      color: c.muted,
      fontSize: 11,
    },
    // "Seçili Besin Değeri" paneli - workout-volume-chart.tsx'teki
    // detailPanel ile AYNI görsel dil (kart genişliğinde, kesinti/sayı
    // sınırı yok, ad/miktar AYRI sütunlar sayesinde ad ne kadar uzun olursa
    // olsun miktar HİÇBİR ZAMAN kırpılmıyor).
    detailPanel: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 4,
    },
    detailDate: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: c.text,
      marginBottom: 2,
    },
    detailEmpty: {
      fontSize: 12,
      color: c.muted,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    detailFood: {
      flex: 1,
      fontSize: 12,
      color: c.muted,
    },
    detailAmount: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    detailTotalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    detailTotalLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    detailTotalAmount: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
  });
}
