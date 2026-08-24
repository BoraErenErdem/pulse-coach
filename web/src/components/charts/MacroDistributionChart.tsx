"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MealEntry } from "@/lib/api";
import { NUTRIENT_SERIES_VAR, type NutrientKey } from "@/components/ui";
import { useT } from "@/lib/language-context";
import { ChartTooltipShell } from "./chart-utils";

// mobile/components/charts/macro-distribution-chart.tsx'in web portu
// (2026-08-24, "web'i mobille hizala" kullanıcı kararı) - ÖNCEDEN sodyum
// makrolardan farklı ölçekte olduğu için AYRI bir alt grafikte gösteriliyor,
// Lif hiç yoktu, renkler paylaşımlı NUTRIENT_SERIES_VAR yerine bu dosyanın
// kendi bayat MACRO_COLORS sabitinden geliyordu (kutu/ölçerlerle
// çakışıyordu). Artık mobildeki AYNI çözüm: TEK grafik, sodyumun sadece
// ÇUBUK YÜKSEKLİĞİ (`SODIUM_BAR_SCALE`) küçültülüyor, üstündeki etiket YİNE
// DE gerçek mg değerini gösteriyor (`displayValue` - `barValue`'dan AYRI
// tutuluyor, Bar'ın kendisi `barValue`'yu kullanıyor, tooltip/LabelList
// `displayValue`'yu).
const SODIUM_BAR_SCALE = 1 / 10;

const NUTRIENT_KEYS: NutrientKey[] = ["protein", "karbonhidrat", "yağ", "şeker", "lif", "sodyum"];
const NUTRIENT_UNIT: Record<NutrientKey, string> = {
  kalori: "kcal",
  protein: "g",
  karbonhidrat: "g",
  yağ: "g",
  lif: "g",
  sodyum: "mg",
  şeker: "g",
  kayıt: "",
};

function nutrientEntryValue(entry: MealEntry, key: NutrientKey): number {
  switch (key) {
    case "protein":
      return entry.protein_g;
    case "karbonhidrat":
      return entry.carbs_g;
    case "yağ":
      return entry.fat_g;
    case "şeker":
      return entry.sugar_g ?? 0;
    case "lif":
      return entry.fiber_g ?? 0;
    case "sodyum":
      return entry.sodium_mg ?? 0;
    default:
      return 0;
  }
}

function ValueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { fullLabel: string; displayValue: number; unit: string } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { fullLabel, displayValue, unit } = payload[0].payload;
  return <ChartTooltipShell label={fullLabel} value={`${displayValue.toFixed(0)}${unit}`} />;
}

export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
  sugarG,
  fiberG,
  sodiumMg,
  todayEntries,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
  /** Bugüne ait öğün kayıtları (parent'ta log_date'e göre önceden
   * filtrelenmiş) - tıklama-detayı panelinin "hangi yiyecekten ne kadar"
   * dökümünü buradan hesaplıyoruz. */
  todayEntries: MealEntry[];
}) {
  const t = useT();
  const [selectedKey, setSelectedKey] = useState<NutrientKey | null>(null);

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return <p className="text-sm text-zinc-500">{t("Bugün için henüz öğün kaydı yok.", "No meal logged today yet.")}</p>;
  }

  const FULL_LABEL: Record<NutrientKey, string> = {
    kalori: t("Kalori", "Calories"),
    protein: t("Protein", "Protein"),
    karbonhidrat: t("Karbonhidrat", "Carbs"),
    yağ: t("Yağ", "Fat"),
    lif: t("Lif", "Fiber"),
    sodyum: t("Sodyum", "Sodium"),
    şeker: t("Şeker", "Sugar"),
    kayıt: t("Kayıt", "Entries"),
  };
  // Alt eksen etiketi dar çubuklara sığsın diye Karbonhidrat KISALTILMIŞ
  // ("Karb.") - diğerleri zaten tek kelime.
  const AXIS_LABEL: Record<NutrientKey, string> = { ...FULL_LABEL, karbonhidrat: t("Karb.", "Carb.") };
  const TOTAL: Record<NutrientKey, number> = {
    kalori: 0,
    protein: proteinG,
    karbonhidrat: carbsG,
    yağ: fatG,
    lif: fiberG,
    sodyum: sodiumMg,
    şeker: sugarG,
    kayıt: 0,
  };

  const data = NUTRIENT_KEYS.map((key) => {
    const displayValue = TOTAL[key];
    const barValue = key === "sodyum" ? displayValue * SODIUM_BAR_SCALE : displayValue;
    return {
      key,
      label: AXIS_LABEL[key],
      fullLabel: FULL_LABEL[key],
      barValue,
      displayValue,
      unit: NUTRIENT_UNIT[key],
    };
  });

  // Seçili besin değerine BUGÜN hangi yiyecekten ne kadar geldiği - aynı
  // yiyecek birden çok kayıtta geçtiyse toplanıyor, 0 katkı veren yiyecek
  // listeden düşüyor.
  const breakdown = selectedKey
    ? (() => {
        const byFood = new Map<string, number>();
        for (const entry of todayEntries) {
          const value = nutrientEntryValue(entry, selectedKey);
          if (value <= 0) continue;
          byFood.set(entry.food_name_snapshot, (byFood.get(entry.food_name_snapshot) ?? 0) + value);
        }
        return Array.from(byFood.entries()).sort((a, b) => b[1] - a[1]);
      })()
    : [];

  return (
    <div className="viz-root flex flex-col gap-3">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
            />
            <YAxis width={32} allowDecimals={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ValueTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
            <Bar dataKey="barValue" radius={[4, 4, 0, 0]} maxBarSize={56} animationDuration={700} animationEasing="ease-out">
              {data.map((item) => (
                <Cell
                  key={item.key}
                  fill={`var(${NUTRIENT_SERIES_VAR[item.key]})`}
                  fillOpacity={selectedKey && item.key !== selectedKey ? 0.45 : 1}
                  // mobile/components/charts/macro-distribution-chart.tsx'
                  // teki AYNI seçili-çubuk kenarlığı (workout-volume-
                  // chart'ın c.secondary'si burada da işe yaramıyor - 6 çubuk
                  // 6 seriyi de kaplıyor, boşta kalan yok - bu yüzden seri
                  // paletinden BAĞIMSIZ `--foreground` kullanılıyor, hangi
                  // çubuk seçilirse seçilsin kenarlık kendi dolgusunun
                  // üstünde her zaman görünür).
                  stroke={item.key === selectedKey ? "var(--foreground)" : "none"}
                  strokeWidth={item.key === selectedKey ? 2 : 0}
                  className="cursor-pointer"
                  onClick={() => setSelectedKey(item.key)}
                />
              ))}
              <LabelList
                position="top"
                // `dataKey`/`formatter` çifti tek bir ham değer görüyor,
                // birimi (g/mg) payload'dan alamıyor - `valueAccessor` ise
                // TÜM kaynak veri noktasına (`entry.payload`) erişiyor, bu
                // yüzden her çubuk kendi doğru biriminde etiketlenebiliyor
                // (sodyumun ÇUBUĞU küçültülmüş olsa da üstündeki yazı
                // `displayValue` - gerçek mg - üzerinden).
                valueAccessor={(entry) => {
                  const point = entry.payload as { displayValue: number; unit: string };
                  return `${point.displayValue.toFixed(0)}${point.unit}`;
                }}
                fill="var(--chart-muted)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {selectedKey ? (
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <p className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-50">
            {FULL_LABEL[selectedKey]} · {t("Bugün", "Today")}
          </p>
          {breakdown.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("Bugün bu değere katkısı olan bir kayıt yok.", "No entry contributed to this today.")}</p>
          ) : (
            <div className="space-y-1">
              {breakdown.map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-zinc-500 dark:text-zinc-400">{name}</span>
                  <span className="shrink-0 font-medium text-zinc-900 dark:text-zinc-50">
                    {amount.toFixed(0)}
                    {NUTRIENT_UNIT[selectedKey]}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-1.5 text-xs">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{t("Toplam", "Total")}</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-50">
              {TOTAL[selectedKey].toFixed(0)}
              {NUTRIENT_UNIT[selectedKey]}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
