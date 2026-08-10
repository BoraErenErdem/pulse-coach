"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WorkoutSession } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { ChartTooltipShell, formatChartDate } from "./chart-utils";

function VolumeTooltip({
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
      label={formatChartDate(String(label), language)}
      value={`${payload[0].value.toFixed(0)} ${t("kg hacim", "kg volume")}`}
    />
  );
}

export function WorkoutVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { language } = useLanguage();
  const t = useT();
  const data = sessions
    .map((session) => {
      const volume = session.sets.reduce(
        (sum, set) => sum + (set.weight_kg && set.reps ? set.weight_kg * set.reps : 0),
        0
      );
      return { date: session.session_date, volume };
    })
    .filter((point) => point.volume > 0);

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {t("Henüz ağırlıklı set verisi yok. Antrenman kaydettikçe hacim trendi burada görünecek.", "No weighted set data yet. The volume trend will show up here as you log workouts.")}
      </p>
    );
  }

  return (
    <div className="viz-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
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
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<VolumeTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
          <Bar
            dataKey="volume"
            fill="var(--series-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            animationDuration={700}
            animationEasing="ease-out"
            activeBar={{ fillOpacity: 0.8 }}
            className="cursor-pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
