import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { ProgressLog, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, colors, workoutTypeColors } from "@/components/ui";

// web/src/components/charts/WorkoutTypeChart.tsx'in mobil portu.

export function WorkoutTypeChart({ logs }: { logs: ProgressLog[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;

  const counts: Partial<Record<WorkoutType, number>> = {};
  for (const log of logs) {
    if (log.workout_completed && log.workout_type) {
      const type = log.workout_type as WorkoutType;
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  const data = (Object.keys(WORKOUT_TYPE_LABELS) as WorkoutType[])
    .map((key) => ({
      value: counts[key] ?? 0,
      label: WORKOUT_TYPE_LABELS[key],
      frontColor: workoutTypeColors[key],
    }))
    .filter((item) => item.value > 0);

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        Henüz tamamlanmış antrenman kaydı yok.
      </Text>
    );
  }

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={200}
        barWidth={36}
        spacing={28}
        barBorderRadius={6}
        showValuesAsTopLabel
        topLabelTextStyle={{ color: colors.muted, fontSize: 12 }}
        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 11 }}
        yAxisTextStyle={{ color: colors.muted, fontSize: 11 }}
        noOfSections={4}
        rulesColor={colors.border}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
      />
    </View>
  );
}
