"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressLog } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { ChartTooltipShell, formatChartDate } from "./chart-utils";

// WeightChart.tsx'in genelleştirilmiş hali (2026-08-11, kullanıcı isteği:
// bel çevresi/vücut yağ oranı trendleri için de aynı grafik gerekiyordu) -
// tek/farklı olan alan hangi ProgressLog kolonuna bakıldığı (`getValue`),
// birim, renk (CSS değişkeni) ve gradient id'si. WeightChart artık bu
// bileşenin ince bir sarmalayıcısı (bkz. WeightChart.tsx) - kopya kod
// yerine [[2026-08-10 mimari borç raporu]] ile aynı ilke. `gradientId`
// benzersiz olmalı - ayrı grafikler (Kilo/Bel/Yağ) AYNI sayfada birlikte
// render edildiğinde SVG <defs> id çakışması aynı dolguyu tüm grafiklere
// sızdırabilir.

function MetricTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unit: string;
}) {
  const { language } = useLanguage();
  if (!active || !payload || payload.length === 0) return null;
  return <ChartTooltipShell label={formatChartDate(String(label), language)} value={`${payload[0].value}${unit}`} />;
}

/** Backend aynı gün için birden fazla girişe izin veriyor (her `POST
 * /progress/log` yeni bir satır - kasıtlı, bkz. backend/app/services/
 * progress_service.py). "Trend" grafiği için bu ham haliyle yanıltıcı
 * (aynı günde zikzak) - SADECE bu grafikte günün en son (en yüksek
 * id'li) ölçümü gösterilir, veri/diğer ekranlar etkilenmez. */
function dedupeLastPerDay(logs: ProgressLog[], getValue: (log: ProgressLog) => number | null): ProgressLog[] {
  const byDate = new Map<string, ProgressLog>();
  for (const log of logs) {
    if (getValue(log) === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) {
      byDate.set(log.log_date, log);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function MetricTrendChart({
  logs,
  getValue,
  gradientId,
  seriesVar,
  unit,
  emptyMessage,
}: {
  logs: ProgressLog[];
  getValue: (log: ProgressLog) => number | null;
  gradientId: string;
  seriesVar: string;
  unit: string;
  emptyMessage: string;
}) {
  const { language } = useLanguage();
  const data = dedupeLastPerDay(logs, getValue).map((log) => ({
    date: log.log_date,
    value: getValue(log) as number,
  }));

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <div className="viz-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(${seriesVar})`} stopOpacity={0.18} />
              <stop offset="100%" stopColor={`var(${seriesVar})`} stopOpacity={0} />
            </linearGradient>
          </defs>
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
            domain={([dataMin, dataMax]: readonly [number, number]) => {
              // Tek veri noktasında (dataMin === dataMax) dar bir aralık,
              // recharts'ın varsayılan tick üretiminde ondalıklı etiketler
              // üretiyordu - dar genişlik+negatif sol margin ile birleşince
              // ilk hane kırpılıp yanıltıcı görünüyordu. Tam sayı sınırlar +
              // allowDecimals={false} bunu engelliyor.
              const padding = Math.max(1, (dataMax - dataMin) * 0.15);
              return [Math.floor(dataMin - padding), Math.ceil(dataMax + padding)];
            }}
            allowDecimals={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<MetricTooltip unit={unit} />}
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`var(${seriesVar})`}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: `var(${seriesVar})`, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: `var(${seriesVar})`, stroke: "var(--chart-surface)", strokeWidth: 2 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
