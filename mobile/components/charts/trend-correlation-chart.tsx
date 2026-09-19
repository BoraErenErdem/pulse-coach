import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { WeeklyTrendPoint } from "@/lib/api";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartWidthFor, moodScaleLabels, thinnedLabel, warmPanelAxisProps } from "./chart-utils";
import { useTheme } from "@/lib/theme-context";

// web/src/components/charts/TrendCorrelationChart.tsx'in mobil portu -
// dataviz kuralı korunuyor: mood ve antrenman günü İKİ AYRI tek-eksenli
// grafik (ölçekleri farklı, tek çift-eksenli grafikte birleştirmek yanıltıcı
// olurdu), ortak hafta ekseni sayesinde yan yana karşılaştırılabiliyor.
// 12 haftalık varsayılan aralıkta HER etiketi göstermek telefon genişliğinde
// sıkışıp okunmaz oluyordu (canlı testte bulundu) - en fazla ~6 etiket
// görünecek şekilde aradaki etiketler boş bırakılıyor (thinnedLabel'ın
// 3. argümanı), veri noktalarının kendisi hâlâ hepsi için çiziliyor.
// 2026-08-22: nokta/çizgi boyutu uygulamadaki TÜM sade (dokunma
// içermeyen) trend grafikleriyle (bkz. metric-trend-chart.tsx'teki not)
// ORTAK değerlere getirildi - görsel bütünlük.
// 2026-09-19: İlerleme sekmesindeki diğer grafik panelleriyle (Kilo/Bel/Yağ,
// bkz. metric-trend-chart.tsx) AYNI dile getirildi - her alt grafiğin başında
// renk noktalı başlık + en güncel değer + 12 haftalık ortalama rozeti vardı
// yok, sadece küçük gri bir etiket vardı ve "önemsiz" duruyordu.
const MAX_VISIBLE_LABELS = 6;
const CHART_HEIGHT = 160;

function SubChartHeader({
  color,
  title,
  value,
  unit,
  caption,
  chip,
  isDark,
  textColor,
  mutedColor,
}: {
  color: string;
  title: string;
  value: string;
  unit: string;
  caption: string;
  chip: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={headerStyles.wrap}>
      <View style={headerStyles.titleRow}>
        <View style={[headerStyles.dot, { backgroundColor: color }]} />
        <Text style={[headerStyles.title, { color: textColor }]}>{title}</Text>
      </View>
      <View style={headerStyles.heroRow}>
        <View style={headerStyles.valueRow}>
          <Text style={[headerStyles.value, { color: textColor }]}>{value}</Text>
          <Text style={[headerStyles.unit, { color: mutedColor }]}>{unit}</Text>
        </View>
        <View style={[headerStyles.chip, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(245,162,107,0.16)" }]}>
          <Text style={[headerStyles.chipText, { color: textColor }]}>{chip}</Text>
        </View>
      </View>
      <Text style={[headerStyles.caption, { color: mutedColor }]}>{caption}</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 14, fontFamily: "Inter_500Medium" },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 },
  value: { fontSize: 30, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  unit: { fontSize: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  caption: { fontSize: 12, marginTop: -4 },
});

export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const styles = useMemo(() => makeStyles(c, isDark), [c, isDark]);

  // "29/07" spacing'e (~24px) sığmayıp "29/…" diye kesiliyordu - artık iki
  // satır: gün üstte, ay kısaltması altta ("29" / "Tem").
  const weekLabel = (weekStart: string) =>
    formatDate(weekStart, language, { day: "numeric", month: "short" }).replace(" ", "\n");

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
      weekLabel(p.week_start),
      MAX_VISIBLE_LABELS
    ),
  }));
  const workoutData = points.map((p, index) => ({
    value: p.workout_days,
    label: thinnedLabel(
      index,
      points.length,
      weekLabel(p.week_start),
      MAX_VISIBLE_LABELS
    ),
  }));

  const textColor = isDark ? "#FFFFFF" : c.text;
  const mutedColor = isDark ? "rgba(255,255,255,0.8)" : c.muted;

  // Ruh hali: en son KAYITLI hafta (bazı haftalar boş olabilir) + tüm dönemin
  // ortalaması. Antrenman: bu hafta (son nokta) + 12 haftalık ortalama.
  const moodValues = points.map((p) => p.avg_mood_score).filter((v): v is number => v !== null);
  const latestMood = moodValues.length > 0 ? moodValues[moodValues.length - 1] : null;
  const avgMood = moodValues.length > 0 ? moodValues.reduce((a, b) => a + b, 0) / moodValues.length : null;
  const latestWorkoutDays = points.length > 0 ? points[points.length - 1].workout_days : 0;
  const avgWorkoutDays = points.length > 0 ? points.reduce((a, p) => a + p.workout_days, 0) / points.length : 0;

  return (
    <View style={{ gap: 20 }}>
      <View>
        <SubChartHeader
          color={seriesColors.series1}
          title={t("Haftalık Ortalama Ruh Hali", "Weekly Average Mood")}
          value={latestMood !== null ? latestMood.toFixed(1) : "—"}
          unit={latestMood !== null ? `· ${labels[Math.min(5, Math.max(1, Math.round(latestMood)))]}` : ""}
          caption={t("Son kayıtlı hafta", "Latest logged week")}
          chip={avgMood !== null ? `${t("Ort.", "Avg.")} ${avgMood.toFixed(1)}` : "—"}
          isDark={isDark}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <LineChart
          data={moodData}
          width={chartWidth}
          height={CHART_HEIGHT}
          curved
          areaChart
          color={seriesColors.series1}
          thickness={2.5}
          startFillColor={seriesColors.series1}
          endFillColor={seriesColors.series1}
          startOpacity={0.22}
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
          {...warmPanelAxisProps(10, c, isDark)}
          xAxisTextNumberOfLines={2}
          labelsExtraHeight={12}
          initialSpacing={12}
          spacing={Math.max(24, chartWidth / Math.max(points.length, 1))}
          dataPointsColor={seriesColors.series1}
          dataPointsRadius={4}
        />
      </View>

      <View style={styles.divider} />

      <View>
        <SubChartHeader
          color={seriesColors.series2}
          title={t("Haftalık Antrenman Günü", "Weekly Workout Days")}
          value={String(latestWorkoutDays)}
          unit={t("gün", "days")}
          caption={t("Bu hafta", "This week")}
          chip={`${t("Ort.", "Avg.")} ${avgWorkoutDays.toFixed(1)} ${t("gün/hafta", "days/wk")}`}
          isDark={isDark}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <LineChart
          data={workoutData}
          width={chartWidth}
          height={CHART_HEIGHT}
          curved
          areaChart
          color={seriesColors.series2}
          thickness={2.5}
          startFillColor={seriesColors.series2}
          endFillColor={seriesColors.series2}
          startOpacity={0.22}
          endOpacity={0}
          maxValue={7}
          noOfSections={7}
          {...warmPanelAxisProps(10, c, isDark)}
          xAxisTextNumberOfLines={2}
          labelsExtraHeight={12}
          initialSpacing={12}
          spacing={Math.max(24, chartWidth / Math.max(points.length, 1))}
          dataPointsColor={seriesColors.series2}
          dataPointsRadius={4}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    divider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : c.border,
    },
  });
}
