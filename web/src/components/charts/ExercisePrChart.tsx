"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExerciseHistoryEntry } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { ChartTooltipShell, formatAxisNumber, formatChartDate } from "./chart-utils";

// Mobil exercise-pr-chart.tsx'in web karşılığı (2026-10-06): rekor kırılan her kaydın
// değeri (ağırlık, yoksa tekrar) tarih sırasıyla. Kıyas için en az iki rekor gerekir.
export function ExercisePrChart({ entries }: { entries: ExerciseHistoryEntry[] }) {
  const { language } = useLanguage();
  const t = useT();
  // Çağıran sayfa kayıtları yeniden eskiye tutar ("Tüm Kayıtlar" için); aynı gündeki setlerin sırası da korunsun diye önce ters
  // çevrilir, sonra (kararlı) tarih sıralaması yapılır. Yalnız sıralama aynı günün
  // rekorlarını azalıyormuş gibi gösteriyordu (canlı test 2026-10-06).
  const points = [...entries]
    .reverse()
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

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">{t(`Birim: ${unit}`, `Unit: ${unit}`)}</p>
      <div className="viz-root h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatChartDate(value, language)}
              tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
            />
            <YAxis
              width={40}
              tickFormatter={(value: number) => formatAxisNumber(value, language)}
              tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
              content={({ active, payload, label }) =>
                active && payload && payload.length > 0 ? (
                  <ChartTooltipShell label={formatChartDate(String(label), language)} value={`${payload[0].value} ${unit}`} />
                ) : null
              }
            />
            <Bar dataKey="value" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
