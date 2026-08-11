import type { ProgressLog } from "@/lib/api";
import { seriesColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./metric-trend-chart";

export function WaistChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.waist_cm}
      unit=" cm"
      color={seriesColors.series3}
      emptyMessage={t(
        "Henüz bel çevresi verisi yok. Kaydettikçe burada trend olarak görünecek.",
        "No waist data yet. It will show up here as a trend as you log it."
      )}
    />
  );
}
