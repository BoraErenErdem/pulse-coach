import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { WeeklyTrendPoint } from "@/lib/api";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, moodScaleLabels, thinnedLabel } from "./chart-utils";

// web/src/components/charts/TrendCorrelationChart.tsx'in mobil portu -
// dataviz kuralı korunuyor: mood ve antrenman günü İKİ AYRI tek-eksenli
// grafik (ölçekleri farklı, tek çift-eksenli grafikte birleştirmek yanıltıcı
// olurdu), ortak hafta ekseni sayesinde yan yana karşılaştırılabiliyor.
// 12 haftalık varsayılan aralıkta HER etiketi göstermek telefon genişliğinde
// sıkışıp okunmaz oluyordu (canlı testte bulundu) - en fazla ~6 etiket
// görünecek şekilde aradaki etiketler boş bırakılıyor (thinnedLabel'ın
// 3. argümanı), veri noktalarının kendisi hâlâ hepsi için çiziliyor.
const MAX_VISIBLE_LABELS = 6;

export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const hasAnyData = points.some((p) => p.avg_mood_score !== null || p.workout_days > 0);
  if (!hasAnyData) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t(
          "Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.",
          "Not enough data yet. The weekly trend will show up here as you log mood and workouts."
        )}
      </Text>
    );
  }

  const moodData = points.map((p, index) => ({
    value: p.avg_mood_score ?? undefined,
    label: thinnedLabel(
      index,
      points.length,
      formatDate(p.week_start, language, { day: "2-digit", month: "2-digit" }),
      MAX_VISIBLE_LABELS
    ),
  }));
  const workoutData = points.map((p, index) => ({
    value: p.workout_days,
    label: thinnedLabel(
      index,
      points.length,
      formatDate(p.week_start, language, { day: "2-digit", month: "2-digit" }),
      MAX_VISIBLE_LABELS
    ),
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
          // react-native-gifted-charts, mood kaydı olmayan haftalar için
          // (avg_mood_score=undefined) VARSAYILAN OLARAK en yakın iki gerçek
          // noktanın eğimini GERİYE DOĞRU EKSTRAPOLE EDİYOR
          // (interpolateMissingValues varsayılanı true) - az veri + dik eğimle
          // eksen 1-5 skalasının çok dışına taşıp Y ekseninin bozulmasına yol
          // açıyordu (2026-08-10 canlı testte gerçek cihazda bulundu, bkz.
          // proje belleği). interpolateMissingValues={false}: eksik hafta
          // sessizce 0 (nokta gizli) sayılır, ekstrapolasyon yapılmaz.
          // noOfSectionsBelowXAxis={0}/mostNegativeValue={0}: bu 0 değerinin
          // (offset sonrası -1) ekseni otomatik aşağı genişletip fazladan
          // sayısal satır eklemesini de baştan engeller.
          interpolateMissingValues={false}
          showDataPointsForMissingValues={false}
          noOfSectionsBelowXAxis={0}
          mostNegativeValue={0}
          yAxisLabelTexts={[labels[1], labels[2], labels[3], labels[4], labels[5]]}
          {...chartAxisProps(10, c)}
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
          {...chartAxisProps(10, c)}
          initialSpacing={12}
          spacing={Math.max(24, chartWidth / Math.max(points.length, 1))}
          dataPointsColor={seriesColors.series2}
          dataPointsRadius={3}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    subLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
      marginBottom: 6,
    },
  });
}
