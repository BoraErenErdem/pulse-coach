"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";
import {
  getMoodHistory,
  getMoodInsight,
  type MoodInsight,
  type MoodKey,
  type MoodLog,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { groupEntriesByWeek } from "@/lib/date-grouping";
import { tileStyle } from "@/lib/identity";
import { Card, EmptyState, ErrorBanner, InsightCard, Skeleton } from "@/components/ui";
import { BackToProfile } from "@/components/BackToProfile";
import { MoodPicker } from "@/components/MoodPicker";
import { MoodTrendChart } from "@/components/charts/MoodTrendChart";

// Sıra mobil mood-history.tsx ile aynı (2026-10-07): "Bugün" kahraman kartı (seçici + özet) ->
// koç gözlemi -> takvim -> trend.

const DAY_LABELS: Record<"tr" | "en", string[]> = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
const MOOD_KEYS: MoodKey[] = ["zor", "dusuk", "notr", "iyi", "harika"];
const MOOD_SCORE: Record<MoodKey, number> = { zor: 1, dusuk: 2, notr: 3, iyi: 4, harika: 5 };

// Takvim tonu - mobildeki TEK formül (2026-08-19'da onaylandı): tema yüzeyi -> başarı yeşili
// doğrusunda artan t, Harika t>1. Emoji birincil taşıyıcı; renk tek başına anlam taşımıyor.
const TINT_ENDS = { light: ["#FFFCF6", "#3E8F5C"], dark: ["#1A2226", "#57B37B"] } as const;
const TINT_STEP: Record<MoodKey, number> = { zor: 0.2, dusuk: 0.4, notr: 0.6, iyi: 0.85, harika: 1.25 };

function interpolateHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) => Math.round(Math.max(0, Math.min(255, ch(a, i) + (ch(b, i) - ch(a, i)) * t))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function formatDate(isoDate: string, language: PreferredLanguage, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", options);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Cihazın YEREL bugünü (YYYY-MM-DD) - takvimde bugünü vurgulamak için. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MoodHistoryPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const t = useT();
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [insight, setInsight] = useState<MoodInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const today = todayIso();
  const tintEnds = TINT_ENDS[theme === "dark" ? "dark" : "light"];
  const tint = (key: MoodKey) => interpolateHex(tintEnds[0], tintEnds[1], TINT_STEP[key]);

  const MOOD_OPTIONS: Record<MoodKey, { emoji: string; label: string }> = {
    zor: { emoji: "😔", label: t("Zor", "Tough") },
    dusuk: { emoji: "😕", label: t("Düşük", "Low") },
    notr: { emoji: "🙂", label: t("Nötr", "Neutral") },
    iyi: { emoji: "😊", label: t("İyi", "Good") },
    harika: { emoji: "🤩", label: t("Harika", "Great") },
  };

  const { isLoading, error: loadError } = useAsyncResource(async () => {
    if (!token) return;
    const data = await getMoodHistory(token, 90);
    setHistory(data);
  }, [token]);

  const weeks = useMemo(() => groupEntriesByWeek(history, (entry) => entry.log_date), [history]);

  // Kahraman kartın özetleri (mobildeki gibi): son 7 günün ortalaması, 30 günde kayıt sayısı, en sık.
  const stats = useMemo(() => {
    const week = history.filter((entry) => entry.log_date >= addDaysIso(today, -6));
    const month = history.filter((entry) => entry.log_date >= addDaysIso(today, -29));
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

  // MoodPicker kaydı kendisi yapıyor ve onMoodChange'i iyimser olarak önce çağırıyor: sunucudan
  // yeniden çekmek yarışa girerdi, bugünün kaydı yerelde değişiyor (mobildeki gibi).
  function handleMoodChange(mood: MoodKey | null) {
    setHistory((prev) => {
      const withoutToday = prev.filter((entry) => entry.log_date !== today);
      return mood ? [...withoutToday, { mood_key: mood, log_date: today }] : withoutToday;
    });
  }

  // İçgörü (LLM yorumu) BİLEREK ayrı/gecikmeli yükleniyor - takvim anında görünsün, LLM'in
  // birkaç saniyesi kullanıcıyı beklemesin. Yeterli sinyal yoksa backend LLM çağırmadan döner.
  useEffect(() => {
    let cancelled = false;

    function loadInsight() {
      if (!token) {
        setInsight(null);
        return;
      }
      setIsInsightLoading(true);
      getMoodInsight(token)
        .then((result) => {
          if (!cancelled) setInsight(result);
        })
        .catch(() => {
          if (!cancelled) setInsight(null);
        })
        .finally(() => {
          if (!cancelled) setIsInsightLoading(false);
        });
    }
    loadInsight();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Mobildeki gibi koç kartı her zaman görünür; sinyal yoksa ya da veri azsa sabit metin (LLM yok).
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

  const statLabel = (key: MoodKey | null) => (key ? `${MOOD_OPTIONS[key].emoji} ${MOOD_OPTIONS[key].label}` : "–");

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Mobilde bu ekran Profil'in üstüne açılıyor: geri bağlantısı (2026-10-07). */}
      <div>
        <BackToProfile />
        <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Ruh Hali", "Mood")}</h1>
      </div>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {/* Masaüstünde iki sütun (2026-10-07): solda bugün/koç/trend, sağda takvim; telefonda mobil sırası
          (bugün -> koç -> takvim -> trend). */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          {/* Bugün: seçici + özet (mobil kahraman kart, camgöbeği kimlik). */}
          <section className="pc-tile flex flex-col gap-3.5 p-[18px] sm:p-5" style={tileStyle("mood")} aria-label={t("Bugün", "Today")}>
            <div>
              <h2 className="text-lg font-medium text-[var(--tile-text)]">{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</h2>
              <p className="mt-0.5 text-[13px] text-[var(--tile-subtle)]">
                {formatDate(today, language, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <MoodPicker variant="hero" onMoodChange={handleMoodChange} />
            <dl className="grid grid-cols-3 gap-2 border-t border-[rgba(36,29,20,0.10)] pt-3 dark:border-white/20">
              {[
                { value: isLoading ? "–" : statLabel(stats.weekMood), label: t("son 7 gün", "last 7 days") },
                { value: isLoading ? "–" : String(stats.monthCount), label: t("kayıt / 30 gün", "entries / 30 days") },
                { value: isLoading ? "–" : statLabel(stats.frequent), label: t("en sık", "most often") },
              ].map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col-reverse gap-0.5">
                  <dt className="text-xs text-[var(--tile-subtle)]">{stat.label}</dt>
                  <dd className="truncate text-sm font-semibold text-[var(--tile-text)]">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {isInsightLoading || isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <InsightCard title={t("Ruh Hali Gözlemi", "Mood Observation")} message={insightMessage} />
          )}
          {/* Telefonda sol sütun "contents" olur, trend order-last ile takvimin altına iner. */}
          <div className="order-last lg:order-none">
              <Card>
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Trend", "Trend")}</h2>
                <p className="mb-4 text-sm text-zinc-500">{t("Son 90 gün", "Last 90 days")}</p>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : history.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t("Kayıt ekledikçe trend burada görünecek.", "Your trend will appear here as you log.")}</p>
                ) : (
                  <MoodTrendChart history={history} />
                )}
              </Card>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Takvim", "Calendar")}</h2>
            <p className="mb-4 text-sm text-zinc-500">{t("Son 90 gün, haftalara göre", "Last 90 days, by week")}</p>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : history.length === 0 ? (
              <EmptyState
                icon={<HeartPulse className="h-8 w-8" />}
                message={t(
                  "Henüz ruh hali kaydı yok. Yukarıdan bugünü seçerek başlayabilirsin.",
                  "No mood logged yet. Start by picking today above."
                )}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
                <div className="flex justify-between gap-1.5">
                  {DAY_LABELS[language].map((label) => (
                    <span
                      key={label}
                      className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {weeks.map((week) => (
                  <div key={week.weekStartIso} className="flex justify-between gap-1.5">
                    {week.days.map((entry, i) => {
                      const dateIso = addDaysIso(week.weekStartIso, i);
                      const option = entry ? MOOD_OPTIONS[entry.mood_key] : null;
                      const future = dateIso > today;
                      const isToday = dateIso === today;
                      return (
                        <div
                          key={dateIso}
                          title={
                            formatDate(dateIso, language, { day: "2-digit", month: "long" }) +
                            (option ? `: ${option.label}` : "") +
                            (isToday ? ` (${t("bugün", "today")})` : "")
                          }
                          style={entry ? { background: tint(entry.mood_key) } : undefined}
                          className={
                            "flex aspect-square flex-1 items-center justify-center rounded-[10px] " +
                            (entry
                              ? ""
                              : future
                                ? "border border-dashed border-[var(--border-subtle)]"
                                : "border border-[var(--border-subtle)] bg-black/[0.05] dark:bg-white/[0.06]") +
                            (isToday ? " ring-2 ring-[var(--tone-accent)]" : "")
                          }
                        >
                          {option ? (
                            <span className="text-[17px] leading-none lg:text-[22px]">{option.emoji}</span>
                          ) : (
                            <span
                              className={
                                "text-xs " +
                                (isToday ? "font-bold text-[var(--tone-accent)]" : future ? "text-zinc-500 opacity-50" : "text-zinc-500")
                              }
                            >
                              {new Date(`${dateIso}T00:00:00`).getDate()}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="flex gap-[3px]" aria-hidden="true">
                    {MOOD_KEYS.map((key) => (
                      <span key={key} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: tint(key) }} />
                    ))}
                  </div>
                  <span className="text-xs text-zinc-500">{t("Ton, Zor'dan Harika'ya doğru koyulaşır", "Shade deepens from Tough to Great")}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
