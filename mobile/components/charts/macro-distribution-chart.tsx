import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { chartWidthFor } from "./chart-utils";

// web/src/components/charts/MacroDistributionChart.tsx'in mobil portu.
// ÖNCEDEN sodyum (mg) makrolardan (g) farklı ölçekte olduğu için AYRI bir
// alt grafikte gösteriliyordu (dataviz kuralı: farklı birimleri aynı ekseni
// paylaştırma). Kullanıcı isteği (2026-08-22): "tek grafikte hepsini
// görebilsin" - iki ayrı grafik yerine TEK bir çubuk grafik istendi, lif de
// eklensin. Ölçek sorunu hâlâ GERÇEK (sodyum ham haliyle ~2000+, makrolar
// ~20-300 arası - aynı eksende sodyum diğer TÜM çubukları görünmez
// kılardı) - bu yüzden sodyumun ÇUBUK YÜKSEKLİĞİ diğerleriyle kıyaslanabilir
// bir ölçeğe küçültüldü (÷10, "psödo-birim" - sadece görsel yükseklik için),
// ama üstündeki etiket YİNE DE gerçek mg değerini gösteriyor
// (`topLabelComponent` - her çubuk kendi gerçek değerini yazıyor, sadece
// sodyumun ÇUBUĞU küçültülmüş görünüyor). Kullanıcı hâlâ doğru sayıyı
// okuyor, hiçbir çubuk diğerini görünmez kılmıyor.
const SODIUM_BAR_SCALE = 1 / 10;

export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
  sugarG,
  fiberG,
  sodiumMg,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const s = useMemo(() => makeStyles(c), [c]);

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>{t("Bugün için henüz öğün kaydı yok.", "No meal logged today yet.")}</Text>
    );
  }

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

  const data = [
    { value: proteinG, label: t("Protein", "Protein"), frontColor: seriesColors.series2, topLabelComponent: topLabel(`${proteinG.toFixed(0)}g`) },
    { value: carbsG, label: t("Karb.", "Carb."), frontColor: seriesColors.series3, topLabelComponent: topLabel(`${carbsG.toFixed(0)}g`) },
    { value: fatG, label: t("Yağ", "Fat"), frontColor: seriesColors.series4, topLabelComponent: topLabel(`${fatG.toFixed(0)}g`) },
    { value: sugarG, label: t("Şeker", "Sugar"), frontColor: seriesColors.series5, topLabelComponent: topLabel(`${sugarG.toFixed(0)}g`) },
    { value: fiberG, label: t("Lif", "Fiber"), frontColor: seriesColors.series1, topLabelComponent: topLabel(`${fiberG.toFixed(0)}g`) },
    {
      value: sodiumMg * SODIUM_BAR_SCALE,
      label: t("Sodyum", "Sodium"),
      frontColor: seriesColors.series6,
      topLabelComponent: topLabel(`${sodiumMg.toFixed(0)}mg`),
    },
  ];

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

  return (
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
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    topLabel: {
      color: c.muted,
      fontSize: 11,
    },
  });
}
