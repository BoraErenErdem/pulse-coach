import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { WorkoutSession } from "@/lib/api";
import { colors, seriesColors } from "@/components/ui";

// web/src/components/charts/WorkoutVolumeChart.tsx'in mobil portu.
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

const MAX_VISIBLE_LABELS = 8;

function thinnedLabel(index: number, total: number, label: string): string {
  const stride = Math.max(1, Math.ceil(total / MAX_VISIBLE_LABELS));
  return index % stride === 0 ? label : "";
}

export function WorkoutVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;

  const points = sessions
    .map((session) => {
      const volume = session.sets.reduce(
        (sum, set) => sum + (set.weight_kg ? set.weight_kg * set.reps : 0),
        0
      );
      return { date: session.session_date, volume };
    })
    .filter((point) => point.volume > 0);

  if (points.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        Henüz ağırlıklı set verisi yok. Antrenman kaydettikçe hacim trendi burada görünecek.
      </Text>
    );
  }

  const data = points.map((p, index) => ({
    value: p.volume,
    label: thinnedLabel(index, points.length, formatDate(p.date)),
    frontColor: seriesColors.series2,
  }));

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={200}
        barWidth={18}
        spacing={Math.max(10, chartWidth / data.length - 18)}
        barBorderRadius={4}
        noOfSections={4}
        yAxisTextStyle={{ color: colors.muted, fontSize: 11 }}
        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
        rulesColor={colors.border}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
      />
    </View>
  );
}
