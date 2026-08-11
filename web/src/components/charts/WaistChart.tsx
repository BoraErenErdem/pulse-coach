"use client";

import type { ProgressLog } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./MetricTrendChart";

export function WaistChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.waist_cm}
      gradientId="waistFill"
      seriesVar="--series-3"
      unit=" cm"
      emptyMessage={t(
        "Henüz bel çevresi verisi yok. Kaydettikçe burada trend olarak görünecek.",
        "No waist data yet. It'll show up here as a trend as you log it."
      )}
    />
  );
}
