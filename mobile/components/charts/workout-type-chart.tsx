import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, useThemeColors, workoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";

// web/src/components/charts/WorkoutTypeChart.tsx'in mobil portu - 2026-08-06:
// İlerleme sekmesinden Antrenman sekmesine taşındı (Faz B, İlerleme↔Antrenman
// tekrarını giderme kararı), veri kaynağı ProgressLog.workout_type yerine
// WorkoutSession.workout_type oldu - gerçek antrenman kayıtlarını yansıtır.
export function WorkoutTypeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();

  const counts: Partial<Record<WorkoutType, number>> = {};
  for (const session of sessions) {
    if (session.workout_type) {
      const type = session.workout_type as WorkoutType;
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  const data = (Object.keys(WORKOUT_TYPE_LABELS[language]) as WorkoutType[])
    .map((key) => ({
      value: counts[key] ?? 0,
      label: WORKOUT_TYPE_LABELS[language][key],
      frontColor: workoutTypeColors[key],
    }))
    .filter((item) => item.value > 0);

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t("Henüz tamamlanmış antrenman kaydı yok.", "No completed workout logged yet.")}
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
        topLabelTextStyle={{ color: c.muted, fontSize: 12 }}
        xAxisLabelTextStyle={{ color: c.muted, fontSize: 11 }}
        yAxisTextStyle={{ color: c.muted, fontSize: 11 }}
        noOfSections={4}
        rulesColor={c.border}
        yAxisColor={c.border}
        xAxisColor={c.border}
      />
    </View>
  );
}
