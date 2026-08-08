import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { PreferredLanguage, WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, colors, workoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";

// web/src/components/charts/WorkoutVolumeChart.tsx'in mobil portu.
function formatDate(isoDate: string, language: PreferredLanguage): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit" });
}

const MAX_VISIBLE_LABELS = 8;

function thinnedLabel(index: number, total: number, label: string): string {
  const stride = Math.max(1, Math.ceil(total / MAX_VISIBLE_LABELS));
  return index % stride === 0 ? label : "";
}

// Sabit bar genişliği/aralığı - önceden konteyner genişliğini doldurmaya
// çalışan bir formül vardı, az sayıda oturumda (ör. 2-3) devasa bir spacing
// hesaplayıp barları sola yığıp sağda boş alan bırakıyordu (canlı testte
// bulundu). WorkoutTypeChart'taki (Progress sekmesi) sabit değer deseni
// buraya da uygulandı - veri sayısından bağımsız, her zaman öngörülebilir.
const BAR_WIDTH = 22;
const BAR_SPACING = 18;

export function WorkoutVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;
  const { language } = useLanguage();
  const t = useT();

  const points = sessions
    .map((session) => {
      const volume = session.sets.reduce(
        (sum, set) => sum + (set.weight_kg && set.reps ? set.weight_kg * set.reps : 0),
        0
      );
      return { date: session.session_date, volume, workoutType: session.workout_type as WorkoutType | null };
    })
    .filter((point) => point.volume > 0);

  if (points.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        {t(
          "Henüz ağırlıklı set verisi yok. Antrenman kaydettikçe hacim trendi burada görünecek.",
          "No weighted set data yet. The volume trend will show up here as you log workouts."
        )}
      </Text>
    );
  }

  const usedTypes = Array.from(new Set(points.map((p) => p.workoutType).filter(Boolean))) as WorkoutType[];

  const data = points.map((p, index) => ({
    value: p.volume,
    label: thinnedLabel(index, points.length, formatDate(p.date, language)),
    // Kullanıcı isteği (2026-08-06): hangi antrenman türünün ne hacimde
    // olduğu görülebilsin diye bar rengi türe göre - WorkoutTypeChart'taki
    // (Progress sekmesi) renk eşlemesiyle AYNI palet kullanılıyor.
    frontColor: p.workoutType ? workoutTypeColors[p.workoutType] : colors.muted,
  }));

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={200}
        barWidth={BAR_WIDTH}
        spacing={BAR_SPACING}
        barBorderRadius={4}
        noOfSections={4}
        yAxisTextStyle={{ color: colors.muted, fontSize: 11 }}
        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
        rulesColor={colors.border}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
      />
      {usedTypes.length > 0 ? (
        <View style={styles.legend}>
          {usedTypes.map((type) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: workoutTypeColors[type] }]} />
              <Text style={styles.legendText}>{WORKOUT_TYPE_LABELS[language][type]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: colors.muted,
  },
});
