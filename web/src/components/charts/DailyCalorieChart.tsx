"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { MealEntry, PreferredLanguage } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDecimal, formatInt } from "@/lib/format";
import { niceTicks, useChartWidth } from "@/components/charts/svg-charts";
import { ChartWell } from "@/components/charts/panel-parts";

// Mobil components/charts/daily-calorie-chart.tsx'in web karşılığı (2026-10-08): seçili günün
// değeri + "Hedefin %X" rozeti, günlük kalori çubukları (hedefin %110'unu aşan gün turuncu),
// kesikli hedef çizgisi (etiketi solda), tıklanan gün seçilir, altta kayıtlı günlerin ortalaması.

const HEIGHT = 190;
const GUTTER_LEFT = 38;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function locale(language: PreferredLanguage) {
  return language === "en" ? "en-US" : "tr-TR";
}

function fmtAxis(v: number, language: PreferredLanguage): string {
  return v >= 1000 ? `${formatDecimal(v / 1000, language)}k` : String(v);
}

export function DailyCalorieChart({ entries, days, goal }: { entries: MealEntry[]; days: number; goal: number | null }) {
  const t = useT();
  const { language } = useLanguage();
  const fmt = (n: number) => formatInt(n, language);
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);

  const series = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(e.log_date, (totals.get(e.log_date) ?? 0) + e.calories_kcal);
    const out: { key: string; value: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const key = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
      out.push({ key, value: totals.get(key) ?? 0 });
    }
    return out;
  }, [entries, days]);

  const loggedDays = series.filter((d) => d.value > 0);
  if (loggedDays.length === 0) {
    return (
      <p className="text-[13px] leading-[19px] text-zinc-500 dark:text-white/80">
        {t(
          "Bu aralıkta öğün kaydı yok. Öğün kaydettikçe günlük kalori trendin burada görünecek.",
          "No meals logged in this range. Your daily calorie trend will show up here as you log meals."
        )}
      </p>
    );
  }

  const average = loggedDays.reduce((a, d) => a + d.value, 0) / loggedDays.length;
  const maxValue = Math.max(0, ...series.map((d) => d.value), goal ?? 0);
  const yTarget = Math.max(maxValue * 1.08, 100);
  const ticks = niceTicks(0, yTarget, 4);
  if (ticks.length > 1 && ticks[ticks.length - 1] < yTarget) ticks.push(ticks[ticks.length - 1] + (ticks[1] - ticks[0]));
  const yMax = ticks[ticks.length - 1];

  let lastLogged = series.length - 1;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].value > 0) {
      lastLogged = i;
      break;
    }
  }
  const active = selected !== null && selected < series.length ? selected : lastLogged;
  const activeDay = series[active];
  const activeLabel =
    activeDay.key === localDateKey()
      ? t("Bugün", "Today")
      : dayDate(activeDay.key).toLocaleDateString(locale(language), { day: "numeric", month: "long", weekday: "short" });
  const activePct = goal ? Math.round((activeDay.value / goal) * 100) : null;
  const activeOver = goal ? activeDay.value > goal * 1.1 : false;
  const activeReached = goal ? !activeOver && activeDay.value >= goal * 0.9 : false;
  const chipColor = activeOver ? "var(--nu-over)" : activeReached ? "var(--goal-green)" : "var(--nu-kalori)";

  const left = GUTTER_LEFT;
  const right = width - PAD_RIGHT;
  const bottom = HEIGHT - PAD_BOTTOM;
  const sy = (v: number) => bottom - (v / yMax) * (bottom - PAD_TOP);
  const slot = series.length > 0 ? (right - left) / series.length : 0;
  const barW = Math.max(3, Math.min(22, slot * 0.64));
  const cx = (i: number) => left + slot * i + slot / 2;
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  const xLabel = (i: number) => {
    const d = dayDate(series[i].key);
    return days <= 7 ? d.toLocaleDateString(locale(language), { weekday: "short" }).replace(".", "") : String(d.getDate());
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-white/80">{activeLabel}</p>
          <p className="text-[26px] font-medium tracking-[-0.5px] text-zinc-900 dark:text-white">
            {fmt(activeDay.value)} <span className="text-sm text-zinc-500 dark:text-white/80">kcal</span>
          </p>
        </div>
        {activePct !== null ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-[11px] py-[5px] text-[13px] font-semibold dark:text-white"
            style={{
              background: `color-mix(in srgb, ${chipColor} 18%, transparent)`,
              borderColor: `color-mix(in srgb, ${chipColor} 50%, transparent)`,
              color: activeOver || activeReached ? chipColor : "var(--nu-kalori-text)",
            }}
          >
            {activeReached ? <Check className="h-[13px] w-[13px]" strokeWidth={2.8} aria-hidden="true" /> : null}
            <span className="dark:text-white">{t(`Hedefin %${activePct}`, `${activePct}% of goal`)}</span>
          </span>
        ) : null}
      </div>

      <ChartWell>
        <div ref={ref} className="relative" style={{ height: HEIGHT }}>
          {width > 0 ? (
            <>
              <svg key={`${days}-${width}`} width={width} height={HEIGHT} aria-hidden="true" className="pointer-events-none block">
                {ticks.map((v) => (
                  <line key={`g${v}`} x1={left} x2={right} y1={sy(v)} y2={sy(v)} style={{ stroke: "var(--pc-chart-grid)" }} strokeDasharray={v === 0 ? undefined : "3 5"} />
                ))}
                {ticks.map((v) => (
                  <text key={`y${v}`} x={left - 7} y={sy(v) + 3.5} fontSize={11} textAnchor="end" style={{ fill: "var(--pc-chart-axis)" }}>
                    {fmtAxis(v, language)}
                  </text>
                ))}
                {series.map((d, i) => {
                  const h = d.value > 0 ? Math.max(bottom - sy(d.value), 3) : 2.5;
                  const over = goal ? d.value > goal * 1.1 : false;
                  return (
                    <rect
                      key={d.key}
                      className="pc-bar"
                      x={cx(i) - barW / 2}
                      y={bottom - h}
                      width={barW}
                      height={h}
                      rx={Math.min(5, barW / 2.5)}
                      style={{ fill: d.value > 0 ? (over ? "var(--nu-over)" : "var(--nu-kalori)") : "var(--pc-chart-grid)", animationDelay: `${i * 25}ms` }}
                      opacity={d.value > 0 ? (i === active ? 1 : 0.62) : 1}
                    />
                  );
                })}
                {goal ? (
                  <>
                    <line x1={left} x2={right} y1={sy(goal)} y2={sy(goal)} style={{ stroke: "var(--goal-green)" }} strokeWidth={1.4} strokeDasharray="6 4" />
                    <text x={left + 4} y={sy(goal) - 5} fontSize={11} fontWeight={600} style={{ fill: "var(--goal-green)" }}>
                      {t(`Hedef ${fmt(goal)}`, `Goal ${fmt(goal)}`)}
                    </text>
                  </>
                ) : null}
                {series.map((_, i) =>
                  i % labelEvery === (series.length - 1) % labelEvery ? (
                    <text
                      key={`x${i}`}
                      x={cx(i)}
                      y={HEIGHT - 7}
                      fontSize={11}
                      fontWeight={i === active ? 700 : 400}
                      textAnchor="middle"
                      style={{ fill: i === active ? "var(--foreground)" : "var(--pc-chart-axis)" }}
                    >
                      {xLabel(i)}
                    </text>
                  ) : null
                )}
              </svg>
              {/* Her gün için şeffaf bir düğme: ekran okuyucu ve klavye her günü ayrı okur. */}
              <div className="absolute inset-y-0 flex" style={{ left, right: PAD_RIGHT }}>
                {series.map((d, i) => (
                  <button
                    key={d.key}
                    type="button"
                    className="flex-1 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--tone-accent)]"
                    onClick={() => setSelected(i === selected ? null : i)}
                    aria-label={`${dayDate(d.key).toLocaleDateString(locale(language), { day: "numeric", month: "long" })}: ${fmt(d.value)} kcal`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </ChartWell>

      <p className="text-xs text-zinc-500 dark:text-white/80">
        {t(
          `Kayıtlı ${loggedDays.length} günün ortalaması: ${fmt(average)} kcal`,
          `Average of ${loggedDays.length} logged day${loggedDays.length === 1 ? "" : "s"}: ${fmt(average)} kcal`
        )}
      </p>
    </div>
  );
}
