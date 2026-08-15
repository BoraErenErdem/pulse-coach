"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChartNoAxesCombined, Trophy } from "lucide-react";
import {
  ApiError,
  getExerciseHistory,
  getExerciseInsight,
  type ExerciseHistory,
  type ExerciseHistoryEntry,
  type ExercisePeriodStat,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { useLanguage, useT } from "@/lib/language-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { Card, EmptyState, ErrorBanner, InsightCard, SecondaryButton, Skeleton } from "@/components/ui";

type Period = "weekly" | "monthly";

// "Tüm Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel olarak
// bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - bu ekranda önceden
// HİÇ limit/offset yoktu, en riskli noktaydı (sık yapılan bir egzersiz için
// liste sınırsız büyüyordu). Kademeli yükleme + gün başlıklarına gruplama
// (Progress/Workouts/Nutrition ile AYNI desen).
const HISTORY_PAGE_SIZE = 20;

function formatDate(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function periodRangeText(stat: ExercisePeriodStat, language: PreferredLanguage): string {
  return `${formatDate(stat.period_start, language)} – ${formatDate(stat.period_end, language)}`;
}

function bestSetText(stat: ExercisePeriodStat, t: (tr: string, en: string) => string): string {
  if (stat.top_weight_kg !== null) {
    return t(`${stat.top_weight_kg} kg × ${stat.top_weight_reps} tekrar`, `${stat.top_weight_kg} kg × ${stat.top_weight_reps} reps`);
  }
  if (stat.top_weight_reps !== null) {
    return t(`${stat.top_weight_reps} tekrar`, `${stat.top_weight_reps} reps`);
  }
  return t("Veri yok", "No data");
}

function PeriodComparisonCard({
  pair,
  t,
  language,
}: {
  pair: [ExercisePeriodStat, ExercisePeriodStat];
  t: (tr: string, en: string) => string;
  language: PreferredLanguage;
}) {
  const [previous, latest] = pair;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[
        { stat: previous, label: t("Önceki dönem", "Previous period") },
        { stat: latest, label: t("Son dönem", "Latest period") },
      ].map(({ stat, label }, index) => (
        <div
          key={index}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4"
        >
          <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
          <p className="mb-2 text-[11px] text-zinc-400">{periodRangeText(stat, language)}</p>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{bestSetText(stat, t)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {t(`Toplam ${stat.total_sets} set / ${stat.total_reps} tekrar`, `Total ${stat.total_sets} sets / ${stat.total_reps} reps`)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ExerciseHistoryPage() {
  const params = useParams<{ exerciseName: string }>();
  const exerciseName = decodeURIComponent(params.exerciseName);
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();

  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [period, setPeriod] = useState<Period>("weekly");
  const [insight, setInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // "Tüm Kayıtlar" listesi weekly/monthly kıyaslamasından BAĞIMSIZ, sayfalı
  // bir state - `history.weekly`/`history.monthly` backend'de zaten TAM
  // veriden hesaplanıp limit/offset'ten etkilenmiyor (bkz. backend
  // get_exercise_history), bu yüzden burada Progress/Workouts/Nutrition'daki
  // gibi grafik/liste ayrımı sorunu YOK - tek endpoint yeterli.
  const [historyEntries, setHistoryEntries] = useState<ExerciseHistoryEntry[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const { isLoading, error } = useAsyncResource(async () => {
    if (!token) return;
    const data = await getExerciseHistory(token, exerciseName, HISTORY_PAGE_SIZE, 0);
    setHistory(data);
    setHistoryEntries([...data.entries].reverse());
    setHasMoreHistory(data.entries.length === HISTORY_PAGE_SIZE);
    setHistoryOffset(data.entries.length);
  }, [token, exerciseName]);

  async function handleLoadMoreHistory() {
    if (!token) return;
    setIsLoadingMoreHistory(true);
    try {
      const data = await getExerciseHistory(token, exerciseName, HISTORY_PAGE_SIZE, historyOffset);
      const newestFirst = [...data.entries].reverse();
      setHistoryEntries((prev) => [...prev, ...newestFirst]);
      setHasMoreHistory(data.entries.length === HISTORY_PAGE_SIZE);
      setHistoryOffset((prev) => prev + data.entries.length);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  // İçgörü (LLM yorumu) BİLEREK ayrı/gecikmeli yükleniyor - ham veri/grafik
  // anında görünsün, LLM'in birkaç saniyesi kullanıcıyı beklemesin
  // (bkz. backend exercise_insight endpoint yorumu).
  useEffect(() => {
    let cancelled = false;

    function loadInsight() {
      const pair = period === "weekly" ? history?.weekly : history?.monthly;
      if (!token || !pair) {
        setInsight(null);
        return;
      }
      setIsInsightLoading(true);
      getExerciseInsight(token, exerciseName, period)
        .then((result) => {
          if (!cancelled) setInsight(result.message);
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
  }, [token, exerciseName, period, history]);

  const activePair = history ? (period === "weekly" ? history.weekly : history.monthly) : null;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <Link
          href="/workouts"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("Antrenman", "Workouts")}
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{exerciseName}</h1>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !history ? null : (
        <>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {t("Kendi Geçmişinle Kıyasla", "Compare With Your Own History")}
              </h2>
              <div className="inline-flex rounded-lg border border-[var(--border-strong)] p-1">
                {(["weekly", "monthly"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPeriod(option)}
                    disabled={isInsightLoading}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      period === option ? "bg-accent-solid text-on-accent-solid" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {option === "weekly" ? t("Haftalık", "Weekly") : t("Aylık", "Monthly")}
                  </button>
                ))}
              </div>
            </div>

            {activePair ? (
              <PeriodComparisonCard pair={activePair} t={t} language={language} />
            ) : (
              <EmptyState
                icon={<ChartNoAxesCombined className="h-8 w-8" />}
                message={t(
                  "Kıyaslama için henüz yeterli veri yok - bu egzersizi en az iki farklı dönemde loglaman gerekiyor.",
                  "Not enough data to compare yet - you need to log this exercise in at least two different periods."
                )}
              />
            )}

            {activePair ? (
              <div className="mt-4">
                {isInsightLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : insight ? (
                  <InsightCard title={t("Koçunun Yorumu", "Your Coach's Take")} message={insight} />
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Tüm Kayıtlar", "All Entries")}
            </h2>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            <div className="space-y-4">
              {groupEntriesByDate(historyEntries, (entry) => entry.session_date, language).map((group) => (
                <div key={group.label}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {group.label}
                  </h3>
                  <div className="space-y-1.5">
                    {group.items.map((entry, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-100">
                          {entry.is_personal_record ? <Trophy className="h-3.5 w-3.5 text-accent" /> : null}
                          {entry.weight_kg !== null
                            ? t(`${entry.weight_kg} kg × ${entry.reps} tekrar`, `${entry.weight_kg} kg × ${entry.reps} reps`)
                            : t(`${entry.reps} tekrar`, `${entry.reps} reps`)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {hasMoreHistory ? (
                <SecondaryButton onClick={handleLoadMoreHistory} disabled={isLoadingMoreHistory} className="w-full">
                  {isLoadingMoreHistory ? t("Yükleniyor...", "Loading...") : t("Daha Fazla Göster", "Show More")}
                </SecondaryButton>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
