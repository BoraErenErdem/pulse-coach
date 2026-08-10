"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MoodKey, MoodLog } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { ChartTooltipShell, formatChartDate, moodScaleLabels } from "./chart-utils";

const MOOD_SCALE: Record<MoodKey, number> = {
  zor: 1,
  dusuk: 2,
  notr: 3,
  iyi: 4,
  harika: 5,
};

function MoodTooltip({
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
  const labels = moodScaleLabels(t);
  return (
    <ChartTooltipShell
      label={formatChartDate(String(label), language)}
      value={labels[payload[0].value] ?? payload[0].value}
    />
  );
}

export function MoodTrendChart({ history }: { history: MoodLog[] }) {
  const { language } = useLanguage();
  const t = useT();
  const labels = moodScaleLabels(t);
  const data = history
    .map((entry) => ({ date: entry.log_date, mood: MOOD_SCALE[entry.mood_key] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {t(
          "Henüz ruh hali kaydı yok. Sohbet sayfasındaki mod seçiciyi kullandıkça trend burada görünecek.",
          "No mood logged yet. The trend will show up here as you use the mood picker on the chat page."
        )}
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
