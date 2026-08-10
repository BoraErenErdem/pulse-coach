import { Pressable, StyleSheet, Text, View } from "react-native";
import { PartyPopper, Trash2 } from "lucide-react-native";
import type { ExerciseGoalProgress } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { colors, seriesColors } from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";

// web/src/components/ui.tsx::ExerciseGoalsList'in mobil portu - goals.tsx ve
// workouts.tsx'te neredeyse birebir aynı kopyayla vardı (2026-08-10 mimari
// borç raporu, bulgu #8). İki ekran arasındaki tek gerçek fark: goals
// ekranı silinebilir + %100'de ayrı bir kutlama metni gösterirken, workouts
// ekranı salt-okunur (sadece küçük bir ikon) - `onDelete` prop'unun
// varlığı/yokluğu bu iki görünümü tek bileşende ayırt eder.
export function ExerciseGoalsList({
  goals,
  onDelete,
}: {
  goals: ExerciseGoalProgress[];
  onDelete?: (goalId: number) => void;
}) {
  const t = useT();
  return (
    <View style={{ gap: onDelete ? 12 : 14 }}>
      {goals.map((eg) => (
        <View key={eg.id}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <GoalMeter
                label={eg.exercise_name}
                value={eg.best_weight_kg ?? 0}
                goal={eg.target_weight_kg}
                unit="kg"
                color={seriesColors.series2}
              />
            </View>
            {onDelete ? (
              <Pressable onPress={() => onDelete(eg.id)} hitSlop={8}>
                <Trash2 size={16} color={colors.muted} />
              </Pressable>
            ) : eg.progress_pct >= 100 ? (
              <PartyPopper size={16} color={colors.celebrate} />
            ) : null}
          </View>
          {onDelete && eg.progress_pct >= 100 ? (
            <View style={styles.celebrateRow}>
              <PartyPopper size={13} color={colors.celebrate} />
              <Text style={styles.celebrateText}>
                {t(`Tebrikler, ${eg.exercise_name} hedefine ulaştın!`, `Congrats, you've reached your ${eg.exercise_name} goal!`)}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  celebrateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  celebrateText: { fontSize: 12, fontWeight: "600", color: colors.celebrate },
});
