import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { PreferredLanguage, WeeklyTrendPoint } from "@/lib/api";
import { colors, seriesColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";

// web/src/components/charts/TrendCorrelationChart.tsx'in mobil portu -
// dataviz kuralı korunuyor: mood ve antrenman günü İKİ AYRI tek-eksenli
// grafik (ölçekleri farklı, tek çift-eksenli grafikte birleştirmek yanıltıcı
// olurdu), ortak hafta ekseni sayesinde yan yana karşılaştırılabiliyor.
function moodScaleLabels(t: (tr: string, en: string) => string): Record<number, string> {
  return {
    1: t("Zor", "Tough"),
    2: t("Düşük", "Low"),
    3: t("Nötr", "Neutral"),
    4: t("İyi", "Good"),
    5: t("Harika", "Great"),
  };
}

function formatWeek(isoDate: string, language: PreferredLanguage): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit" });
}

// 12 haftalık varsayılan aralıkta HER etiketi göstermek telefon genişliğinde
// sıkışıp okunmaz oluyordu (canlı testte bulundu) - en fazla ~6 etiket
// görünecek şekilde aradaki etiketler boş bırakılıyor, veri noktalarının
// kendisi hâlâ hepsi için çiziliyor (sadece etiket metni seyrekleştiriliyor).
const MAX_VISIBLE_LABELS = 6;

function thinnedLabel(index: number, total: number, label: string): string {
  const stride = Math.max(1, Math.ceil(total / MAX_VISIBLE_LABELS));
  return index % stride === 0 ? label : "";
}

export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);

  const hasAnyData = points.some((p) => p.avg_mood_score !== null || p.workout_days > 0);
  if (!hasAnyData) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        {t(
          "Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.",
          "Not enough data yet. The weekly trend will show up here as you log mood and workouts."
        )}
      </Text>
    );
  }

  const moodData = points.map((p, index) => ({
    value: p.avg_mood_score ?? undefined,
    label: thinnedLabel(index, points.length, formatWeek(p.week_start, language)),
  }));
  const workoutData = points.map((p, index) => ({
    value: p.workout_days,
    label: thinnedLabel(index, points.length, formatWeek(p.week_start, language)),
  }));

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={styles.subLabel}>{t("Haftalık Ortalama Ruh Hali", "Weekly Average Mood")}</Text>
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
          yAxisLabelTexts={[labels[1], labels[2], labels[3], labels[4], labels[5]]}
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
        <Text style={styles.subLabel}>{t("Haftalık Antrenman Günü", "Weekly Workout Days")}</Text>
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
