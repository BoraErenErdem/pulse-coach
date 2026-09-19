import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Pencil, Plus, Target, TrendingDown, TrendingUp } from "lucide-react-native";
import type { ProgressLog, WeeklyTrendPoint } from "@/lib/api";
import { useThemeColors } from "@/components/ui";
import { moodScaleLabels } from "@/components/charts/chart-utils";
import {
  niceTicks,
  TrendLineChart,
  useProgressChartColors,
  WeeklyBarsChart,
  type ChartPoint,
} from "@/components/charts/svg-charts";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { tapLight } from "@/lib/haptics";
import { ConfettiBurst } from "@/components/progress-motion";

// İlerleme sekmesi grafik panelleri (2026-09-19, ilerleme tasarımı 3. tur):
// - "Vücut Trendi": Kilo | Bel | Yağ TEK panelde sekmeli (önceden 3 ayrı uzun
//   panel), gerçek tarih ölçekli sade çizgi, kilo için hedef çizgisi, 30/90
//   gün aralığı, dokunarak nokta seçme (başlık eşzamanlı güncellenir),
//   zenginleştirilmiş "gelişim" rozetleri + Min/Ort/Maks kutuları.
// - "Aylar Arası": ruh hali çizgisi + antrenman günü ÇUBUKLARI (0-7 tam sayı
//   sayımı çizgiyle gösterilmemeli), aynı başlık/rozet/kutu dili.
// Kart kabuğu (`ProgressSectionCard`) çağıran tarafta - bu dosya içeriği verir.

const DAY = 86_400_000;
const dateMs = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

function fmt(n: number, decimals = 1): string {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

export type MetricKey = "weight" | "waist" | "fat";

interface MetricDef {
  key: MetricKey;
  get: (log: ProgressLog) => number | null;
  unit: string;
  // Kilo/bel için göreli (%) değişim anlamlı; yağ oranı zaten yüzde - puan farkı.
  relative: boolean;
  minPad: number;
}

const METRICS: Record<MetricKey, MetricDef> = {
  weight: { key: "weight", get: (l) => l.weight, unit: "kg", relative: true, minPad: 0.5 },
  waist: { key: "waist", get: (l) => l.waist_cm, unit: "cm", relative: true, minPad: 1 },
  fat: { key: "fat", get: (l) => l.body_fat_pct, unit: "%", relative: false, minPad: 0.5 },
};

/** Aynı gün birden çok kayıt varsa sonuncusu (en büyük id). */
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

/** Bir ölçüm için hedefe ilerleme durumu. Başlangıç = seride (son 90 gün
 * penceresinin) ilk değeri, güncel = son değer. İlerleme yüzdesi başlangıçtan
 * hedefe doğru (hedef başlangıcın hangi tarafında olursa olsun); ters yönde
 * gidilmişse 0'a sabitlenir. Hedefe "ulaşıldı": güncel hedefe 0.1 birimden
 * yakın YA DA yüzde 100. Kilo hedefi kartı (progress.tsx) ile aynı mantık -
 * bel/yağ hedefleri ve kutlamalar bu tek yerden hesaplanıyor. */
export function metricGoalStatus(
  logs: ProgressLog[],
  key: MetricKey,
  goal: number | null | undefined
): { start: number; current: number; pct: number | null; reached: boolean } | null {
  if (goal == null) return null;
  const series = seriesOf(logs, METRICS[key]);
  if (series.length === 0) return null;
  const start = series[0].value as number;
  const current = series[series.length - 1].value as number;
  const total = start - goal;
  const pct =
    series.length >= 2 && Math.abs(total) >= 0.1
      ? Math.min(100, Math.max(0, ((start - current) / total) * 100))
      : null;
  const reached = Math.abs(current - goal) < 0.1 || (pct !== null && pct >= 100);
  return { start, current, pct, reached };
}

function usePanelPalette() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return {
    isDark,
    c,
    text: isDark ? "#FFFFFF" : c.text,
    muted: isDark ? "rgba(255,255,255,0.8)" : c.muted,
    boxBg: isDark ? "rgba(255,255,255,0.07)" : "rgba(245,162,107,0.10)",
    tabsBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(245,162,107,0.14)",
  };
}

// ---------------------------------------------------------------- parçalar

/** "Gelişim" rozeti (kullanıcının en sevdiği öğe): ikon + değişim + yüzde.
 * BİLEREK nötr yargı: yön oku var, kırmızı/yeşil YOK - kilo almak da vermek
 * de hedef olabilir. Seri renginin tonunda cam gibi bir hap. */
function TrendChip({
  direction,
  text,
  color,
  icon,
  dashed,
}: {
  direction?: "up" | "down" | "flat";
  text: string;
  color: string;
  icon?: ReactNode;
  dashed?: boolean;
}) {
  const p = usePanelPalette();
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: `${color}${p.isDark ? "2E" : "22"}`,
          borderColor: `${color}${p.isDark ? "70" : "66"}`,
          borderStyle: dashed ? "dashed" : "solid",
        },
      ]}
    >
      {icon ?? <Icon size={14} color={color} strokeWidth={2.4} />}
      <Text style={[styles.chipText, { color: p.text }]}>{text}</Text>
    </View>
  );
}

function StatBoxes({ items }: { items: { label: string; value: string }[] }) {
  const p = usePanelPalette();
  return (
    <View style={styles.statRow}>
      {items.map((item) => (
        <View key={item.label} style={[styles.statBox, { backgroundColor: p.boxBg }]}>
          <Text style={[styles.statLabel, { color: p.muted }]} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={[styles.statValue, { color: p.text }]} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SegmentedTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: K; label: string; color: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  const p = usePanelPalette();
  return (
    <View style={[styles.tabs, { backgroundColor: p.tabsBg }]}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              tapLight();
              onChange(tab.key);
            }}
            style={[
              styles.tab,
              on && { backgroundColor: `${tab.color}${p.isDark ? "38" : "2A"}`, borderColor: `${tab.color}${p.isDark ? "80" : "70"}` },
            ]}
          >
            <View style={[styles.tabDot, { backgroundColor: tab.color, opacity: on ? 1 : 0.55 }]} />
            <Text style={[styles.tabText, { color: on ? p.text : p.muted, fontFamily: on ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PillToggle<K extends string | number>({
  options,
  active,
  onChange,
}: {
  options: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  const p = usePanelPalette();
  return (
    <View style={[styles.pillToggle, { backgroundColor: p.tabsBg }]}>
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => {
              tapLight();
              onChange(o.key);
            }}
            style={[styles.pill, on && { backgroundColor: p.isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.95)" }]}
            hitSlop={4}
          >
            <Text style={[styles.pillText, { color: on ? (p.isDark ? "#FFFFFF" : p.c.text) : p.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Grafiği saran "kuyu": koyu modda panel turuncu-kahve, turuncu kilo çizgisi
 * zeminde kayboluyordu (kullanıcı bulgusu) - grafik koyu yarı saydam bir
 * kuyuda çizilince HER renk kimliği (turuncu dahil) net görünüyor. Açık modda
 * çok hafif şeftali zemin. */
function ChartWell({ children }: { children: ReactNode }) {
  const p = usePanelPalette();
  return (
    <View style={[styles.well, { backgroundColor: p.isDark ? "rgba(0,0,0,0.30)" : "rgba(245,162,107,0.08)" }]}>
      {children}
    </View>
  );
}

function Hero({ value, unit, right }: { value: string; unit: string; right?: ReactNode }) {
  const p = usePanelPalette();
  return (
    <View style={styles.heroRow}>
      <View style={styles.valueRow}>
        <Text style={[styles.heroValue, { color: p.text }]}>{value}</Text>
        <Text style={[styles.heroUnit, { color: p.muted }]}>{unit}</Text>
      </View>
      {right ? <View style={styles.chipCol}>{right}</View> : null}
    </View>
  );
}

// ------------------------------------------------------------ Vücut Trendi

export function BodyMetricsPanel({
  logs,
  goals,
  onEditGoal,
  celebrateKeys,
  animateKey = 0,
}: {
  logs: ProgressLog[];
  // Metrik başına opsiyonel hedefler (profil): grafikte yeşil hedef çizgisi,
  // "Hedefe X" rozeti ve (bel/yağ için) ilerleme şeridi.
  goals: { weight?: number | null; waist?: number | null; fat?: number | null };
  onEditGoal?: () => void;
  celebrateKeys?: { waist?: number; fat?: number };
  animateKey?: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const p = usePanelPalette();
  const colors = useProgressChartColors();
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [rangeDays, setRangeDays] = useState<30 | 90>(90);
  const [selected, setSelected] = useState<number | null>(null);

  const locale = language === "en" ? "en-US" : "tr-TR";
  const dayFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const fullFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const labels: Record<MetricKey, string> = { weight: t("Kilo", "Weight"), waist: t("Bel", "Waist"), fat: t("Yağ", "Fat") };
  const seriesColor: Record<MetricKey, string> = { weight: colors.weight, waist: colors.waist, fat: colors.fat };
  const allSeries: Record<MetricKey, ChartPoint[]> = {
    weight: seriesOf(logs, METRICS.weight),
    waist: seriesOf(logs, METRICS.waist),
    fat: seriesOf(logs, METRICS.fat),
  };
  const available = (Object.keys(METRICS) as MetricKey[]).filter((k) => allSeries[k].length > 0);
  const tabKeys: MetricKey[] = available.length > 0 ? available : ["weight"];
  const activeKey = tabKeys.includes(metric) ? metric : tabKeys[0];
  const def = METRICS[activeKey];
  const color = seriesColor[activeKey];

  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const rangeStart = todayMs - rangeDays * DAY;
  const visible = allSeries[activeKey].filter((pt) => pt.t >= rangeStart);
  const goal = goals[activeKey] ?? null;
  const goalStatus = metricGoalStatus(logs, activeKey, goal);

  function switchMetric(key: MetricKey) {
    setMetric(key);
    setSelected(null);
  }
  function switchRange(days: 30 | 90) {
    setRangeDays(days);
    setSelected(null);
  }

  const tabs = tabKeys.map((k) => ({ key: k, label: labels[k], color: seriesColor[k] }));
  const rangeToggle = (
    <PillToggle
      options={[
        { key: 30 as const, label: t("30 gün", "30 days") },
        { key: 90 as const, label: t("90 gün", "90 days") },
      ]}
      active={rangeDays}
      onChange={switchRange}
    />
  );

  if (visible.length === 0) {
    return (
      <View style={{ gap: 14 }}>
        <SegmentedTabs tabs={tabs} active={activeKey} onChange={switchMetric} />
        <View style={styles.captionRow}>
          <Text style={[styles.caption, { color: p.muted }]}>
            {allSeries[activeKey].length === 0
              ? t("Henüz bu ölçüm için kayıt yok. Kaydettikçe burada trend olarak görünecek.", "No entries for this measurement yet. It will show up here as you log it.")
              : t("Bu aralıkta kayıt yok.", "No entries in this range.")}
          </Text>
          {allSeries[activeKey].length === 0 ? null : rangeToggle}
        </View>
      </View>
    );
  }

  const first = visible[0];
  const last = visible[visible.length - 1];
  const values = visible.map((pt) => pt.value as number);
  const sel = selected !== null && visible[selected] ? visible[selected] : null;
  const shown = (sel ?? last).value as number;

  // Alan (domain) - veri (+ hedef) etrafında pay; x: aralığın başı ... bugün.
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
      : `${sign}${fmt(Math.abs(delta))} ${unitLabel}${pct !== null ? ` · %${fmt(Math.abs(pct))}` : ""}`;

  const unitOf = (v: number) => (def.unit === "%" ? `%${fmt(v)}` : `${fmt(v)} ${def.unit}`);
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

  return (
    <View style={{ gap: 14 }}>
      <SegmentedTabs tabs={tabs} active={activeKey} onChange={switchMetric} />

      <View style={{ gap: 6 }}>
        <Hero
          value={fmt(shown)}
          unit={def.unit}
          right={
            <>
              {visible.length > 1 ? <TrendChip direction={direction} text={trendText} color={color} /> : null}
              {goalText && !sel ? <TrendChip text={goalText} color={colors.goalBase} dashed icon={<Target size={14} color={colors.goalBase} strokeWidth={2.2} />} /> : null}
            </>
          }
        />
        <View style={styles.captionRow}>
          <Text style={[styles.caption, { color: p.muted }]} numberOfLines={1}>
            {caption}
          </Text>
          {rangeToggle}
        </View>
      </View>

      <ChartWell>
      <TrendLineChart
        points={visible}
        domainX={[x0, x1]}
        domainY={domainY}
        yTicks={yTicks}
        formatY={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
        xTicks={xTicks}
        color={color}
        goal={goal ? { value: goal, label: t(`Hedef ${unitOf(goal)}`, `Goal ${unitOf(goal)}`) } : undefined}
        colors={colors}
        animateKey={animateKey}
        selectedIndex={selected !== null && visible[selected] ? selected : null}
        onSelect={(i) => {
          if (i !== null) tapLight();
          setSelected(i);
        }}
      />
      </ChartWell>

      <StatBoxes
        items={[
          { label: t("En düşük", "Lowest"), value: stat(Math.min(...values)) },
          { label: t("Ortalama", "Average"), value: stat(avg) },
          { label: t("En yüksek", "Highest"), value: stat(Math.max(...values)) },
        ]}
      />
      <Text style={[styles.hint, { color: p.muted }]}>
        {t("Bir noktaya dokunarak o günün değerini görebilirsin.", "Tap a point to see that day's value.")}
      </Text>

      {goal === null ? (
        onEditGoal ? (
          <AddGoalButton label={t("Hedef belirle", "Set a goal")} color={colors.goalBase} onPress={onEditGoal} />
        ) : null
      ) : activeKey !== "weight" && goalStatus ? (
        // Kilo hedefinin kartı sayfanın üstünde; bel/yağ için şerit burada.
        <GoalStrip
          goalText={`${t("Hedef", "Goal")} ${unitOf(goal)}`}
          status={goalStatus}
          fillColor={color}
          green={colors.goalBase}
          startLabel={t("Başlangıç", "Start")}
          currentLabel={t("Güncel", "Current")}
          unitOf={unitOf}
          onEdit={onEditGoal}
          celebrateKey={celebrateKeys?.[activeKey as "waist" | "fat"] ?? 0}
        />
      ) : null}
    </View>
  );
}

/** Bel/yağ hedefi ilerleme şeridi: hedef, yüzde, çubuk; ulaşılınca yeşile döner
 * (koyu: koyu yeşil zemin + beyaz metin, açık: yumuşak yeşil ton) + konfeti. */
function GoalStrip({
  goalText,
  status,
  fillColor,
  green,
  startLabel,
  currentLabel,
  unitOf,
  onEdit,
  celebrateKey,
}: {
  goalText: string;
  status: { start: number; current: number; pct: number | null; reached: boolean };
  fillColor: string;
  green: string;
  startLabel: string;
  currentLabel: string;
  unitOf: (v: number) => string;
  onEdit?: () => void;
  celebrateKey: number;
}) {
  const p = usePanelPalette();
  const done = status.reached;
  const bg = done ? (p.isDark ? "#1F6B3D" : `${green}26`) : p.boxBg;
  const textColor = done && p.isDark ? "#FFFFFF" : p.text;
  const mutedColor = done && p.isDark ? "rgba(255,255,255,0.85)" : p.muted;
  return (
    <View style={[styles.strip, { backgroundColor: bg, borderColor: done ? `${green}AA` : "transparent" }]}>
      <View style={styles.stripHead}>
        <Target size={16} color={done && p.isDark ? "#FFFFFF" : green} strokeWidth={2.4} />
        <Text style={[styles.stripTitle, { color: textColor }]}>{goalText}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.stripPct, { color: textColor }]}>
          {done ? "🎉 %100" : status.pct !== null ? `%${Math.round(status.pct)}` : ""}
        </Text>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={10}>
            <Pencil size={15} color={mutedColor} />
          </Pressable>
        ) : null}
      </View>
      {status.pct !== null ? (
        <View style={[styles.stripTrack, { backgroundColor: done && p.isDark ? "rgba(255,255,255,0.25)" : p.isDark ? "rgba(255,255,255,0.14)" : "rgba(36,29,20,0.08)" }]}>
          <View
            style={{
              width: `${Math.max(3, done ? 100 : status.pct)}%`,
              height: 8,
              borderRadius: 4,
              backgroundColor: done ? (p.isDark ? "#FFFFFF" : green) : fillColor,
            }}
          />
        </View>
      ) : null}
      <Text style={[styles.stripCaption, { color: mutedColor }]}>
        {status.pct !== null ? `${startLabel} ${unitOf(status.start)} → ` : ""}
        {currentLabel} {unitOf(status.current)}
      </Text>
      <ConfettiBurst replayKey={celebrateKey} />
    </View>
  );
}

/** Hedef yokken: yeşil çerçeveli "+ Hedef belirle" düğmesi. */
function AddGoalButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.addGoal, { borderColor: `${color}99` }]} hitSlop={4}>
      <Plus size={16} color={color} strokeWidth={2.6} />
      <Text style={[styles.addGoalText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------- Aylar Arası

function avgOf(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/** Son `n` haftanın ortalaması ile ondan ÖNCEKİ `n` haftanın ortalaması. */
function recentVsPrior(values: (number | null)[], n = 4): { recent: number; prior: number } | null {
  const filled = (arr: (number | null)[]) => arr.filter((v): v is number => v !== null);
  const recent = avgOf(filled(values.slice(-n)));
  const prior = avgOf(filled(values.slice(-2 * n, -n)));
  return recent !== null && prior !== null ? { recent, prior } : null;
}

function SubHeader({ color, title }: { color: string; title: string }) {
  const p = usePanelPalette();
  return (
    <View style={styles.subHeader}>
      <View style={[styles.subDot, { backgroundColor: color }]} />
      <Text style={[styles.subTitle, { color: p.text }]}>{title}</Text>
    </View>
  );
}

export function MonthlyTrendPanel({
  points,
  note,
  animateKey = 0,
}: {
  points: WeeklyTrendPoint[];
  note: ReactNode;
  animateKey?: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const p = usePanelPalette();
  const colors = useProgressChartColors();
  const [moodSel, setMoodSel] = useState<number | null>(null);
  const [workSel, setWorkSel] = useState<number | null>(null);
  const moodLabels = moodScaleLabels(t);

  const hasAnyData = points.some((pt) => pt.avg_mood_score !== null || pt.workout_days > 0);
  if (!hasAnyData) {
    return (
      <Text style={{ fontSize: 13, color: p.muted }}>
        {t(
          "Henüz yeterli veri yok. Ruh hali ve antrenman kaydettikçe haftalık trend burada görünecek.",
          "Not enough data yet. The weekly trend will show up here as you log mood and workouts."
        )}
      </Text>
    );
  }

  const locale = language === "en" ? "en-US" : "tr-TR";
  const dayFmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const weeks = points.map((pt) => dateMs(pt.week_start));
  const x0 = weeks[0];
  const x1 = weeks[weeks.length - 1];
  const xTicks = [0, 1, 2, 3].map((i) => {
    const tt = x0 + ((x1 - x0) * i) / 3;
    return { t: tt, label: dayFmt(tt) };
  });

  // ---- Ruh hali
  const moodPts: ChartPoint[] = points.map((pt, i) => ({ t: weeks[i], value: pt.avg_mood_score }));
  const moodFilled = points.map((pt) => pt.avg_mood_score).filter((v): v is number => v !== null);
  const latestMoodIdx = (() => {
    for (let i = points.length - 1; i >= 0; i -= 1) if (points[i].avg_mood_score !== null) return i;
    return -1;
  })();
  const shownMoodIdx = moodSel !== null && points[moodSel]?.avg_mood_score != null ? moodSel : latestMoodIdx;
  const shownMood = shownMoodIdx >= 0 ? (points[shownMoodIdx].avg_mood_score as number) : null;
  const moodTrend = recentVsPrior(points.map((pt) => pt.avg_mood_score));
  const moodDelta = moodTrend ? Math.round((moodTrend.recent - moodTrend.prior) * 10) / 10 : null;
  const moodAvg = avgOf(moodFilled);

  // ---- Antrenman
  const workDays = points.map((pt) => pt.workout_days);
  const shownWorkIdx = workSel ?? workDays.length - 1;
  const workTrend = recentVsPrior(workDays);
  const workDelta = workTrend ? Math.round((workTrend.recent - workTrend.prior) * 10) / 10 : null;
  const workPct = workTrend && workTrend.prior > 0 ? ((workTrend.recent - workTrend.prior) / workTrend.prior) * 100 : null;
  const workAvg = avgOf(workDays) ?? 0;
  const activeWeeks = workDays.filter((d) => d > 0).length;
  const barLabels = weeks.map((ms, i) => (i % 3 === 0 ? dayFmt(ms) : ""));

  const dirOf = (d: number | null): "up" | "down" | "flat" => (d === null || d === 0 ? "flat" : d > 0 ? "up" : "down");
  const signOf = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "");

  return (
    <View style={{ gap: 22 }}>
      {/* ---- Ruh hali */}
      <View style={{ gap: 14 }}>
        <SubHeader color={colors.mood} title={t("Haftalık Ortalama Ruh Hali", "Weekly Average Mood")} />
        <View style={{ gap: 6 }}>
          <Hero
            value={shownMood !== null ? shownMood.toFixed(1) : "—"}
            unit={shownMood !== null ? `· ${moodLabels[Math.min(5, Math.max(1, Math.round(shownMood)))]}` : ""}
            right={
              moodDelta !== null ? (
                <TrendChip
                  direction={dirOf(moodDelta)}
                  color={colors.mood}
                  text={
                    moodDelta === 0
                      ? t("Sabit · son 4 hafta", "Steady · last 4 wks")
                      : `${signOf(moodDelta)}${fmt(Math.abs(moodDelta))} · ${t("son 4 hafta", "last 4 wks")}`
                  }
                />
              ) : undefined
            }
          />
          <Text style={[styles.caption, { color: p.muted }]}>
            {moodSel !== null && shownMoodIdx === moodSel
              ? t(`${dayFmt(weeks[moodSel])} haftası`, `Week of ${dayFmt(weeks[moodSel])}`)
              : t("Son kayıtlı hafta", "Latest logged week")}
          </Text>
        </View>
        <ChartWell>
        <TrendLineChart
          points={moodPts}
          domainX={[x0, x1]}
          domainY={[1, 5]}
          yTicks={[1, 2, 3, 4, 5]}
          formatY={(v) => moodLabels[v] ?? String(v)}
          xTicks={xTicks}
          color={colors.mood}
          height={170}
          gutterLeft={46}
          colors={colors}
          animateKey={animateKey}
          selectedIndex={moodSel}
          onSelect={(i) => {
            if (i !== null) tapLight();
            setMoodSel(i);
          }}
        />
        </ChartWell>
        <StatBoxes
          items={[
            { label: t("Ortalama", "Average"), value: moodAvg !== null ? moodAvg.toFixed(1) : "—" },
            { label: t("En yüksek", "Highest"), value: moodFilled.length ? Math.max(...moodFilled).toFixed(1) : "—" },
            { label: t("En düşük", "Lowest"), value: moodFilled.length ? Math.min(...moodFilled).toFixed(1) : "—" },
          ]}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: p.isDark ? "rgba(255,255,255,0.1)" : p.c.border }]} />

      {/* ---- Antrenman günü (çubuk) */}
      <View style={{ gap: 14 }}>
        <SubHeader color={colors.workout} title={t("Haftalık Antrenman Günü", "Weekly Workout Days")} />
        <View style={{ gap: 6 }}>
          <Hero
            value={String(workDays[shownWorkIdx] ?? 0)}
            unit={t("gün", "days")}
            right={
              workDelta !== null ? (
                <TrendChip
                  direction={dirOf(workDelta)}
                  color={colors.workout}
                  text={
                    workDelta === 0
                      ? t("Sabit · son 4 hafta", "Steady · last 4 wks")
                      : `${signOf(workDelta)}${fmt(Math.abs(workDelta))} ${t("gün", "d")}${workPct !== null ? ` · %${fmt(Math.abs(workPct), 0)}` : ""}`
                  }
                />
              ) : undefined
            }
          />
          <Text style={[styles.caption, { color: p.muted }]}>
            {workSel !== null
              ? t(`${dayFmt(weeks[workSel])} haftası`, `Week of ${dayFmt(weeks[workSel])}`)
              : t("Bu hafta", "This week")}
          </Text>
        </View>
        <ChartWell>
        <WeeklyBarsChart
          values={workDays}
          xLabels={barLabels}
          domainY={[0, 7]}
          yTicks={[0, 2, 4, 6]}
          color={colors.workout}
          colors={colors}
          animateKey={animateKey}
          selectedIndex={workSel}
          onSelect={(i) => {
            if (i !== null) tapLight();
            setWorkSel(i);
          }}
        />
        </ChartWell>
        <StatBoxes
          items={[
            { label: t("Ortalama", "Average"), value: `${fmt(workAvg)} ${t("gün/hf", "d/wk")}` },
            { label: t("En çok", "Most"), value: `${Math.max(...workDays)} ${t("gün", "days")}` },
            { label: t("Aktif hafta", "Active weeks"), value: `${activeWeeks}/${workDays.length}` },
          ]}
        />
      </View>

      {note}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, gap: 8, overflow: "hidden" },
  stripHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  stripTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stripPct: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stripTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  stripCaption: { fontSize: 12 },
  addGoal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  addGoalText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  well: { borderRadius: 16, paddingHorizontal: 6, paddingVertical: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, gap: 2, minWidth: 0 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tabs: { flexDirection: "row", borderRadius: 16, padding: 3, gap: 3 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: 13 },
  pillToggle: { flexDirection: "row", borderRadius: 999, padding: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  heroRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 },
  heroValue: { fontSize: 36, fontFamily: "Inter_500Medium", letterSpacing: -0.8 },
  heroUnit: { fontSize: 15 },
  chipCol: { alignItems: "flex-end", gap: 6, flexShrink: 1 },
  captionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  caption: { fontSize: 13, flexShrink: 1 },
  hint: { fontSize: 12, textAlign: "center", marginTop: -2 },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  subDot: { width: 8, height: 8, borderRadius: 4 },
  subTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1 },
});
