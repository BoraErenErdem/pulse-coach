"use client";

import Link from "next/link";
import { Check, Pencil, Target, UtensilsCrossed } from "lucide-react";
import type { DailyNutritionSummary } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { tileStyle } from "@/lib/identity";

// Beslenme sayfasının kahramanı - mobil nutrition-cards.tsx::NutritionHeroCard'ın web karşılığı
// (2026-10-07). Eski 5 ayrı kutunun ve "Günlük Hedef Karşılaştırma" kartının yerini alıyor:
// kalori halkası + makro çubukları + lif/şeker/sodyum hapları tek bakışta. Renkler
// mobile/components/nutrition-identity.ts'ten birebir.

const NUTRIENT = {
  light: { kalori: "#8C990F", protein: "#C0392B", karbonhidrat: "#1F62C4", yag: "#7A45C2", seker: "#B8327A", lif: "#0A7780", sodyum: "#56647E" },
  dark: { kalori: "#CCD638", protein: "#FF7A5C", karbonhidrat: "#5EA4FF", yag: "#B98CFF", seker: "#FF8CC6", lif: "#3FD0D8", sodyum: "#AEB9D0" },
};
// Hedef yeşili (progress-identity.ts) ve hedefi aşınca yargısız mercan (kırmızı "hata" değil).
const GOAL_GREEN = { light: "#2E9E5B", dark: "#5EDC8B" };
const OVER = { light: "#B4461C", dark: "#FF9466" };

const RING_SIZE = 132;
const RING_STROKE = 11;

function CalorieRing({ fraction, color, track }: { fraction: number; color: string; track: string }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
      {/* İlk çizimde son değer (odaklanışta tekrar oynamaz); değer değişince akar. */}
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

function MacroRow({ label, color, value, goal, track, fmt }: { label: string; color: string; value: number; goal: number | null; track: string; fmt: (n: number) => string }) {
  const pct = goal ? Math.min(1, value / goal) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[var(--tile-text)]">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {fmt(value)}
          <span className="font-normal text-[var(--tile-subtle)]">{goal ? ` / ${fmt(goal)} g` : " g"}</span>
        </span>
      </div>
      {goal ? (
        <div className="h-2 overflow-hidden rounded-full" style={{ background: track }}>
          <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct * 100}%`, background: color }} />
        </div>
      ) : null}
    </div>
  );
}

export function NutritionHero({ summary, sodiumIncomplete }: { summary: DailyNutritionSummary; sodiumIncomplete: boolean }) {
  const t = useT();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const c = isDark ? NUTRIENT.dark : NUTRIENT.light;
  const fmt = (n: number) => Math.round(n).toLocaleString(language === "en" ? "en-US" : "tr-TR");

  const kcal = summary.total_calories_kcal;
  const goal = summary.calorie_goal;
  const ratio = goal ? kcal / goal : 0;
  // Hedef bir tavan da (kilo verme) bir taban da (kas kazanımı) olabilir: dil nötr.
  const state: "none" | "under" | "reached" | "over" = !goal ? "none" : ratio > 1.1 ? "over" : ratio >= 0.9 ? "reached" : "under";
  const green = isDark ? GOAL_GREEN.dark : GOAL_GREEN.light;
  const over = isDark ? OVER.dark : OVER.light;
  const ringColor = state === "reached" ? green : state === "over" ? over : isDark ? "#FFFFFF" : c.kalori;
  const ringTrack = isDark ? "rgba(255,255,255,0.22)" : `${c.kalori}2E`;
  const barTrack = isDark ? "rgba(0,0,0,0.22)" : "rgba(36,29,20,0.08)";

  const status =
    state === "none"
      ? t("Kalori hedefi yok", "No calorie goal")
      : state === "under"
        ? t(`${fmt(goal! - kcal)} kcal kaldı`, `${fmt(goal! - kcal)} kcal left`)
        : state === "reached"
          ? t("Hedef aralığındasın", "You're in your goal range")
          : t(`Hedefi ${fmt(kcal - goal!)} kcal aştın`, `${fmt(kcal - goal!)} kcal over goal`);

  const micro = [
    { key: "lif", label: t("Lif", "Fiber"), value: `${fmt(summary.total_fiber_g)} g`, color: c.lif },
    { key: "seker", label: t("Şeker", "Sugar"), value: `${fmt(summary.total_sugar_g)} g`, color: c.seker },
    {
      key: "sodyum",
      label: t("Sodyum", "Sodium"),
      // Katalogdaki bazı yerli besinlerde sodyum verisi yok: toplam eksik olabilir (2026-10-06).
      value: `${fmt(summary.total_sodium_mg)} mg${sodiumIncomplete ? "*" : ""}`,
      color: c.sodyum,
    },
  ];
  const hasAnyGoal = !!(goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <section className="pc-tile p-5 sm:p-6" style={tileStyle("nutritionHero")} aria-label={t("Bugün", "Today")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tile-icon)_50%,transparent)] bg-[color-mix(in_srgb,var(--tile-icon)_18%,transparent)] text-[var(--tile-icon)]">
          <UtensilsCrossed className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-[var(--tile-text)]">{t("Bugün", "Today")}</h2>
          <p className="text-[13px] text-[var(--tile-subtle)]">
            {summary.entry_count > 0
              ? t(`${summary.entry_count} kayıt`, `${summary.entry_count} entr${summary.entry_count === 1 ? "y" : "ies"}`)
              : t("Henüz kayıt yok", "Nothing logged yet")}
          </p>
        </div>
        <Link
          href="/goals"
          aria-label={t("Beslenme hedeflerini düzenle", "Edit nutrition goals")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--tile-subtle)] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Pencil className="h-[17px] w-[17px]" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        <div className="relative shrink-0">
          <CalorieRing fraction={goal ? ratio : kcal > 0 ? 1 : 0} color={ringColor} track={ringTrack} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--tile-text)]">
            <span className="text-[28px] font-medium leading-none tracking-[-0.5px] tabular-nums">{fmt(kcal)}</span>
            <span className="mt-1 text-xs text-[var(--tile-subtle)]">{goal ? `/ ${fmt(goal)} kcal` : "kcal"}</span>
          </div>
        </div>
        <div className="flex w-full flex-1 flex-col gap-3.5">
          <MacroRow label={t("Protein", "Protein")} color={c.protein} value={summary.total_protein_g} goal={summary.protein_goal_g} track={barTrack} fmt={fmt} />
          <MacroRow label={t("Karb.", "Carbs")} color={c.karbonhidrat} value={summary.total_carbs_g} goal={summary.carbs_goal_g} track={barTrack} fmt={fmt} />
          <MacroRow label={t("Yağ", "Fat")} color={c.yag} value={summary.total_fat_g} goal={summary.fat_goal_g} track={barTrack} fmt={fmt} />
        </div>
      </div>

      <div className="mt-4">
        {state === "reached" || state === "over" ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold"
            style={{ background: `${ringColor}2E`, borderColor: `${ringColor}80`, color: isDark ? "#FFFFFF" : ringColor }}
          >
            {/* Renk dışı ipucu: hedef yeşili zeytin kimliğe yakın - ulaşıldığında ✓. */}
            {state === "reached" ? <Check className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden="true" /> : null}
            {status}
          </span>
        ) : (
          <p className="text-sm font-medium text-[var(--tile-text)]">{status}</p>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {micro.map((m) => (
          <li
            key={m.key}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-[var(--tile-text)]"
            style={
              isDark
                ? { background: "rgba(0,0,0,0.20)", borderColor: "rgba(255,255,255,0.18)" }
                : { background: `${m.color}12`, borderColor: `${m.color}40` }
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
            {m.label} <span className="font-semibold">{m.value}</span>
          </li>
        ))}
      </ul>
      {sodiumIncomplete ? (
        <p className="mt-2 text-xs text-[var(--tile-subtle)]">
          {t("* Bazı besinlerde sodyum verisi yok; gerçek değer daha yüksek olabilir.", "* Some foods have no sodium data; the actual value may be higher.")}
        </p>
      ) : null}

      {!hasAnyGoal ? (
        <Link
          href="/goals"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold"
          style={{ background: isDark ? GOAL_GREEN.dark : "#217A47", color: isDark ? "#0F3A21" : "#FFFFFF" }}
        >
          <Target className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          {t("Günlük hedef belirle", "Set a daily goal")}
        </Link>
      ) : null}
    </section>
  );
}
