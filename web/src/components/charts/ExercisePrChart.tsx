"use client";

import { useState } from "react";
import type { ExerciseHistoryEntry } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { formatAxisNumber, formatChartDate } from "./chart-utils";
import { niceTicks, WeeklyBarsChart } from "./svg-charts";
import { ChartWell } from "./panel-parts";

// Kişisel rekor gelişimi (mobil exercise-pr-chart.tsx, 2026-10-08): rekor kırılan günler Antrenman
// kırmızısıyla çubuk, değer çubuğun üstünde. Önceden Recharts + genel turuncu.

export function ExercisePrChart({ entries }: { entries: ExerciseHistoryEntry[] }) {
  const { language } = useLanguage();
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const points = [...entries]
    .filter((entry) => entry.is_personal_record && (entry.weight_kg != null || entry.reps != null))
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .map((entry) => ({ date: entry.session_date, value: entry.weight_kg ?? entry.reps ?? 0, isWeight: entry.weight_kg != null }));

  if (points.length < 2) {
    return (
      <p className="text-sm text-zinc-500">
        {t(
          "Kişisel rekor gelişimini görmek için en az iki farklı günde rekor kırman gerekiyor.",
          "You need a personal record on at least two different days to see your progress."
        )}
      </p>
    );
  }

  const unit = points[points.length - 1].isWeight ? "kg" : t("tekrar", "reps");
  const max = Math.max(...points.map((p) => p.value));
  const yTicks = niceTicks(0, max * 1.12, 3);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500 dark:text-white/80">{t(`Birim: ${unit}`, `Unit: ${unit}`)}</p>
      <ChartWell>
        <WeeklyBarsChart
          ariaLabel={points.map((p) => `${formatChartDate(p.date, language)}: ${p.value} ${unit}`).join(", ")}
          values={points.map((p) => p.value)}
          xLabels={points.map((p) => formatChartDate(p.date, language))}
          domainY={[0, Math.max(yTicks[yTicks.length - 1] ?? max, max * 1.12)]}
          yTicks={yTicks}
          formatY={(v) => formatAxisNumber(v, language)}
          color="var(--id-workout)"
          showValues
          maxBarWidth={44}
          gutterLeft={36}
          height={200}
          selectedIndex={selected}
          onSelect={setSelected}
        />
      </ChartWell>
    </div>
  );
}
