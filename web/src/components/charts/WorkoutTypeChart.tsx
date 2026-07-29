"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProgressLog } from "@/lib/api";

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  kuvvet: "Kuvvet",
  kardiyo: "Kardiyo",
  esneklik: "Esneklik",
  karışık: "Karışık",
};

const WORKOUT_TYPE_COLORS: Record<string, string> = {
  kuvvet: "var(--series-2)",
  kardiyo: "var(--series-3)",
  esneklik: "var(--series-4)",
  karışık: "var(--series-5)",
};

function WorkoutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; count: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { label, count } = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {count} antrenman
      </p>
    </div>
  );
}

export function WorkoutTypeChart({ logs }: { logs: ProgressLog[] }) {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    if (log.workout_completed && log.workout_type) {
      counts[log.workout_type] = (counts[log.workout_type] ?? 0) + 1;
    }
  }

  const data = Object.entries(WORKOUT_TYPE_LABELS)
    .map(([key, label]) => ({ key, label, count: counts[key] ?? 0 }))
    .filter((item) => item.count > 0);

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">Henüz tamamlanmış antrenman kaydı yok.</p>;
  }

  return (
    <div className="viz-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
          />
          <YAxis
            width={32}
            allowDecimals={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<WorkoutTooltip />}
            cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
            animationDuration={700}
            animationEasing="ease-out"
            activeBar={{ fillOpacity: 0.8 }}
          >
            {data.map((item) => (
              <Cell key={item.key} fill={WORKOUT_TYPE_COLORS[item.key]} className="cursor-pointer" />
            ))}
            <LabelList dataKey="count" position="top" fill="var(--chart-muted)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
