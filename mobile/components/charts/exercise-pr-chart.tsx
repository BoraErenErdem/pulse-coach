import { memo, useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { ExerciseHistoryEntry, PreferredLanguage } from "@/lib/api";
import { type ThemeColors } from "@/components/ui";
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

  const BAR_WIDTH = 22;
  const initialSpacing = 12;
  const spacing = Math.max(18, (chartWidth - initialSpacing) / points.length - BAR_WIDTH);
  const unit = points[points.length - 1].isWeight ? "kg" : "";

  const data = points.map((p, index) => ({
    value: p.value,
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
    frontColor: color,
    topLabelComponent: () => (
      <Text style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>
        {p.value}
        {unit}
      </Text>
    ),
  }));

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={160}
        barWidth={BAR_WIDTH}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={0}
        barBorderRadius={4}
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
