import type { ProgressLog } from "@/lib/api";
import { seriesColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./metric-trend-chart";

export function BodyFatChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.body_fat_pct}
      unit="%"
      color={seriesColors.series4}
      emptyMessage={t(
        "Henüz vücut yağ oranı verisi yok. Kaydettikçe burada trend olarak görünecek.",
        "No body fat data yet. It will show up here as a trend as you log it."
      )}
    />
  );
}
