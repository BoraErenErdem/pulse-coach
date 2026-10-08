"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Target } from "lucide-react";
import type { ProgressLog, WeeklyTrendPoint } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { formatPercent } from "@/lib/format";
import { moodScaleLabels } from "@/components/charts/chart-utils";
import { niceTicks, TrendLineChart, WeeklyBarsChart, type ChartPoint } from "@/components/charts/svg-charts";
import {
  AddGoalButton,
  Caption,
  ChartWell,
  Hero,
  PillToggle,
  SegmentedTabs,
  StatBoxes,
  SubHeader,
  TrendChip,
} from "@/components/charts/panel-parts";

// Mobil components/progress-charts.tsx'in web karşılığı (2026-10-08): "Vücut Trendi" (Kilo |
// Bel | Yağ sekmeli, tarih ölçekli çizgi, hedef çizgisi, 30/90 gün, tıklayarak seçim, gelişim
// rozetleri, Min/Ort/Maks) ve "Aylar Arası" (ruh hali çizgisi + antrenman günü ÇUBUKLARI).
// Hesaplar mobildekiyle birebir.

const DAY = 86_400_000;
const dateMs = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

function fmt(n: number, decimals = 1): string {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

type MetricKey = "weight" | "waist" | "fat";

interface MetricDef {
  key: MetricKey;
  get: (log: ProgressLog) => number | null;
  unit: string;
  relative: boolean;
  minPad: number;
}

const METRICS: Record<MetricKey, MetricDef> = {
  weight: { key: "weight", get: (l) => l.weight, unit: "kg", relative: true, minPad: 0.5 },
  waist: { key: "waist", get: (l) => l.waist_cm, unit: "cm", relative: true, minPad: 1 },
  fat: { key: "fat", get: (l) => l.body_fat_pct, unit: "%", relative: false, minPad: 0.5 },
};

const SERIES_COLOR: Record<MetricKey, string> = {
  weight: "var(--id-weight)",
  waist: "var(--id-waist)",
  fat: "var(--id-fat)",
};

function seriesOf(logs: ProgressLog[], def: MetricDef): ChartPoint[] {
  const byDate = new Map<string, { id: number; value: number }>();
  for (const log of logs) {
    const v = def.get(log);
    if (v === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) byDate.set(log.log_date, { id: log.id, value: v });
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value }]) => ({ t: dateMs(date), value }));
}

export function BodyMetricsPanel({
  logs,
  goals,
  onEditGoal,
}: {
  logs: ProgressLog[];
  goals: { weight?: number | null; waist?: number | null; fat?: number | null };
  onEditGoal?: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [rangeDays, setRangeDays] = useState<30 | 90>(90);
  const [selected, setSelected] = useState<number | null>(null);

  const derived = useMemo(() => {
    const locale = language === "en" ? "en-US" : "tr-TR";
    const dayFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
    const fullFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

    const labels: Record<MetricKey, string> = { weight: t("Kilo", "Weight"), waist: t("Bel", "Waist"), fat: t("Yağ", "Fat") };
    const allSeries: Record<MetricKey, ChartPoint[]> = {
      weight: seriesOf(logs, METRICS.weight),
      waist: seriesOf(logs, METRICS.waist),
      fat: seriesOf(logs, METRICS.fat),
    };
    const available = (Object.keys(METRICS) as MetricKey[]).filter((k) => allSeries[k].length > 0);
    const tabKeys: MetricKey[] = available.length > 0 ? available : ["weight"];
    const activeKey = tabKeys.includes(metric) ? metric : tabKeys[0];
    const def = METRICS[activeKey];
    const color = SERIES_COLOR[activeKey];

    const today = new Date();
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const rangeStart = todayMs - rangeDays * DAY;
    const visible = allSeries[activeKey].filter((pt) => pt.t >= rangeStart);
    const goal = goals[activeKey] ?? null;
    const tabs = tabKeys.map((k) => ({ key: k, label: labels[k], color: SERIES_COLOR[k] }));

    if (visible.length === 0) {
      return { empty: true as const, allSeries, activeKey, tabs };
    }

    const first = visible[0];
    const last = visible[visible.length - 1];
    const values = visible.map((pt) => pt.value as number);
    const sel = selected !== null && visible[selected] ? visible[selected] : null;
    const shown = (sel ?? last).value as number;

    const lo = Math.min(...values, ...(goal ? [goal] : []));
    const hi = Math.max(...values, ...(goal ? [goal] : []));
    const pad = Math.max((hi - lo) * 0.18, def.minPad);
    const domainY: [number, number] = [lo - pad, hi + pad];
    const yTicks = niceTicks(domainY[0], domainY[1], 4);
    const x1 = Math.max(todayMs, last.t);
    let x0 = Math.max(rangeStart, first.t);
    if (x1 - x0 < 7 * DAY) x0 = x1 - 7 * DAY;
    const xTicks = [0, 1, 2, 3].map((i) => {
      const tt = x0 + ((x1 - x0) * i) / 3;
      return { t: tt, label: dayFmt(tt) };
    });

    const delta = Math.round((shown - (first.value as number)) * 10) / 10;
    const pct = def.relative && first.value ? (delta / (first.value as number)) * 100 : null;
    const direction: "up" | "down" | "flat" = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    const unitLabel = def.key === "fat" ? t("puan", "pts") : def.unit;
    const trendText =
      delta === 0
        ? t("Değişmedi", "Unchanged")
        : `${sign}${fmt(Math.abs(delta))} ${unitLabel}${pct !== null ? ` · ${formatPercent(fmt(Math.abs(pct)), language)}` : ""}`;

    const unitOf = (v: number) => (def.unit === "%" ? formatPercent(fmt(v), language) : `${fmt(v)} ${def.unit}`);
    const remaining = goal !== null ? Math.round(((last.value as number) - goal) * 10) / 10 : null;
    const goalText =
      remaining === null
        ? null
        : Math.abs(remaining) < 0.1
          ? t("Hedefte 🎉", "On goal 🎉")
          : t(`Hedefe ${fmt(Math.abs(remaining))} ${unitLabel}`, `${fmt(Math.abs(remaining))} ${unitLabel} to goal`);

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const stat = (v: number) => (def.unit === "%" ? `${fmt(v)}%` : `${fmt(v)} ${def.unit}`);
    const caption = sel
      ? fullFmt(sel.t)
      : `${dayFmt(first.t)} – ${dayFmt(last.t)} · ${t(`${visible.length} kayıt`, `${visible.length} entries`)}`;

    return {
      empty: false as const,
      tabs, activeKey, def, color, visible, goal, x0, x1, domainY, yTicks, xTicks,
      shown, direction, trendText, unitOf, goalText, avg, stat, caption, values, sel,
    };
  }, [logs, goals, metric, rangeDays, selected, language, t]);

  const rangeToggle = (
    <PillToggle
      label={t("Zaman aralığı", "Time range")}
      options={[
        { key: 30 as const, label: t("30 gün", "30 days") },
        { key: 90 as const, label: t("90 gün", "90 days") },
      ]}
      active={rangeDays}
      onChange={(d) => {
        setRangeDays(d);
        setSelected(null);
      }}
    />
  );
  const switchMetric = (key: MetricKey) => {
    setMetric(key);
    setSelected(null);
  };

  if (derived.empty) {
    return (
      <div className="flex flex-col gap-3.5">
        <SegmentedTabs label={t("Ölçü seç", "Choose a measurement")} tabs={derived.tabs} active={derived.activeKey} onChange={switchMetric} />
        <div className="flex items-center justify-between gap-2.5">
          <Caption>
            {derived.allSeries[derived.activeKey].length === 0
              ? t("Henüz bu ölçüm için kayıt yok. Kaydettikçe burada trend olarak görünecek.", "No entries for this measurement yet. It will show up here as you log it.")
              : t("Bu aralıkta kayıt yok.", "No entries in this range.")}
          </Caption>
          {derived.allSeries[derived.activeKey].length === 0 ? null : rangeToggle}
        </div>
        {goals.weight == null && onEditGoal ? <AddGoalButton label={t("Hedef belirle", "Set a goal")} onClick={onEditGoal} /> : null}
      </div>
    );
  }

  const { tabs, activeKey, def, color, visible, goal, x0, x1, domainY, yTicks, xTicks, shown, direction, trendText, unitOf, goalText, avg, stat, caption, values, sel } =
    derived;

  return (
    <div className="flex flex-col gap-3.5">
      <SegmentedTabs label={t("Ölçü seç", "Choose a measurement")} tabs={tabs} active={activeKey} onChange={switchMetric} />
      <div className="flex flex-col gap-1.5">
        <Hero
          value={fmt(shown)}
          unit={def.unit}
          right={
            <>
              {visible.length > 1 ? <TrendChip direction={direction} text={trendText} color={color} /> : null}
              {goalText && !sel ? (
                <TrendChip
                  text={goalText}
                  color="var(--goal-green)"
                  dashed
                  icon={<Target className="h-3.5 w-3.5 text-[var(--goal-green)]" strokeWidth={2.2} aria-hidden="true" />}
                />
              ) : null}
            </>
          }
        />
        <div className="flex items-center justify-between gap-2.5">
          <Caption>{caption}</Caption>
          {rangeToggle}
        </div>
      </div>
      <ChartWell>
        <TrendLineChart
          ariaLabel={`${tabs.find((tb) => tb.key === activeKey)?.label ?? ""}: ${caption}`}
          points={visible}
          domainX={[x0, x1]}
          domainY={domainY}
          yTicks={yTicks}
          formatY={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
          xTicks={xTicks}
          color={color}
          goal={goal ? { value: goal, label: t(`Hedef ${unitOf(goal)}`, `Goal ${unitOf(goal)}`) } : undefined}
          selectedIndex={selected !== null && visible[selected] ? selected : null}
          onSelect={setSelected}
        />
      </ChartWell>
      <StatBoxes
        items={[
          { label: t("En düşük", "Lowest"), value: stat(Math.min(...values)) },
          { label: t("Ortalama", "Average"), value: stat(avg) },
          { label: t("En yüksek", "Highest"), value: stat(Math.max(...values)) },
        ]}
      />
      <p className="-mt-0.5 text-center text-xs text-zinc-500 dark:text-white/80">
        {t("Bir noktaya tıklayarak o günün değerini görebilirsin.", "Click a point to see that day's value.")}
      </p>
      {goal === null && onEditGoal ? <AddGoalButton label={t("Hedef belirle", "Set a goal")} onClick={onEditGoal} /> : null}
    </div>
  );
}

function avgOf(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function recentVsPrior(values: (number | null)[], n = 4): { recent: number; prior: number } | null {
  const filled = (arr: (number | null)[]) => arr.filter((v): v is number => v !== null);
  const recent = avgOf(filled(values.slice(-n)));
  const prior = avgOf(filled(values.slice(-2 * n, -n)));
  return recent !== null && prior !== null ? { recent, prior } : null;
}

/** Aylar Arası: masaüstünde ruh hali ve antrenman yan yana (`lg:grid-cols-2`), telefonda üst üste. */
export function MonthlyTrendPanel({ points, note }: { points: WeeklyTrendPoint[]; note: ReactNode }) {
  const t = useT();
  const { language } = useLanguage();
  const [moodSel, setMoodSel] = useState<number | null>(null);
  const [workSel, setWorkSel] = useState<number | null>(null);
  const moodLabels = moodScaleLabels(t);
  const hasAnyData = points.some((pt) => pt.avg_mood_score !== null || pt.workout_days > 0);

  const derived = useMemo(() => {
    const locale = language === "en" ? "en-US" : "tr-TR";
    const dayFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
    const weeks = points.map((pt) => dateMs(pt.week_start));
    const x0 = weeks[0];
    const x1 = weeks[weeks.length - 1];
    const xTicks = [0, 1, 2, 3].map((i) => {
      const tt = x0 + ((x1 - x0) * i) / 3;
      return { t: tt, label: dayFmt(tt) };
    });
    const moodPts: ChartPoint[] = points.map((pt, i) => ({ t: weeks[i], value: pt.avg_mood_score }));
    const moodFilled = points.map((pt) => pt.avg_mood_score).filter((v): v is number => v !== null);
    let latestMoodIdx = -1;
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (points[i].avg_mood_score !== null) {
        latestMoodIdx = i;
        break;
      }
    }
    const shownMoodIdx = moodSel !== null && points[moodSel]?.avg_mood_score != null ? moodSel : latestMoodIdx;
    const shownMood = shownMoodIdx >= 0 ? (points[shownMoodIdx].avg_mood_score as number) : null;
    const moodTrend = recentVsPrior(points.map((pt) => pt.avg_mood_score));
    const moodDelta = moodTrend ? Math.round((moodTrend.recent - moodTrend.prior) * 10) / 10 : null;
    const moodAvg = avgOf(moodFilled);
    const workDays = points.map((pt) => pt.workout_days);
    const shownWorkIdx = workSel ?? workDays.length - 1;
    const workTrend = recentVsPrior(workDays);
    const workDelta = workTrend ? Math.round((workTrend.recent - workTrend.prior) * 10) / 10 : null;
    const workPct = workTrend && workTrend.prior > 0 ? ((workTrend.recent - workTrend.prior) / workTrend.prior) * 100 : null;
    const workAvg = avgOf(workDays) ?? 0;
    const activeWeeks = workDays.filter((d) => d > 0).length;
    const barLabels = weeks.map((ms, i) => (i % 3 === 0 ? dayFmt(ms) : ""));
    return { weeks, x0, x1, xTicks, moodPts, moodFilled, shownMoodIdx, shownMood, moodDelta, moodAvg, workDays, shownWorkIdx, workDelta, workPct, workAvg, activeWeeks, barLabels, dayFmt };
  }, [points, moodSel, workSel, language]);

  if (!hasAnyData) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-white/80">
        {t(
          "Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.",
          "Not enough data yet. The weekly trend will show up here as you log mood and workouts."
        )}
      </p>
    );
  }

  const { weeks, x0, x1, xTicks, moodPts, moodFilled, shownMoodIdx, shownMood, moodDelta, moodAvg, workDays, shownWorkIdx, workDelta, workPct, workAvg, activeWeeks, barLabels, dayFmt } =
    derived;
  const dirOf = (d: number | null): "up" | "down" | "flat" => (d === null || d === 0 ? "flat" : d > 0 ? "up" : "down");
  const signOf = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "");

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="grid gap-[22px] lg:grid-cols-2 lg:gap-8">
        <section className="flex min-w-0 flex-col gap-3.5">
          <SubHeader color="var(--id-mood)" title={t("Haftalık Ortalama Ruh Hali", "Weekly Average Mood")} />
          <div className="flex flex-col gap-1.5">
            <Hero
              value={shownMood !== null ? shownMood.toFixed(1) : "—"}
              unit={shownMood !== null ? `· ${moodLabels[Math.min(5, Math.max(1, Math.round(shownMood)))]}` : ""}
              right={
                moodDelta !== null ? (
                  <TrendChip
                    direction={dirOf(moodDelta)}
                    color="var(--id-mood)"
                    text={moodDelta === 0 ? t("Sabit · son 4 hafta", "Steady · last 4 wks") : `${signOf(moodDelta)}${fmt(Math.abs(moodDelta))} · ${t("son 4 hafta", "last 4 wks")}`}
                  />
                ) : undefined
              }
            />
            <Caption>
              {moodSel !== null && shownMoodIdx === moodSel
                ? t(`${dayFmt(weeks[moodSel])} haftası`, `Week of ${dayFmt(weeks[moodSel])}`)
                : t("Son kayıtlı hafta", "Latest logged week")}
            </Caption>
          </div>
          <ChartWell>
            <TrendLineChart
              ariaLabel={t("Haftalık ortalama ruh hali grafiği", "Weekly average mood chart")}
              points={moodPts}
              domainX={[x0, x1]}
              domainY={[1, 5]}
              yTicks={[1, 2, 3, 4, 5]}
              formatY={(v) => moodLabels[v] ?? String(v)}
              xTicks={xTicks}
              color="var(--id-mood)"
              height={170}
              gutterLeft={46}
              selectedIndex={moodSel}
              onSelect={setMoodSel}
            />
          </ChartWell>
          <StatBoxes
            items={[
              { label: t("Ortalama", "Average"), value: moodAvg !== null ? moodAvg.toFixed(1) : "—" },
              { label: t("En yüksek", "Highest"), value: moodFilled.length ? Math.max(...moodFilled).toFixed(1) : "—" },
              { label: t("En düşük", "Lowest"), value: moodFilled.length ? Math.min(...moodFilled).toFixed(1) : "—" },
            ]}
          />
        </section>

        <div className="h-px bg-[var(--border-subtle)] lg:hidden" />

        <section className="flex min-w-0 flex-col gap-3.5">
          <SubHeader color="var(--id-workout)" title={t("Haftalık Antrenman Günü", "Weekly Workout Days")} />
          <div className="flex flex-col gap-1.5">
            <Hero
              value={String(workDays[shownWorkIdx] ?? 0)}
              unit={t("gün", "days")}
              right={
                workDelta !== null ? (
                  <TrendChip
                    direction={dirOf(workDelta)}
                    color="var(--id-workout)"
                    text={
                      workDelta === 0
                        ? t("Sabit · son 4 hafta", "Steady · last 4 wks")
                        : `${signOf(workDelta)}${fmt(Math.abs(workDelta))} ${t("gün", "d")}${workPct !== null ? ` · ${formatPercent(fmt(Math.abs(workPct), 0), language)}` : ""}`
                    }
                  />
                ) : undefined
              }
            />
            <Caption>{workSel !== null ? t(`${dayFmt(weeks[workSel])} haftası`, `Week of ${dayFmt(weeks[workSel])}`) : t("Bu hafta", "This week")}</Caption>
          </div>
          <ChartWell>
            <WeeklyBarsChart
              ariaLabel={t("Haftalık antrenman günü grafiği", "Weekly workout days chart")}
              values={workDays}
              xLabels={barLabels}
              domainY={[0, 7]}
              yTicks={[0, 2, 4, 6]}
              color="var(--id-workout)"
              selectedIndex={workSel}
              onSelect={setWorkSel}
            />
          </ChartWell>
          <StatBoxes
            items={[
              { label: t("Ortalama", "Average"), value: `${fmt(workAvg)} ${t("gün/hf", "d/wk")}` },
              { label: t("En çok", "Most"), value: `${Math.max(...workDays)} ${t("gün", "days")}` },
              { label: t("Aktif hafta", "Active weeks"), value: `${activeWeeks}/${workDays.length}` },
            ]}
          />
        </section>
      </div>
      {note}
    </div>
  );
}
