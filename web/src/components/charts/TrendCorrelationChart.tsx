"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyTrendPoint } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { ChartTooltipShell, formatChartDate, moodScaleLabels } from "./chart-utils";

function MoodTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
}) {
  const { language } = useLanguage();
  const t = useT();
  if (!active || !payload || payload.length === 0 || payload[0].value == null) return null;
  const value = payload[0].value;
  const labels = moodScaleLabels(t);
  return (
    <ChartTooltipShell
      label={t(`${formatChartDate(String(label), language)} haftası`, `week of ${formatChartDate(String(label), language)}`)}
      value={labels[Math.round(value)] ?? value.toFixed(1)}
    />
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
  const { language } = useLanguage();
  const t = useT();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <ChartTooltipShell
      label={t(`${formatChartDate(String(label), language)} haftası`, `week of ${formatChartDate(String(label), language)}`)}
      value={`${payload[0].value} ${t("gün", "days")}`}
    />
  );
}

/** Ruh hali ve antrenman günü haftalık trendini İKİ ayrı tek-eksenli grafik
 * olarak gösterir (ölçekleri farklı olduğu için ikisini tek bir çift-eksenli
 * grafikte birleştirmek yanıltıcı olurdu) - ortak hafta ekseni sayesinde
 * yan yana okununca örüntü görsel olarak karşılaştırılabiliyor. */
export function TrendCorrelationChart({ points }: { points: WeeklyTrendPoint[] }) {
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);
  const hasAnyData = points.some((p) => p.avg_mood_score !== null || p.workout_days > 0);

  if (!hasAnyData) {
    return (
      <p className="text-sm text-zinc-500">
        {t(
          "Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.",
          "Not enough data yet. The weekly trend will show up here as you log mood and workouts."
        )}
      </p>
    );
  }

  const moodData = points.map((p) => ({ week: p.week_start, mood: p.avg_mood_score }));
  const workoutData = points.map((p) => ({ week: p.week_start, days: p.workout_days }));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">{t("Haftalık Ortalama Ruh Hali", "Weekly Average Mood")}</p>
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
                tickFormatter={(value) => formatChartDate(value, language)}
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--chart-axis)" }}
              />
              <YAxis
                width={56}
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(value: number) => labels[value] ?? String(value)}
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
        <p className="mb-2 text-xs font-medium text-zinc-500">{t("Haftalık Antrenman Günü", "Weekly Workout Days")}</p>
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
                tickFormatter={(value) => formatChartDate(value, language)}
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
