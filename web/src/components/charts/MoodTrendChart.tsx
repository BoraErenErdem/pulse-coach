"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MoodKey, MoodLog } from "@/lib/api";

const MOOD_SCALE: Record<MoodKey, number> = {
  zor: 1,
  dusuk: 2,
  notr: 3,
  iyi: 4,
  harika: 5,
};

const MOOD_SCALE_LABELS: Record<number, string> = {
  1: "Zor",
  2: "Düşük",
  3: "Nötr",
  4: "İyi",
  5: "Harika",
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function MoodTooltip({
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
        {MOOD_SCALE_LABELS[payload[0].value] ?? payload[0].value}
      </p>
    </div>
  );
}

export function MoodTrendChart({ history }: { history: MoodLog[] }) {
  const data = history
    .map((entry) => ({ date: entry.log_date, mood: MOOD_SCALE[entry.mood_key] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Henüz ruh hali kaydı yok. Sohbet sayfasındaki mod seçiciyi kullandıkça trend burada görünecek.
      </p>
    );
  }

  return (
    <div className="viz-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
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
            width={56}
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(value: number) => MOOD_SCALE_LABELS[value] ?? String(value)}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<MoodTooltip />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="mood"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#moodFill)"
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
