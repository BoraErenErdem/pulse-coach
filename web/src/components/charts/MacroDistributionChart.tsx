"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const MACRO_COLORS: Record<string, string> = {
  Protein: "var(--series-2)",
  Karbonhidrat: "var(--series-3)",
  Yağ: "var(--series-4)",
};

function MacroTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; grams: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { label, grams } = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{grams.toFixed(0)}g</p>
    </div>
  );
}

export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
}) {
  const data = [
    { key: "Protein", label: "Protein", grams: proteinG },
    { key: "Karbonhidrat", label: "Karbonhidrat", grams: carbsG },
    { key: "Yağ", label: "Yağ", grams: fatG },
  ];

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return <p className="text-sm text-zinc-500">Bugün için henüz öğün kaydı yok.</p>;
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
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<MacroTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
          <Bar
            dataKey="grams"
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
            animationDuration={700}
            animationEasing="ease-out"
            activeBar={{ fillOpacity: 0.8 }}
          >
            {data.map((item) => (
              <Cell key={item.key} fill={MACRO_COLORS[item.key]} className="cursor-pointer" />
            ))}
            <LabelList
              dataKey="grams"
              position="top"
              formatter={(value: unknown) => `${Number(value ?? 0).toFixed(0)}g`}
              fill="var(--chart-muted)"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
