import { Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { ProgressLog } from "@/lib/api";
import { colors, seriesColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, thinnedLabel } from "./chart-utils";

// web/src/components/charts/WeightChart.tsx'in mobil portu.

/** Backend aynı gün için birden fazla kilo girişine izin veriyor (her
 * `POST /progress/log` yeni bir satır - kasıtlı, log_count/streak bu
 * davranışa dayanıyor, bkz. progress_service.py). "Trend" grafiği için bu
 * ham haliyle yanıltıcı (aynı günde zikzak) - SADECE bu grafikte günün
 * en son (en yüksek id'li) ölçümü gösterilir, veri/diğer ekranlar etkilenmez. */
function dedupeLastWeightPerDay(logs: ProgressLog[]): ProgressLog[] {
  const byDate = new Map<string, ProgressLog>();
  for (const log of logs) {
    if (log.weight === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) {
      byDate.set(log.log_date, log);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function WeightChart({ logs }: { logs: ProgressLog[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80; // kart padding (2x20) + eksen boşluğu
  const { language } = useLanguage();
  const t = useT();

  const dedupedLogs = dedupeLastWeightPerDay(logs);
  const data = dedupedLogs.map((log, index) => ({
    value: log.weight as number,
    label: thinnedLabel(index, dedupedLogs.length, formatDate(log.log_date, language, { day: "2-digit", month: "2-digit" })),
  }));

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        {t(
          "Henüz kilo verisi yok. Kilonu kaydettikçe burada trend olarak görünecek.",
          "No weight data yet. It will show up here as a trend as you log your weight."
        )}
      </Text>
    );
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
        color={seriesColors.series1}
        thickness={2}
        startFillColor={seriesColors.series1}
        endFillColor={seriesColors.series1}
        startOpacity={0.18}
        endOpacity={0}
        yAxisOffset={Math.floor(minValue - padding)}
        maxValue={Math.ceil(maxValue + padding) - Math.floor(minValue - padding)}
        noOfSections={4}
        yAxisLabelSuffix=" kg"
        {...chartAxisProps()}
        initialSpacing={12}
        spacing={data.length > 1 ? Math.max(24, chartWidth / data.length) : 40}
        dataPointsColor={seriesColors.series1}
        dataPointsRadius={3}
        pointerConfig={{
          pointerStripColor: colors.border,
          pointerColor: seriesColors.series1,
          radius: 5,
          pointerLabelComponent: (items: { value: number }[]) => (
            <View
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                {items[0]?.value} kg
              </Text>
            </View>
          ),
        }}
      />
    </View>
  );
}
