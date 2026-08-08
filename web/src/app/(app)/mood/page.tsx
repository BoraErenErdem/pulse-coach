"use client";

import { useCallback, useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import { ApiError, getMoodHistory, type MoodKey, type MoodLog, type PreferredLanguage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/MoodTrendChart";

function formatDate(isoDate: string, language: PreferredLanguage): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function MoodHistoryPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const MOOD_OPTIONS: Record<MoodKey, { emoji: string; label: string }> = {
    zor: { emoji: "😔", label: t("Zor", "Tough") },
    dusuk: { emoji: "😕", label: t("Düşük", "Low") },
    notr: { emoji: "🙂", label: t("Nötr", "Neutral") },
    iyi: { emoji: "😊", label: t("İyi", "Good") },
    harika: { emoji: "🤩", label: t("Harika", "Great") },
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await getMoodHistory(token, 90);
      setHistory(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    async function initialLoad() {
      await loadData();
    }
    initialLoad();
  }, [loadData]);

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Ruh Hali", "Mood")}</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Son 90 Gün Trend", "Last 90 Days Trend")}
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <MoodTrendChart history={history} />}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{t("Geçmiş Kayıtlar", "History")}</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : history.length === 0 ? (
          <EmptyState
            icon={<HeartPulse className="h-8 w-8" />}
            message={t(
              "Henüz ruh hali kaydı yok. Sohbet sayfasındaki mod seçiciyi kullandıkça burada listelenecek.",
              "No mood logged yet. Entries will appear here as you use the mood picker on the chat page."
            )}
          />
        ) : (
          <div className="space-y-1.5">
            {[...history].reverse().map((entry) => {
              const option = MOOD_OPTIONS[entry.mood_key];
              return (
                <div
                  key={entry.log_date}
                  className="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
                >
                  <span className="text-lg">{option?.emoji ?? "🙂"}</span>
                  <span className="text-zinc-700 dark:text-zinc-200">{formatDate(entry.log_date, language)}</span>
                  <span className="text-zinc-500">— {option?.label ?? entry.mood_key}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
