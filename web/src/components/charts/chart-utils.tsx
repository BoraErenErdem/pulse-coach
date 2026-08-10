"use client";

import type { ReactNode } from "react";
import type { PreferredLanguage } from "@/lib/api";

// Weight/Calorie/Volume/Mood/TrendCorrelation/Macro/WorkoutType
// grafiklerinin HER BİRİ kendi tooltip'inde birebir aynı dış çerçeveyi
// (yuvarlak kart + gölge + başlık/değer satırı) yeniden tanımlıyordu
// (2026-08-10 mimari borç raporu, bulgu #9) - tek bir paylaşımlı kabuk
// bileşeniyle birleştirildi, her grafiğin kendi tooltip'i sadece
// `label`/`value` içeriğini hesaplar.
export function ChartTooltipShell({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

/** Recharts X ekseni tick'i / tooltip başlığı için gün.ay biçimi -
 * WeightChart/CalorieTrendChart/WorkoutVolumeChart/MoodTrendChart/
 * TrendCorrelationChart'ta birebir aynı kopyayla vardı. */
export function formatChartDate(isoDate: string, language: PreferredLanguage): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit" });
}

/** Ruh hali 1-5 ölçeğinin dile göre etiketleri - MoodTrendChart ve
 * TrendCorrelationChart'ta birebir aynı kopyayla vardı. */
export function moodScaleLabels(t: (tr: string, en: string) => string): Record<number, string> {
  return {
    1: t("Zor", "Tough"),
    2: t("Düşük", "Low"),
    3: t("Nötr", "Neutral"),
    4: t("İyi", "Good"),
    5: t("Harika", "Great"),
  };
}
