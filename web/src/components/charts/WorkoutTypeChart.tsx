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
import type { WorkoutSession } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { WORKOUT_TYPE_LABELS } from "@/lib/labels";
import { ChartTooltipShell } from "./chart-utils";

// İç anahtarlar (renk eşleşmesi için) - görünür değil, dile bağlı değil.
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
  const t = useT();
  if (!active || !payload || payload.length === 0) return null;
  const { label, count } = payload[0].payload;
  return <ChartTooltipShell label={label} value={`${count} ${t("antrenman", "workouts")}`} />;
}

// 2026-08-06: İlerleme sekmesinden Antrenman sekmesine taşındı (Faz B,
// İlerleme↔Antrenman tekrarını giderme kararı), veri kaynağı
// ProgressLog.workout_type yerine WorkoutSession.workout_type oldu.
export function WorkoutTypeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { language } = useLanguage();
  const t = useT();
  const labels = WORKOUT_TYPE_LABELS[language];

  const counts: Record<string, number> = {};
  for (const session of sessions) {
    if (session.workout_type) {
      counts[session.workout_type] = (counts[session.workout_type] ?? 0) + 1;
    }
  }

  const data = Object.entries(labels)
    .map(([key, label]) => ({ key, label, count: counts[key] ?? 0 }))
    .filter((item) => item.count > 0);

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">{t("Henüz tamamlanmış antrenman kaydı yok.", "No completed workout logged yet.")}</p>;
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
