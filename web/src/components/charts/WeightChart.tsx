"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressLog } from "@/lib/api";

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function WeightTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{formatDate(String(label))}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {payload[0].value} kg
      </p>
    </div>
  );
}

/** Backend aynı gün için birden fazla kilo girişine izin veriyor (her
 * `POST /progress/log` yeni bir satır - kasıtlı, log_count/streak bu
 * davranışa dayanıyor, bkz. backend/app/services/progress_service.py).
 * "Trend" grafiği için bu ham haliyle yanıltıcı (aynı günde zikzak) - SADECE
 * bu grafikte günün en son (en yüksek id'li) ölçümü gösterilir, veri/diğer
 * ekranlar etkilenmez (2026-08-06, mobil canlı testinde bulundu). */
function dedupeLastWeightPerDay(logs: ProgressLog[]): ProgressLog[] {
  const byDate = new Map<string, ProgressLog>();
  for (const log of logs) {
    if (log.weight === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) {
      byDate.set(log.log_date, log);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function WeightChart({ logs }: { logs: ProgressLog[] }) {
  const data = dedupeLastWeightPerDay(logs).map((log) => ({
    date: log.log_date,
    weight: log.weight as number,
  }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Henüz kilo verisi yok. Kilonu kaydettikçe burada trend olarak görünecek.
      </p>
    );
  }

  return (
    <div className="viz-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
          />
          <YAxis
            width={40}
            domain={([dataMin, dataMax]: readonly [number, number]) => {
              // Tek veri noktasında (dataMin === dataMax) 1kg'lık dar bir
              // aralık, recharts'ın varsayılan tick üretiminde ondalıklı
              // (ör. 82.5) etiketler üretiyordu — dar genişlik+negatif sol
              // margin ile birleşince ilk hane kırpılıp yanıltıcı görünüyordu.
              // Tam sayı sınırlar + allowDecimals={false} bunu engelliyor.
              const padding = Math.max(1, (dataMax - dataMin) * 0.15);
              return [Math.floor(dataMin - padding), Math.ceil(dataMax + padding)];
            }}
            allowDecimals={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<WeightTooltip />}
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#weightFill)"
            dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
