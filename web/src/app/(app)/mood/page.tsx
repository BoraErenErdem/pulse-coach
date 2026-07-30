"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getMoodHistory, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, ErrorBanner, Skeleton } from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/MoodTrendChart";

const MOOD_OPTIONS: Record<MoodKey, { emoji: string; label: string }> = {
  zor: { emoji: "😔", label: "Zor" },
  dusuk: { emoji: "😕", label: "Düşük" },
  notr: { emoji: "🙂", label: "Nötr" },
  iyi: { emoji: "😊", label: "İyi" },
  harika: { emoji: "🤩", label: "Harika" },
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function MoodHistoryPage() {
  const { token } = useAuth();
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await getMoodHistory(token, 90);
      setHistory(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function initialLoad() {
      await loadData();
    }
    initialLoad();
  }, [loadData]);

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Ruh Hali</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Son 90 Gün Trend
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <MoodTrendChart history={history} />}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">Geçmiş Kayıtlar</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : history.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Henüz ruh hali kaydı yok. Sohbet sayfasındaki mod seçiciyi kullandıkça burada listelenecek.
          </p>
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
                  <span className="text-zinc-700 dark:text-zinc-200">{formatDate(entry.log_date)}</span>
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
