import type { ProgressLog } from "@/lib/api";
import { seriesColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./metric-trend-chart";

// web/src/components/charts/WeightChart.tsx'in mobil portu - artık
// MetricTrendChart'ın (bkz. metric-trend-chart.tsx) ince bir sarmalayıcısı.

export function WeightChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.weight}
      unit=" kg"
      color={seriesColors.series1}
      emptyMessage={t(
        "Henüz kilo verisi yok. Kilonu kaydettikçe burada trend olarak görünecek.",
        "No weight data yet. It will show up here as a trend as you log your weight."
      )}
    />
  );
}
