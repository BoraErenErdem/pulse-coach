"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const MACRO_COLORS: Record<string, string> = {
  Protein: "var(--series-2)",
  Karbonhidrat: "var(--series-3)",
  Yağ: "var(--series-4)",
  Şeker: "var(--series-5)",
  Sodyum: "var(--series-6)",
};

function ValueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; value: number; unit: string } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { label, value, unit } = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {value.toFixed(0)}
        {unit}
      </p>
    </div>
  );
}

export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
  sugarG,
  sodiumMg,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Katalogda şeker/sodyum verisi olmayan öğünler toplamı etkilemez (backend
   * eksik değerleri 0 gibi davranıp atlar) — bu yüzden 0, "hiç yok" ile
   * "veri eksik" arasında ayrım yapmıyor; grafik yine de gösterilir, sadece
   * hiç öğün kaydı yoksa tamamen gizlenir (aşağıdaki boş-durum). */
  sugarG: number;
  sodiumMg: number;
}) {
  const gramsData = [
    { key: "Protein", label: "Protein", value: proteinG, unit: "g" },
    { key: "Karbonhidrat", label: "Karbonhidrat", value: carbsG, unit: "g" },
    { key: "Yağ", label: "Yağ", value: fatG, unit: "g" },
    { key: "Şeker", label: "Şeker", value: sugarG, unit: "g" },
  ];
  // Sodyum mg cinsinden, diğerleri gram — aynı çubuk grafiğe ikinci bir Y
  // ekseniyle (dual-axis) sıkıştırmak yerine AYRI, tek eksenli küçük bir
  // grafik olarak gösteriliyor (dataviz skill'in "never a dual-axis chart"
  // kuralı — iki farklı ölçekli veri tek eksende yanıltıcı olur).
  const sodiumData = [{ key: "Sodyum", label: "Sodyum", value: sodiumMg, unit: "mg" }];

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return <p className="text-sm text-zinc-500">Bugün için henüz öğün kaydı yok.</p>;
  }

  return (
    <div className="viz-root flex flex-col gap-3 sm:flex-row">
      <div className="flex-[3]">
        <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Makrolar (g)</p>
        <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={gramsData} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
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
            <Tooltip content={<ValueTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={72}
              animationDuration={700}
              animationEasing="ease-out"
              activeBar={{ fillOpacity: 0.8 }}
            >
              {gramsData.map((item) => (
                <Cell key={item.key} fill={MACRO_COLORS[item.key]} className="cursor-pointer" />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value: unknown) => `${Number(value ?? 0).toFixed(0)}g`}
                fill="var(--chart-muted)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)] pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 flex-1">
        <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Sodyum (mg) — ayrı ölçek</p>
        <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sodiumData} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
            />
            <YAxis
              width={40}
              allowDecimals={false}
              tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ValueTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={72}
              animationDuration={700}
              animationEasing="ease-out"
              activeBar={{ fillOpacity: 0.8 }}
            >
              {sodiumData.map((item) => (
                <Cell key={item.key} fill={MACRO_COLORS[item.key]} className="cursor-pointer" />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value: unknown) => `${Number(value ?? 0).toFixed(0)}mg`}
                fill="var(--chart-muted)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
