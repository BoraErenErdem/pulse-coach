"use client";

import type { ProgressLog } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./MetricTrendChart";

// artık MetricTrendChart'ın (bkz. MetricTrendChart.tsx) ince bir sarmalayıcısı.

export function WeightChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.weight}
      gradientId="weightFill"
      seriesVar="--series-1"
      unit=" kg"
      emptyMessage={t(
        "Henüz kilo verisi yok. Kilonu kaydettikçe burada trend olarak görünecek.",
        "No weight data yet. It'll show up here as a trend as you log your weight."
      )}
    />
  );
}
