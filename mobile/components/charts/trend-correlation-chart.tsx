import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { WeeklyTrendPoint } from "@/lib/api";
import { colors, seriesColors } from "@/components/ui";

// web/src/components/charts/TrendCorrelationChart.tsx'in mobil portu -
// dataviz kuralı korunuyor: mood ve antrenman günü İKİ AYRI tek-eksenli
// grafik (ölçekleri farklı, tek çift-eksenli grafikte birleştirmek yanıltıcı
// olurdu), ortak hafta ekseni sayesinde yan yana karşılaştırılabiliyor.
const MOOD_SCALE_LABELS: Record<number, string> = {
  1: "Zor",
  2: "Düşük",
  3: "Nötr",
  4: "İyi",
  5: "Harika",
};

function formatWeek(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;

  const hasAnyData = points.some((p) => p.avg_mood_score !== null || p.workout_days > 0);
  if (!hasAnyData) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.
      </Text>
    );
  }

  const moodData = points.map((p) => ({
    value: p.avg_mood_score ?? undefined,
    label: formatWeek(p.week_start),
  }));
  const workoutData = points.map((p) => ({ value: p.workout_days, label: formatWeek(p.week_start) }));

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={styles.subLabel}>Haftalık Ortalama Ruh Hali</Text>
        <LineChart
          data={moodData}
          width={chartWidth}
          height={140}
          curved
          areaChart
          color={seriesColors.series1}
          thickness={2}
          startFillColor={seriesColors.series1}
          endFillColor={seriesColors.series1}
          startOpacity={0.18}
          endOpacity={0}
          yAxisOffset={1}
          maxValue={4}
          noOfSections={4}
          yAxisLabelTexts={[
            MOOD_SCALE_LABELS[1],
            MOOD_SCALE_LABELS[2],
            MOOD_SCALE_LABELS[3],
            MOOD_SCALE_LABELS[4],
            MOOD_SCALE_LABELS[5],
          ]}
          yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
          rulesColor={colors.border}
          yAxisColor={colors.border}
          xAxisColor={colors.border}
          initialSpacing={12}
          spacing={Math.max(24, chartWidth / Math.max(points.length, 1))}
          dataPointsColor={seriesColors.series1}
          dataPointsRadius={3}
        />
      </View>

      <View>
        <Text style={styles.subLabel}>Haftalık Antrenman Günü</Text>
        <LineChart
          data={workoutData}
          width={chartWidth}
          height={140}
          curved
          areaChart
          color={seriesColors.series2}
          thickness={2}
          startFillColor={seriesColors.series2}
          endFillColor={seriesColors.series2}
          startOpacity={0.18}
          endOpacity={0}
          maxValue={7}
          noOfSections={7}
          yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
          rulesColor={colors.border}
          yAxisColor={colors.border}
          xAxisColor={colors.border}
          initialSpacing={12}
          spacing={Math.max(24, chartWidth / Math.max(points.length, 1))}
          dataPointsColor={seriesColors.series2}
          dataPointsRadius={3}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
});
