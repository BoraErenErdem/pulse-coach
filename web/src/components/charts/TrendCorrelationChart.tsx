"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyTrendPoint } from "@/lib/api";

const MOOD_SCALE_LABELS: Record<number, string> = {
  1: "Zor",
  2: "Düşük",
  3: "Nötr",
  4: "İyi",
  5: "Harika",
};

function formatWeek(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function MoodTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || payload[0].value == null) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{formatWeek(String(label))} haftası</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {MOOD_SCALE_LABELS[Math.round(value)] ?? value.toFixed(1)}
      </p>
    </div>
  );
}

function WorkoutDaysTooltip({
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
      <p className="mb-0.5 text-zinc-500">{formatWeek(String(label))} haftası</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{payload[0].value} gün</p>
    </div>
  );
}

/** Ruh hali ve antrenman günü haftalık trendini İKİ ayrı tek-eksenli grafik
 * olarak gösterir (ölçekleri farklı olduğu için ikisini tek bir çift-eksenli
 * grafikte birleştirmek yanıltıcı olurdu) - ortak hafta ekseni sayesinde
 * yan yana okununca örüntü görsel olarak karşılaştırılabiliyor. */
export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const hasAnyData = points.some((p) => p.avg_mood_score !== null || p.workout_days > 0);

  if (!hasAnyData) {
    return (
      <p className="text-sm text-zinc-500">
        Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.
      </p>
    );
  }

  const moodData = points.map((p) => ({ week: p.week_start, mood: p.avg_mood_score }));
  const workoutData = points.map((p) => ({ week: p.week_start, days: p.workout_days }));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">Haftalık Ortalama Ruh Hali</p>
        <div className="viz-root h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={moodData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="trendMoodFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
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
                fill="url(#trendMoodFill)"
                connectNulls
                dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                animationDuration={700}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">Haftalık Antrenman Günü</p>
        <div className="viz-root h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={workoutData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="trendWorkoutFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--series-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={formatWeek}
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--chart-axis)" }}
              />
              <YAxis
                width={32}
                domain={[0, 7]}
                allowDecimals={false}
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<WorkoutDaysTooltip />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="days"
                stroke="var(--series-2)"
                strokeWidth={2}
                fill="url(#trendWorkoutFill)"
                dot={{ r: 3, fill: "var(--series-2)", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "var(--series-2)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                animationDuration={700}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
