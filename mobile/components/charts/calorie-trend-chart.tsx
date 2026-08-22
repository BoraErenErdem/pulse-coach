import { Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { MealEntry } from "@/lib/api";
import { useSeriesColors, useThemeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, thinnedLabel } from "./chart-utils";

// web/src/components/charts/CalorieTrendChart.tsx'in mobil portu.

export function CalorieTrendChart({ entries }: { entries: MealEntry[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();

  const totalsByDate = new Map<string, number>();
  for (const entry of entries) {
    totalsByDate.set(entry.log_date, (totalsByDate.get(entry.log_date) ?? 0) + entry.calories_kcal);
  }
  const points = Array.from(totalsByDate.entries())
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t(
          "Henüz öğün kaydı yok. Öğün kaydettikçe günlük kalori trendi burada görünecek.",
          "No meal logged yet. The daily calorie trend will show up here as you log meals."
        )}
      </Text>
    );
  }

  const data = points.map((p, index) => ({
    value: p.calories,
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
  }));

  return (
    <View>
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        curved
        areaChart
        color={seriesColors.series1}
        thickness={2}
        startFillColor={seriesColors.series1}
        endFillColor={seriesColors.series1}
        startOpacity={0.18}
        endOpacity={0}
        noOfSections={4}
        {...chartAxisProps(11, c)}
        initialSpacing={12}
        spacing={Math.max(24, chartWidth / data.length)}
        dataPointsColor={seriesColors.series1}
        dataPointsRadius={3}
      />
    </View>
  );
}
