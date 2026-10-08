"use client";

import { useMemo, useState } from "react";
import type { MoodLog } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { moodScaleLabels } from "@/components/charts/chart-utils";
import { TrendLineChart, type ChartPoint } from "@/components/charts/svg-charts";
import { ChartWell } from "@/components/charts/panel-parts";

// Mobil mood-history.tsx "Trend" kartının web karşılığı (2026-10-08): tarihe ölçekli camgöbeği çizgi,
// x ekseni başlangıç / orta / "Bugün", tıklanan gün başlıkta (emoji + ruh hali). Önceden Recharts.

const MOOD_SCORE: Record<MoodLog["mood_key"], number> = { zor: 1, dusuk: 2, notr: 3, iyi: 4, harika: 5 };
const MOOD_META: Record<MoodLog["mood_key"], { emoji: string; tr: string; en: string }> = {
  zor: { emoji: "😔", tr: "Zor", en: "Tough" },
  dusuk: { emoji: "😕", tr: "Düşük", en: "Low" },
  notr: { emoji: "🙂", tr: "Nötr", en: "Neutral" },
  iyi: { emoji: "😊", tr: "İyi", en: "Good" },
  harika: { emoji: "🤩", tr: "Harika", en: "Great" },
};
const DAY_MS = 86400000;

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MoodTrendChart({ history }: { history: MoodLog[] }) {
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const loc = language === "en" ? "en-US" : "tr-TR";

  const trend = useMemo(() => {
    if (history.length === 0) return null;
    const sorted = [...history].sort((a, b) => a.log_date.localeCompare(b.log_date));
    const points: ChartPoint[] = sorted.map((entry) => ({ t: new Date(`${entry.log_date}T12:00:00`).getTime(), value: MOOD_SCORE[entry.mood_key] }));
    const end = new Date(`${localIso(new Date())}T12:00:00`).getTime();
    const start = Math.min(points[0].t, end - 13 * DAY_MS);
    const mid = start + (end - start) / 2;
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(loc, { day: "numeric", month: "short" });
    return {
      sorted,
      points,
      domainX: [start, end] as [number, number],
      xTicks: [
        { t: start, label: fmt(start) },
        { t: mid, label: fmt(mid) },
        { t: end, label: t("Bugün", "Today") },
      ],
    };
  }, [history, loc, t]);

  if (!trend) {
    return <p className="text-sm text-zinc-500">{t("Kayıt ekledikçe trend burada görünecek.", "Your trend will appear here as you log.")}</p>;
  }

  const selected = selectedIndex != null ? trend.sorted[selectedIndex] : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500 dark:text-white/80" aria-live="polite">
        {selected
          ? `${new Date(`${selected.log_date}T12:00:00`).toLocaleDateString(loc, { day: "numeric", month: "long" })} · ${MOOD_META[selected.mood_key].emoji} ${t(MOOD_META[selected.mood_key].tr, MOOD_META[selected.mood_key].en)}`
          : t("Bir güne tıklayarak ayrıntısını gör", "Click a day to see it")}
      </p>
      <ChartWell>
        <TrendLineChart
          ariaLabel={t("Ruh hali trendi", "Mood trend")}
          points={trend.points}
          domainX={trend.domainX}
          domainY={[0.6, 5.4]}
          yTicks={[1, 2, 3, 4, 5]}
          formatY={(v) => labels[v] ?? ""}
          xTicks={trend.xTicks}
          color="var(--id-mood)"
          gutterLeft={54}
          height={220}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      </ChartWell>
    </div>
  );
}
