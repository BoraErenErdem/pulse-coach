import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, getMoodHistory, getMoodInsight, type MoodInsight, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { formatDate, toLocaleUpper } from "@/lib/format";
import { groupEntriesByWeek } from "@/lib/date-grouping";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { DetailScreen, ErrorBanner, MOOD_KEYS, MOOD_META, Skeleton, type ThemeColors, useThemeColors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";
import { GlassShell, ProgressInsight, ProgressSectionCard } from "@/components/progress-cards";
import { MOOD_SURFACE_TONE, SurfaceToneProvider } from "@/components/surface-tone";
import { MOOD_HERO_GRADIENT_DARK, MOOD_INSIGHT_TONE, useMoodAccent } from "@/components/profile-identity";
import { TrendLineChart, useProgressChartColors, type ChartPoint } from "@/components/charts/svg-charts";
import { moodScaleLabels } from "@/components/charts/chart-utils";

// Profil > Ruh Hali (2026-09-25 redesign). Kimlik = ruh hali camgöbeği
// (progress-identity.ts::mood) - içeriğin "sahibi" ruh hali, Profil'in ametisti
// değil. Sıra tasarım dilindeki gibi: "Bugün" kahraman kartı (seçici + özet) ->
// koç gözlemi (koyu camgöbeği) -> takvim -> trend.
// Trend grafiği gifted-charts'tan İlerleme'nin SVG çekirdeğine geçti: eski grafik
// 393px'te kartın dışına taşıyor, x etiketleri "7/..." diye kesiliyordu ve
// noktaları tarihten bağımsız eşit aralıkla çiziyordu.
// Veri her odaklanışta tazelenir, replay animasyonu yok (tasarım dili §6).

const DAY_LABELS: Record<"tr" | "en", string[]> = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
const MOOD_SCORE: Record<MoodKey, number> = { zor: 1, dusuk: 2, notr: 3, iyi: 4, harika: 5 };
const DAY_MS = 86400000;

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}
function interpolateHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const toHex = (v: number) => Math.round(clampByte(v)).toString(16).padStart(2, "0");
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

// Takvim tonu (2026-08-19'da 12 turda ayarlanıp onaylanan TEK formül, değişmedi):
// c.surface -> c.success doğrusu üzerinde artan t; Harika t>1 (ekstrapolasyon).
// Emoji birincil taşıyıcı - renk tek başına anlam taşımıyor.
function moodTintColor(c: ThemeColors, key: MoodKey): string {
  const STEP: Record<MoodKey, number> = { zor: 0.2, dusuk: 0.4, notr: 0.6, iyi: 0.85, harika: 1.25 };
  return interpolateHex(c.surface, c.success, STEP[key]);
}

export default function MoodHistoryScreen() {
  return (
    <SurfaceToneProvider tone={MOOD_SURFACE_TONE}>
      <MoodScreen />
    </SurfaceToneProvider>
  );
}

function MoodScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const moodAccent = useMoodAccent();
  const chartColors = useProgressChartColors();
  const s = useMemo(() => makeStyles(c, isDark), [c, isDark]);
  const [history, setHistory] = useState<MoodLog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [insight, setInsight] = useState<MoodInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const labels = useMemo(() => moodScaleLabels(t), [t]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      setHistory(await getMoodHistory(token, 90));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    }
  }, [token, t]);

  // Yeterli sinyal yoksa backend LLM çağırmadan hızlıca döner (bkz. GET /mood/insight).
  const loadInsight = useCallback(async () => {
    if (!token) return;
    try {
      setInsight(await getMoodInsight(token));
    } catch {
      setInsight(null);
    } finally {
      setIsInsightLoading(false);
    }
  }, [token]);

  useDebouncedFocusEffect(
    useCallback(() => {
      void loadData();
      void loadInsight();
    }, [loadData, loadInsight])
  );

  const today = isoOf(new Date());

  // MoodPicker kaydı kendisi yapıyor ve onMoodChange'i iyimser olarak ÖNCE
  // çağırıyor - sunucudan yeniden çekmek yarışa girerdi; bugünün kaydını yerelde
  // değiştiriyoruz. İçgörü bilerek yeniden çekilmiyor (tek gün nadiren değiştirir).
  const handleMoodChange = useCallback(
    (mood: MoodKey | null) => {
      setHistory((prev) => {
        const withoutToday = (prev ?? []).filter((entry) => entry.log_date !== today);
        return mood ? [...withoutToday, { mood_key: mood, log_date: today }] : withoutToday;
      });
      setSelectedIndex(null);
    },
    [today]
  );

  // ---- özet sayıları
  const stats = useMemo(() => {
    if (!history) return null;
    const since7 = addDaysIso(today, -6);
    const since30 = addDaysIso(today, -29);
    const week = history.filter((entry) => entry.log_date >= since7);
    const month = history.filter((entry) => entry.log_date >= since30);
    const avg = week.length ? week.reduce((sum, e) => sum + MOOD_SCORE[e.mood_key], 0) / week.length : null;
    const counts = new Map<MoodKey, number>();
    for (const entry of month) counts.set(entry.mood_key, (counts.get(entry.mood_key) ?? 0) + 1);
    let frequent: MoodKey | null = null;
    for (const key of MOOD_KEYS) {
      if ((counts.get(key) ?? 0) > (frequent ? (counts.get(frequent) ?? 0) : 0)) frequent = key;
    }
    return {
      weekMood: avg != null ? MOOD_KEYS[Math.min(4, Math.max(0, Math.round(avg) - 1))] : null,
      monthCount: month.length,
      frequent,
    };
  }, [history, today]);

  // ---- trend (tarihe ölçekli)
  const trend = useMemo(() => {
    if (!history || history.length === 0) return null;
    const sorted = [...history].sort((a, b) => a.log_date.localeCompare(b.log_date));
    const points: ChartPoint[] = sorted.map((entry) => ({
      t: new Date(`${entry.log_date}T12:00:00`).getTime(),
      value: MOOD_SCORE[entry.mood_key],
    }));
    const end = new Date(`${today}T12:00:00`).getTime();
    const start = Math.min(points[0].t, end - 13 * DAY_MS);
    const mid = start + (end - start) / 2;
    const fmt = (ms: number) => formatDate(isoOf(new Date(ms)), language, { day: "numeric", month: "short" });
    return {
      sorted,
      points,
      domainX: [start, end] as [number, number],
      xTicks: [
        { t: start, label: fmt(start) },
        { t: mid, label: fmt(mid) },
        { t: end, label: t("Bugün", "Today") },
      ],
    };
  }, [history, today, language, t]);

  const weeks = useMemo(() => groupEntriesByWeek(history ?? [], (entry) => entry.log_date), [history]);
  const selectedEntry = trend && selectedIndex != null ? trend.sorted[selectedIndex] : null;

  const heroText = isDark ? "#FFFFFF" : c.text;
  const heroMuted = isDark ? "rgba(255,255,255,0.85)" : c.muted;
  const insightMessage =
    insight?.status === "ready" && insight.message
      ? insight.message
      : insight?.status === "no_signal"
        ? t(
            "Şu an belirgin bir eğilim ya da örüntü yok - ruh halin dengeli görünüyor.",
            "No clear trend or pattern right now - your mood looks steady."
          )
        : t(
            "Henüz yeterli veri yok - ruh halini bir-iki hafta düzenli kaydettikçe burada kişisel bir gözlem göreceksin.",
            "Not enough data yet - keep logging your mood for a week or two and a personal observation will appear here."
          );

  return (
    <DetailScreen title={t("Ruh Hali", "Mood")} glowHeight={320}>
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={moodAccent.graphic}
            onRefresh={async () => {
              setIsRefreshing(true);
              await Promise.all([loadData(), loadInsight()]);
              setIsRefreshing(false);
            }}
          />
        }
      >
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {/* Bugün: seçici + özet (kahraman kart, parlak camgöbeği). */}
        <GlassShell
          gradient={MOOD_HERO_GRADIENT_DARK}
          lightFill="rgba(255,255,255,0.9)"
          lightGradient={[`${moodAccent.graphic}33`, "rgba(255,255,255,0.9)"]}
          glow={isDark ? MOOD_HERO_GRADIENT_DARK[0] : moodAccent.graphic}
          radius={22}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={s.heroBody}>
            <View>
              <Text style={[s.heroTitle, { color: heroText }]}>{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</Text>
              <Text style={[s.heroDate, { color: heroMuted }]}>
                {formatDate(today, language, { weekday: "long", day: "numeric", month: "long" })}
              </Text>
            </View>
            <MoodPicker
              variant="hero"
              onMoodChange={handleMoodChange}
              accent={isDark ? "#FFFFFF" : moodAccent.graphic}
              labelColor={heroText}
            />
            <View style={[s.statRow, { borderTopColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(36,29,20,0.10)" }]}>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: heroText }]}>
                  {stats?.weekMood ? `${MOOD_META[stats.weekMood].emoji} ${t(MOOD_META[stats.weekMood].tr, MOOD_META[stats.weekMood].en)}` : "–"}
                </Text>
                <Text style={[s.statLabel, { color: heroMuted }]}>{t("son 7 gün", "last 7 days")}</Text>
              </View>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: heroText }]}>{stats ? String(stats.monthCount) : "–"}</Text>
                <Text style={[s.statLabel, { color: heroMuted }]}>{t("kayıt / 30 gün", "entries / 30 days")}</Text>
              </View>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: heroText }]}>
                  {stats?.frequent ? `${MOOD_META[stats.frequent].emoji} ${t(MOOD_META[stats.frequent].tr, MOOD_META[stats.frequent].en)}` : "–"}
                </Text>
                <Text style={[s.statLabel, { color: heroMuted }]}>{t("en sık", "most often")}</Text>
              </View>
            </View>
          </View>
        </GlassShell>

        <ProgressInsight
          title={t("Ruh Hali Gözlemi", "Mood Observation")}
          loading={isInsightLoading}
          message={insightMessage}
          tone={MOOD_INSIGHT_TONE}
        />

        <ProgressSectionCard title={t("Takvim", "Calendar")} subtitle={t("Son 90 gün, haftalara göre", "Last 90 days, by week")} toneFrom={0.2} toneTo={0.55}>
          {!history ? (
            <Skeleton height={160} />
          ) : history.length === 0 ? (
            <Text style={s.emptyText}>
              {t("Henüz ruh hali kaydı yok. Yukarıdan bugünü seçerek başlayabilirsin.", "No mood logged yet. Start by picking today above.")}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={s.weekRow}>
                {DAY_LABELS[language].map((label) => (
                  <Text key={label} style={s.dayLabel}>
                    {toLocaleUpper(label, language)}
                  </Text>
                ))}
              </View>
              {weeks.map((week) => (
                <View key={week.weekStartIso} style={s.weekRow}>
                  {week.days.map((entry, i) => {
                    const dateIso = addDaysIso(week.weekStartIso, i);
                    const future = dateIso > today;
                    const isToday = dateIso === today;
                    const option = entry ? MOOD_META[entry.mood_key] : null;
                    return (
                      <View
                        key={dateIso}
                        style={[
                          s.dayCell,
                          entry ? { backgroundColor: moodTintColor(c, entry.mood_key) } : future ? s.dayCellFuture : s.dayCellEmpty,
                          isToday && { borderWidth: 2, borderColor: moodAccent.graphic },
                        ]}
                        accessibilityLabel={
                          formatDate(dateIso, language, { day: "2-digit", month: "long" }) +
                          (option ? `: ${t(option.tr, option.en)}` : "") +
                          (isToday ? ` (${t("bugün", "today")})` : "")
                        }
                      >
                        {option ? (
                          <Text style={s.dayEmoji}>{option.emoji}</Text>
                        ) : (
                          <Text style={[s.dayNumber, future && s.dayNumberFuture, isToday && { color: moodAccent.text, fontFamily: "Inter_700Bold" }]}>
                            {new Date(`${dateIso}T00:00:00`).getDate()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={s.legendRow}>
                <View style={s.legendScale}>
                  {MOOD_KEYS.map((key) => (
                    <View key={key} style={[s.legendSwatch, { backgroundColor: moodTintColor(c, key) }]} />
                  ))}
                </View>
                <Text style={s.legendText}>{t("Ton, Zor'dan Harika'ya doğru koyulaşır", "Shade deepens from Tough to Great")}</Text>
              </View>
            </View>
          )}
        </ProgressSectionCard>

        <ProgressSectionCard
          title={t("Trend", "Trend")}
          subtitle={
            selectedEntry
              ? `${formatDate(selectedEntry.log_date, language, { day: "numeric", month: "long" })} · ${MOOD_META[selectedEntry.mood_key].emoji} ${t(MOOD_META[selectedEntry.mood_key].tr, MOOD_META[selectedEntry.mood_key].en)}`
              : t("Bir güne dokunarak ayrıntısını gör", "Tap a day to see it")
          }
          toneFrom={0.55}
          toneTo={0.9}
        >
          {!history ? (
            <Skeleton height={200} />
          ) : !trend ? (
            <Text style={s.emptyText}>{t("Kayıt ekledikçe trend burada görünecek.", "Your trend will appear here as you log.")}</Text>
          ) : (
            <TrendLineChart
              points={trend.points}
              domainX={trend.domainX}
              domainY={[0.6, 5.4]}
              yTicks={[1, 2, 3, 4, 5]}
              formatY={(v) => labels[v] ?? ""}
              xTicks={trend.xTicks}
              color={chartColors.mood}
              colors={chartColors}
              gutterLeft={54}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          )}
        </ProgressSectionCard>
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;
  return StyleSheet.create({
    container: { padding: 16, gap: 14, paddingBottom: 40 },
    heroBody: { padding: 18, gap: 14 },
    heroTitle: { fontSize: 18, fontFamily: "Inter_500Medium" },
    heroDate: { fontSize: 13, marginTop: 2 },
    statRow: { flexDirection: "row", gap: 8, borderTopWidth: 1, paddingTop: 12 },
    stat: { flex: 1, gap: 2, minWidth: 0 },
    statValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    statLabel: { fontSize: 12 },
    emptyText: { fontSize: 13, lineHeight: 19, color: muted },
    weekRow: { flexDirection: "row", gap: 6 },
    dayLabel: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold", color: muted },
    dayCell: { flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    dayCellEmpty: {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(36,29,20,0.05)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : c.border,
    },
    dayCellFuture: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: isDark ? "rgba(255,255,255,0.16)" : c.border,
    },
    dayEmoji: { fontSize: 17 },
    dayNumber: { fontSize: 12, color: muted },
    dayNumberFuture: { opacity: 0.5 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
    legendScale: { flexDirection: "row", gap: 3 },
    legendSwatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { flex: 1, fontSize: 12, color: muted },
  });
}
