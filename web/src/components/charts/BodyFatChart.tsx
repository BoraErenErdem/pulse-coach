"use client";

import type { ProgressLog } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { MetricTrendChart } from "./MetricTrendChart";

export function BodyFatChart({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  return (
    <MetricTrendChart
      logs={logs}
      getValue={(log) => log.body_fat_pct}
      gradientId="bodyFatFill"
      seriesVar="--series-4"
      unit="%"
      emptyMessage={t(
        "Henüz vücut yağ oranı verisi yok. Kaydettikçe burada trend olarak görünecek.",
        "No body fat data yet. It'll show up here as a trend as you log it."
      )}
    />
  );
}
