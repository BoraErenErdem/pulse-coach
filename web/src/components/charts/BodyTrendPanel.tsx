"use client";

import { useState } from "react";
import type { ProgressLog } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { BodyFatChart } from "@/components/charts/BodyFatChart";
import { WaistChart } from "@/components/charts/WaistChart";
import { WeightChart } from "@/components/charts/WeightChart";

// "Vücut Trendi" - mobil progress.tsx::BodyMetricsPanel gibi tek panelde kilo/bel/yağ seçimi
// (2026-10-07). Önceden üç ayrı kart alt alta duruyordu. Verisi olmayan ölçü sekmede görünmez.

type Metric = "weight" | "waist" | "fat";

export function BodyTrendPanel({ logs }: { logs: ProgressLog[] }) {
  const t = useT();
  const available: { key: Metric; label: string }[] = [
    { key: "weight" as const, label: t("Kilo", "Weight"), has: logs.some((l) => l.weight !== null) },
    { key: "waist" as const, label: t("Bel", "Waist"), has: logs.some((l) => l.waist_cm !== null) },
    { key: "fat" as const, label: t("Yağ Oranı", "Body Fat"), has: logs.some((l) => l.body_fat_pct !== null) },
  ].filter((m) => m.has || m.key === "weight");
  const [metric, setMetric] = useState<Metric>("weight");
  const active = available.some((m) => m.key === metric) ? metric : "weight";

  return (
    <div className="flex flex-col gap-4">
      {available.length > 1 ? (
        <div role="tablist" aria-label={t("Ölçü seç", "Choose a measurement")} className="flex gap-1 rounded-full bg-[color-mix(in_srgb,var(--tone-accent)_12%,transparent)] p-1 dark:bg-white/8">
          {available.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active === m.key}
              onClick={() => setMetric(m.key)}
              className={`min-h-10 flex-1 rounded-full px-3 text-sm font-medium transition-colors ${
                active === m.key
                  ? "bg-[var(--tone-fill)] text-[var(--tone-on-fill)] shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
      {active === "weight" ? <WeightChart logs={logs} /> : active === "waist" ? <WaistChart logs={logs} /> : <BodyFatChart logs={logs} />}
    </div>
  );
}
