import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PartyPopper } from "lucide-react-native";
import type { ExerciseGoalProgress } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";
import { SwipeableRow } from "@/components/swipeable-row";

// web/src/components/ui.tsx::ExerciseGoalsList'in mobil portu - goals.tsx ve
// workouts.tsx'te neredeyse birebir aynı kopyayla vardı (2026-08-10 mimari
// borç raporu, bulgu #8). İki ekran arasındaki tek gerçek fark: goals
// ekranı silinebilir + %100'de ayrı bir kutlama metni gösterirken, workouts
// ekranı salt-okunur (sadece küçük bir ikon) - `onDelete` prop'unun
// varlığı/yokluğu bu iki görünümü tek bileşende ayırt eder.
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`;
// silinebilir satırlar artık diğer geçmiş listeleriyle AYNI SwipeableRow
// deseni (elle Trash2 dokunma yerine kaydırarak sil).
export function ExerciseGoalsList({
  goals,
  onDelete,
}: {
  goals: ExerciseGoalProgress[];
  onDelete?: (goalId: number) => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={{ gap: onDelete ? 12 : 14 }}>
      {goals.map((eg) => {
        const row = (
          <View key={onDelete ? undefined : eg.id}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <GoalMeter
                  label={eg.exercise_name}
                  value={eg.best_weight_kg ?? 0}
                  goal={eg.target_weight_kg}
                  unit="kg"
                  color={seriesColors.series2}
                />
              </View>
              {!onDelete && eg.progress_pct >= 100 ? <PartyPopper size={16} color={c.celebrate} /> : null}
            </View>
            {onDelete && eg.progress_pct >= 100 ? (
              <View style={s.celebrateRow}>
                <PartyPopper size={13} color={c.celebrate} />
                <Text style={s.celebrateText}>
                  {t(`Tebrikler, ${eg.exercise_name} hedefine ulaştın!`, `Congrats, you've reached your ${eg.exercise_name} goal!`)}
                </Text>
              </View>
            ) : null}
          </View>
        );
        return onDelete ? (
          <SwipeableRow key={eg.id} onDelete={() => onDelete(eg.id)}>
            {row}
          </SwipeableRow>
        ) : (
          row
        );
      })}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    celebrateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    celebrateText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.celebrate },
  });
}
