import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, type ThemeColors, useThemeColors, workoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, thinnedLabel } from "./chart-utils";

// web/src/components/charts/WorkoutVolumeChart.tsx'in mobil portu.

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
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);

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
      <Text style={{ fontSize: 13, color: c.muted }}>
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
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
    // Kullanıcı isteği (2026-08-06): hangi antrenman türünün ne hacimde
    // olduğu görülebilsin diye bar rengi türe göre - WorkoutTypeChart'taki
    // (Progress sekmesi) renk eşlemesiyle AYNI palet kullanılıyor.
    frontColor: p.workoutType ? workoutTypeColors[p.workoutType] : c.muted,
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
        {...chartAxisProps(11, c)}
      />
      {usedTypes.length > 0 ? (
        <View style={s.legend}>
          {usedTypes.map((type) => (
            <View key={type} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: workoutTypeColors[type] }]} />
              <Text style={s.legendText}>{WORKOUT_TYPE_LABELS[language][type]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
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
      color: c.muted,
    },
  });
}
