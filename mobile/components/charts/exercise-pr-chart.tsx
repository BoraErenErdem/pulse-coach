import { memo, useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { ExerciseHistoryEntry, PreferredLanguage } from "@/lib/api";
import { type ThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartWidthFor, thinnedLabel } from "./chart-utils";

// Kişisel rekor gelişim grafiği (2026-09-22, kullanıcı isteği - Antrenman
// sekmesi turu 4 sonundaki önerilerden) - exercise-history.tsx'te "Tüm
// Kayıtlar"ın zaten yüklü olduğu veriden (kronolojik hâle getirilmiş,
// bkz. çağıran taraftaki `chronologicalEntries` notu - `historyEntries`'in
// kendisi YENİDEN ESKİYE) SADECE `is_personal_record` işaretli satırlar
// süzülüp bar grafikte gösteriliyor. Antrenman'ın diğer grafikleriyle AYNI kütüphane/desen
// (gifted-charts BarChart, chartWidthFor/thinnedLabel) - bu sayfa Egzersiz-
// lerim akışının bir parçası, İlerleme'nin sürekli-trend SVG motoruna
// (TrendLineChart) BİLEREK geçilmedi (o bileşen domainX/domainY/tick
// hesabıyla Progress'e sıkı bağlı, burada gereksiz entegrasyon riski olurdu).
export const ExercisePrChart = memo(function ExercisePrChart({
  entries,
  language,
  color,
  themeColors,
  emptyMessage,
}: {
  // Kronolojik (eskiden yeniye) - exercise-history.tsx::chronologicalEntries
  // (historyEntries YENİDEN ESKİYE'dir, bu bileşene VERİLMEDEN önce TERS
  // çevrilir).
  entries: ExerciseHistoryEntry[];
  language: PreferredLanguage;
  color: string;
  themeColors: ThemeColors;
  emptyMessage: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const c = themeColors;
  const t = useT();

  const points = useMemo(
    () =>
      entries
        .filter((e) => e.is_personal_record && (e.weight_kg != null || e.reps != null))
        .map((e) => ({
          date: e.session_date,
          value: e.weight_kg ?? e.reps ?? 0,
          isWeight: e.weight_kg != null,
        })),
    [entries]
  );

  if (points.length < 2) {
    return <Text style={{ fontSize: 13, color: c.muted }}>{emptyMessage}</Text>;
  }

  // İlk sürüm kg birimini her çubuğun üstüne özel bir `topLabelComponent`
  // ile yazıyordu - gifted-charts bu bileşeni çubuğun DAR genişliğine
  // (22px) sıkıştırıp "90kg" gibi metinleri kırpıyordu (kullanıcı bulgusu).
  // Kütüphanenin kendi `showValuesAsTopLabel` mekanizması (WorkoutTypeChart'-
  // takiyle AYNI, orada kırpma YAŞANMIYOR - kütüphane bunu çubuk genişliğine
  // sıkıştırmıyor) SADECE sayıyı basıyor, birim ise grafiğin ÜSTÜNDE TEK bir
  // başlık olarak (her çubukta tekrar etmeden) gösteriliyor.
  const BAR_WIDTH = 24;
  const initialSpacing = 12;
  const spacing = Math.max(18, (chartWidth - initialSpacing) / points.length - BAR_WIDTH);
  const unit = points[points.length - 1].isWeight ? "kg" : t("tekrar", "reps");

  const data = points.map((p, index) => ({
    value: p.value,
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
    frontColor: color,
  }));

  return (
    <View>
      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 8 }}>
        {t(`Birim: ${unit}`, `Unit: ${unit}`)}
      </Text>
      <BarChart
        data={data}
        width={chartWidth}
        height={160}
        barWidth={BAR_WIDTH}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={0}
        barBorderRadius={4}
        showValuesAsTopLabel
        topLabelTextStyle={{ color: c.muted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: c.muted, fontSize: 10 }}
        yAxisTextStyle={{ color: c.muted, fontSize: 10 }}
        noOfSections={3}
        rulesColor={c.border}
        yAxisColor={c.border}
        xAxisColor={c.border}
      />
    </View>
  );
});
