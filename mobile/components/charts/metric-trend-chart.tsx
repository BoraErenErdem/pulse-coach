import { Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { ProgressLog } from "@/lib/api";
import { useThemeColors } from "@/components/ui";
import { useLanguage } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, thinnedLabel } from "./chart-utils";

// WeightChart'ın genelleştirilmiş hali (2026-08-11, kullanıcı isteği: bel
// çevresi/vücut yağ oranı trendleri için de aynı grafik gerekiyordu) -
// tek/farklı olan alan hangi ProgressLog kolonuna bakıldığı (`getValue`),
// birim ve renk. WeightChart artık bu bileşenin ince bir sarmalayıcısı
// (bkz. weight-chart.tsx) - kopya kod yerine [[2026-08-10 mimari borç
// raporu]] ile aynı ilke.
//
// 2026-08-22: dokunma tooltip'i (`pointerConfig`) bilgilendirme kutusunun
// İÇİNDE "çizgi çizgi işaretler" gösteriyordu (kütüphanenin ForeignObject/
// Animated.View tabanlı pointer katmanı, grafiğin eğri çizgisi/alan
// dolgusuyla native tarafta güvenilir bir z-order kurmuyor) - önce
// WorkoutVolumeChart'taki desene (onPress + altta sabit "Seçili Değer"
// satırı) geçildi, AMA kullanıcı bulgusu: bu 3 grafik (Kilo/Bel/Vücut Yağı)
// zaten tek bakışta anlaşılır, dokunma detayına gerek yoktu - özellik
// TAMAMEN kaldırıldı, sade/salt-görsel bir trend çizgisine dönüldü. Nokta
// küçültüldü (6→3) ama "çok küçük kaldı" bulgusuyla 4'e çıkarıldı - çizgi
// kalınlaştırıldı (2→2.5). Bu boyutlar artık uygulamadaki TÜM sade (dokunma
// içermeyen) trend grafiklerinde ortak (bkz. mood-trend-chart.tsx,
// calorie-trend-chart.tsx, trend-correlation-chart.tsx) - görsel bütünlük.
function dedupeLastPerDay(logs: ProgressLog[], getValue: (log: ProgressLog) => number | null): ProgressLog[] {
  const byDate = new Map<string, ProgressLog>();
  for (const log of logs) {
    if (getValue(log) === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) {
      byDate.set(log.log_date, log);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function MetricTrendChart({
  logs,
  getValue,
  unit,
  color,
  emptyMessage,
}: {
  logs: ProgressLog[];
  getValue: (log: ProgressLog) => number | null;
  unit: string;
  color: string;
  emptyMessage: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const c = useThemeColors();

  const dedupedLogs = dedupeLastPerDay(logs, getValue);
  const data = dedupedLogs.map((log, index) => ({
    value: getValue(log) as number,
    label: thinnedLabel(index, dedupedLogs.length, formatDate(log.log_date, language, { day: "2-digit", month: "2-digit" })),
  }));

  if (data.length === 0) {
    return <Text style={{ fontSize: 13, color: c.muted }}>{emptyMessage}</Text>;
  }

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(1, (maxValue - minValue) * 0.15);

  return (
    <View>
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        curved
        areaChart
        color={color}
        thickness={2.5}
        startFillColor={color}
        endFillColor={color}
        startOpacity={0.18}
        endOpacity={0}
        yAxisOffset={Math.floor(minValue - padding)}
        maxValue={Math.ceil(maxValue + padding) - Math.floor(minValue - padding)}
        noOfSections={4}
        yAxisLabelSuffix={unit}
        {...chartAxisProps(11, c)}
        initialSpacing={12}
        spacing={data.length > 1 ? Math.max(24, chartWidth / data.length) : 40}
        dataPointsColor={color}
        dataPointsRadius={4}
        scrollToEnd
      />
    </View>
  );
}
