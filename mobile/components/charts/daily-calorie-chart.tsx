import { memo, useMemo, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import { localDateKey, type MealEntry, type PreferredLanguage } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { useThemeColors } from "@/components/ui";
import { niceTicks, useProgressChartColors } from "@/components/charts/svg-charts";
import { tapLight } from "@/lib/haptics";

// Beslenme > Kalori Trendi (2026-09-24 redesign). Eski gifted-charts
// LineChart'ın yerini aldı - iki gerçek sorunu vardı:
// 1) Sadece KAYIT OLAN günleri, tarihten bağımsız EŞİT aralıkla diziyordu -
//    27/08 → 31/08 → 14/09 yan yana, aradaki boş günler yok sayılıyordu
//    (İlerleme'nin SVG çekirdeğine geçiş sebebinin AYNISI, bkz. svg-charts.tsx).
// 2) `curved` seyrek veride ölçülmemiş değerler uyduruyordu.
// Günlük kalori bir GÜNLÜK TOPLAM (ayrık) - dataviz kuralı gereği çubuk
// (§5: sayım/toplam verisi ÇUBUK): son N takvim günü, boş gün de yer tutar,
// hedef = yeşil kesikli çizgi, dokunarak gün seçimi.

const HEIGHT = 190;
const GUTTER_LEFT = 38;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

function dayDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function locale(language: PreferredLanguage) {
  return language === "en" ? "en-US" : "tr-TR";
}

function fmtAxis(v: number): string {
  if (v >= 1000) return `${Math.round((v / 1000) * 10) / 10}k`.replace(".", ",");
  return String(v);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("tr-TR");
}

export const DailyCalorieChart = memo(function DailyCalorieChart({
  entries,
  days,
  goal,
  color,
  overColor,
}: {
  entries: MealEntry[];
  days: number;
  goal: number | null;
  color: string;
  overColor: string;
}) {
  const t = useT();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  const chartColors = useProgressChartColors();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const series = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(e.log_date, (totals.get(e.log_date) ?? 0) + e.calories_kcal);
    const out: { key: string; value: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDateKey(d);
      out.push({ key, value: totals.get(key) ?? 0 });
    }
    return out;
  }, [entries, days]);

  const loggedDays = series.filter((d) => d.value > 0);
  const average = loggedDays.length > 0 ? loggedDays.reduce((a, d) => a + d.value, 0) / loggedDays.length : 0;
  const maxValue = Math.max(0, ...series.map((d) => d.value), goal ?? 0);
  const yTarget = Math.max(maxValue * 1.08, 100);
  const ticks = niceTicks(0, yTarget, 4);
  // niceTicks hedefin altında bitebilir - en üst çizgi/etiket eksik kalmasın.
  if (ticks.length > 1 && ticks[ticks.length - 1] < yTarget) ticks.push(ticks[ticks.length - 1] + (ticks[1] - ticks[0]));
  const yMax = ticks[ticks.length - 1];

  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.78)" : c.muted;

  if (loggedDays.length === 0) {
    return (
      <Text style={[styles.empty, { color: muted }]}>
        {t(
          "Bu aralıkta öğün kaydı yok. Öğün kaydettikçe günlük kalori trendin burada görünecek.",
          "No meals logged in this range. Your daily calorie trend will show up here as you log meals."
        )}
      </Text>
    );
  }

  // Seçim yoksa en son KAYITLI gün vurgulanır (boş bugün değil).
  const lastLogged = (() => {
    for (let i = series.length - 1; i >= 0; i -= 1) if (series[i].value > 0) return i;
    return series.length - 1;
  })();
  const active = selected !== null && selected < series.length ? selected : lastLogged;
  const activeDay = series[active];
  const todayKey = localDateKey();
  const activeLabel =
    activeDay.key === todayKey
      ? t("Bugün", "Today")
      : dayDate(activeDay.key).toLocaleDateString(locale(language), { day: "numeric", month: "long", weekday: "short" });
  const activePct = goal ? Math.round((activeDay.value / goal) * 100) : null;
  const activeOver = goal ? activeDay.value > goal * 1.1 : false;

  const left = GUTTER_LEFT;
  const right = width - PAD_RIGHT;
  const bottom = HEIGHT - PAD_BOTTOM;
  const sy = (v: number) => bottom - (v / yMax) * (bottom - PAD_TOP);
  const slot = series.length > 0 ? (right - left) / series.length : 0;
  const barW = Math.max(3, Math.min(22, slot * 0.64));
  const cx = (i: number) => left + slot * i + slot / 2;
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;

  function label(i: number): string {
    const d = dayDate(series[i].key);
    if (days <= 7) return d.toLocaleDateString(locale(language), { weekday: "short" }).replace(".", "");
    return `${d.getDate()}`;
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.headLabel, { color: muted }]}>{activeLabel}</Text>
          <Text style={[styles.headValue, { color: text }]}>
            {fmt(activeDay.value)} <Text style={[styles.headUnit, { color: muted }]}>kcal</Text>
          </Text>
        </View>
        {activePct !== null ? (
          <View
            style={[
              styles.pctChip,
              {
                backgroundColor: `${activeOver ? overColor : color}2E`,
                borderColor: `${activeOver ? overColor : color}80`,
              },
            ]}
          >
            <Text style={[styles.pctText, { color: isDark ? "#FFFFFF" : activeOver ? overColor : color }]}>
              {t(`Hedefin %${activePct}`, `${activePct}% of goal`)}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[styles.well, { backgroundColor: isDark ? "rgba(0,0,0,0.30)" : "rgba(245,162,107,0.08)" }]}
      >
        <View style={{ height: HEIGHT }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <>
              <Svg width={width} height={HEIGHT} pointerEvents="none">
                {ticks.map((v) => (
                  <Line
                    key={`g${v}`}
                    x1={left}
                    x2={right}
                    y1={sy(v)}
                    y2={sy(v)}
                    stroke={chartColors.grid}
                    strokeWidth={1}
                    strokeDasharray={v === 0 ? undefined : "3 5"}
                  />
                ))}
                {ticks.map((v) => (
                  <SvgText
                    key={`y${v}`}
                    fontFamily="Inter_400Regular"
                    x={left - 7}
                    y={sy(v) + 3.5}
                    fontSize={11}
                    fill={chartColors.axisText}
                    textAnchor="end"
                  >
                    {fmtAxis(v)}
                  </SvgText>
                ))}
                {series.map((d, i) => {
                  const h = d.value > 0 ? Math.max(bottom - sy(d.value), 3) : 2.5;
                  const isOn = i === active;
                  const over = goal ? d.value > goal * 1.1 : false;
                  return (
                    <Rect
                      key={d.key}
                      x={cx(i) - barW / 2}
                      y={bottom - h}
                      width={barW}
                      height={h}
                      rx={Math.min(5, barW / 2.5)}
                      fill={d.value > 0 ? (over ? overColor : color) : chartColors.grid}
                      opacity={d.value > 0 ? (isOn ? 1 : 0.62) : 1}
                    />
                  );
                })}
                {goal ? (
                  <>
                    <Line
                      x1={left}
                      x2={right}
                      y1={sy(goal)}
                      y2={sy(goal)}
                      stroke={chartColors.goal}
                      strokeWidth={1.4}
                      strokeDasharray="6 4"
                    />
                    {/* Etiket SOLDA: sağ uçta en önemli çubuğun (bugün) üstüne
                        biniyordu (canlı testte 7 günlük görünümde görüldü). */}
                    <SvgText
                      fontFamily="Inter_600SemiBold"
                      x={left + 4}
                      y={sy(goal) - 5}
                      fontSize={11}
                      fill={chartColors.goal}
                      textAnchor="start"
                    >
                      {t(`Hedef ${fmt(goal)}`, `Goal ${fmt(goal)}`)}
                    </SvgText>
                  </>
                ) : null}
                {series.map((_, i) =>
                  i % labelEvery === (series.length - 1) % labelEvery ? (
                    <SvgText
                      key={`x${i}`}
                      fontFamily={i === active ? "Inter_700Bold" : "Inter_400Regular"}
                      x={cx(i)}
                      y={HEIGHT - 7}
                      fontSize={11}
                      fill={i === active ? text : chartColors.axisText}
                      textAnchor="middle"
                    >
                      {label(i)}
                    </SvgText>
                  ) : null
                )}
              </Svg>
              {/* Dokunma: her gün için şeffaf bir sütun - web'de de güvenilir
                  (svg-charts.tsx'teki `locationX` web sorununa hiç girmiyor) ve
                  ekran okuyucu her günü ayrı okuyabiliyor. */}
              <View style={[StyleSheet.absoluteFill, { left, right: PAD_RIGHT, flexDirection: "row" }]}>
                {series.map((d, i) => (
                  <Pressable
                    key={d.key}
                    style={{ flex: 1 }}
                    onPress={() => {
                      tapLight();
                      setSelected(i === selected ? null : i);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${dayDate(d.key).toLocaleDateString(locale(language), { day: "numeric", month: "long" })}: ${fmt(d.value)} kcal`}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>

      <Text style={[styles.foot, { color: muted }]}>
        {t(
          `Kayıtlı ${loggedDays.length} günün ortalaması: ${fmt(average)} kcal`,
          `Average of ${loggedDays.length} logged day${loggedDays.length === 1 ? "" : "s"}: ${fmt(average)} kcal`
        )}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 19 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  headValue: { fontSize: 26, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  headUnit: { fontSize: 14 },
  pctChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  pctText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  well: { borderRadius: 16, paddingHorizontal: 6, paddingVertical: 8 },
  foot: { fontSize: 12 },
});
