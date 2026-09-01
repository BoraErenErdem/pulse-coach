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
import { useAsyncResource } from "@/lib/use-async-resource";
import { groupEntriesByWeek } from "@/lib/date-grouping";
import { Card, EmptyState, ErrorBanner, InsightCard, Skeleton } from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/MoodTrendChart";

const DAY_LABELS: Record<"tr" | "en", string[]> = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function formatDate(isoDate: string, language: PreferredLanguage, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(language === "en" ? "en-US" : "tr-TR", options);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isFutureDate(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d.getTime() > t.getTime();
}

export default function MoodHistoryPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [insight, setInsight] = useState<MoodInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

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

  // İçgörü (LLM yorumu) BİLEREK ayrı/gecikmeli yükleniyor - grafik/ızgara
  // anında görünsün, LLM'in birkaç saniyesi kullanıcıyı beklemesin (bkz.
  // backend GET /mood/insight endpoint yorumu, exercise_insight ile aynı
  // desen). Yeterli sinyal yoksa backend hiç LLM çağırmadan hızlıca
  // message: null döner, bu yüzden veri yokken de çağırmak güvenli.
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

      {/* Kullanıcı bulgusu (2026-08-23, mobilde bulundu): "insufficient_data"
          için (ör. az/eski kayıt) LLM hiç çağrılmıyor - bu yüzden
          getMoodInsight() genelde getMoodHistory()'den ÖNCE döner. Sadece
          `isInsightLoading`'e bakınca, insight erken bittiğinde ama `history`
          HÂLÂ [] iken alttaki `history.length > 0` koşulu yanlışlıkla false
          oluyordu - iskelet önce görünüp SONRA hiçbir şeye düşüyordu.
          `isLoading`'i de bekleterek history'nin KESİN son haline
          ulaşmasını garantiliyoruz. */}
      {isInsightLoading || isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : insight?.status === "ready" && insight.message ? (
        <InsightCard title={t("Ruh Hali Gözlemi", "Mood Observation")} message={insight.message} />
      ) : insight?.status === "insufficient_data" && history.length > 0 ? (
        // Zaten kayıt var ama içgörü için henüz yetersiz - bu durumu Haftalık
        // Görünüm'ün "hiç kayıt yok" EmptyState'iyle KARIŞTIRMAMAK için ayrı,
        // daha sade bir not (o zaten kayıt=0 iken görünüyor, burası kayıt>0
        // ama sinyal=insufficient iken).
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
          <HeartPulse className="h-4 w-4 shrink-0" />
          <span>
            {t(
              "Henüz yeterli veri yok - ruh halini bir-iki hafta daha düzenli kaydettikçe burada kişisel bir gözlem göreceksin.",
              "Not enough data yet - keep logging your mood regularly for a week or two and a personal observation will appear here."
            )}
          </span>
        </div>
      ) : insight?.status === "no_signal" ? (
        // Yeterli veri var AMA dikkat çekici bir eğilim/örüntü yok -
        // önceden bu durumda kart TAMAMEN gizleniyordu, bu "uygulama
        // çalışmıyor" hissi veriyordu (kullanıcı bulgusu, 2026-08-23).
        // Kural-tabanlı, SABİT bir metin - LLM çağrılmıyor (no_signal'da
        // LLM'e hiç gidilmemesi BİLEREK korundu, bkz. routers/mood.py).
        <InsightCard
          title={t("Ruh Hali Gözlemi", "Mood Observation")}
          message={t(
            "Şu an belirgin bir eğilim ya da örüntü yok - ruh halin dengeli görünüyor.",
            "No clear trend or pattern right now - your mood looks steady."
          )}
        />
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Haftalık Görünüm", "Weekly View")}
        </h2>
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
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between gap-1">
              {DAY_LABELS[language].map((label) => (
                <span
                  key={label}
                  className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {label}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week.weekStartIso} className="flex justify-between gap-1">
                {week.days.map((entry, i) => {
                  const dateIso = addDaysIso(week.weekStartIso, i);
                  const option = entry ? MOOD_OPTIONS[entry.mood_key] : null;
                  const future = isFutureDate(dateIso);
                  return (
                    <div
                      key={dateIso}
                      title={
                        formatDate(dateIso, language, { day: "2-digit", month: "long" }) +
                        (option ? `: ${option.label}` : "")
                      }
                      className={
                        "flex aspect-square flex-1 items-center justify-center rounded-lg text-sm " +
                        (option
                          ? "bg-[var(--accent)]/15"
                          : future
                            ? "bg-transparent"
                            : "border border-[var(--border-subtle)] bg-[var(--surface-muted)]")
                      }
                    >
                      {option ? (
                        <span className="text-base leading-none">{option.emoji}</span>
                      ) : (
                        <span className={"text-[11px] " + (future ? "text-[var(--border-strong)]" : "text-zinc-500")}>
                          {new Date(`${dateIso}T00:00:00`).getDate()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
