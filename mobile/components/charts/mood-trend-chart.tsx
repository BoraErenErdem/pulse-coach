import { Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { MoodKey, MoodLog } from "@/lib/api";
import { useSeriesColors, useThemeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, moodScaleLabels, thinnedLabel } from "./chart-utils";

// web/src/components/charts/MoodTrendChart.tsx'in mobil portu.
//
// 2026-08-22: dokunma tooltip'i (`pointerConfig`) bilgilendirme kutusunun
// İÇİNDE "çizgi çizgi işaretler" gösteriyordu (bkz. metric-trend-chart.tsx'
// teki AYNI bulgu notu) - önce onPress+altta sabit satır desenine geçildi,
// AMA kullanıcı bulgusu: bu grafik de (Kilo/Bel/Vücut Yağı gibi) zaten tek
// bakışta anlaşılır, dokunma detayına gerek yoktu - özellik TAMAMEN
// kaldırıldı. Nokta/çizgi boyutu diğer sade trend grafikleriyle (bkz.
// metric-trend-chart.tsx) AYNI değerlere getirildi - görsel bütünlük.
const MOOD_SCALE: Record<MoodKey, number> = {
  zor: 1,
  dusuk: 2,
  notr: 3,
  iyi: 4,
  harika: 5,
};

export function MoodTrendChart({ history }: { history: MoodLog[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const labels = moodScaleLabels(t);

  const sorted = [...history].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const data = sorted.map((entry, index) => ({
    value: MOOD_SCALE[entry.mood_key],
    label: thinnedLabel(index, sorted.length, formatDate(entry.log_date, language, { day: "2-digit", month: "2-digit" })),
  }));

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t(
          "Henüz ruh hali kaydı yok. Sohbet sekmesindeki mod seçiciyi kullandıkça trend burada görünecek.",
          "No mood logged yet. The trend will show up here as you use the mood picker on the chat tab."
        )}
      </Text>
    );
  }

  return (
    <View>
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        curved
        areaChart
        color={seriesColors.series1}
        thickness={2.5}
        startFillColor={seriesColors.series1}
        endFillColor={seriesColors.series1}
        startOpacity={0.18}
        endOpacity={0}
        yAxisOffset={1}
        maxValue={4}
        noOfSections={4}
        yAxisLabelTexts={[labels[1], labels[2], labels[3], labels[4], labels[5]]}
        {...chartAxisProps(10, c)}
        initialSpacing={12}
        spacing={data.length > 1 ? Math.max(24, chartWidth / data.length) : 40}
        dataPointsColor={seriesColors.series1}
        dataPointsRadius={4}
        scrollToEnd
      />
    </View>
  );
}
