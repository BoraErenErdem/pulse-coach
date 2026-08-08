"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Dumbbell, Flame, Save, Scale } from "lucide-react";
import {
  ApiError,
  getProfile,
  getProgressLogs,
  getTrends,
  getWeeklySummary,
  logProgress,
  type PreferredLanguage,
  type Profile,
  type ProgressLog,
  type Trends,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import {
  Card,
  ErrorBanner,
  InfoBanner,
  InsightCard,
  Label,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { TrendCorrelationChart } from "@/components/charts/TrendCorrelationChart";
import { WeightChart } from "@/components/charts/WeightChart";

// 2026-08-06 (Faz B): "Bugün antrenman yaptım" checkbox'ı + "Antrenman Türü
// Dağılımı" grafiği kaldırıldı - Antrenman sayfasındaki gerçek set/oturum
// kaydıyla bağımsız ve zayıf bir kopyası gibi duruyordu (kullanıcı bulgusu).
// Form artık SADECE kilo girişi; tür dağılımı grafiği Antrenman sayfasına
// taşındı (WorkoutSession bazlı, daha doğru).

/** Korelasyon sayısını, nedensellik iddia etmeyen temkinli bir metne çevirir
 * - küçük örneklemde/gürültülü veride yanlış kesinlik izlenimi vermemek için. */
function correlationInsightText(correlation: number | null, language: PreferredLanguage): string {
  if (correlation === null) {
    return language === "en"
      ? "At least 4 weeks of both mood and workout logs are needed to see a meaningful pattern."
      : "Anlamlı bir örüntü görebilmek için en az 4 haftalık hem ruh hali hem antrenman kaydı gerekiyor.";
  }
  if (correlation >= 0.3) {
    return language === "en"
      ? `Your mood tends to look better in weeks when you work out (correlation: ${correlation.toFixed(2)}). This isn't proof of causation, just an observed pattern.`
      : `Antrenman yaptığın haftalarda ruh halin genelde daha iyi görünüyor (korelasyon: ${correlation.toFixed(2)}). Bu bir nedensellik kanıtı değil, sadece gözlemlenen bir örüntü.`;
  }
  if (correlation <= -0.3) {
    return language === "en"
      ? `There's a pattern in this period where mood looks lower as workout days increase (correlation: ${correlation.toFixed(2)}) — other factors (e.g. fatigue, program intensity) may be at play.`
      : `Bu dönemde antrenman günleri arttıkça ruh halinin daha düşük göründüğü bir örüntü var (korelasyon: ${correlation.toFixed(2)}) — başka etkenler (ör. yorgunluk, program yoğunluğu) rol oynuyor olabilir.`;
  }
  return language === "en"
    ? `There's no clear pattern between workout days and your mood (correlation: ${correlation.toFixed(2)}).`
    : `Antrenman günleri ile ruh halin arasında belirgin bir örüntü görünmüyor (korelasyon: ${correlation.toFixed(2)}).`;
}

function weightHint(summary: WeeklySummary | null, language: PreferredLanguage): string | undefined {
  if (!summary || summary.weight_start === null || summary.weight_end === null) return undefined;
  if (summary.weight_start === summary.weight_end) {
    return language === "en" ? "Unchanged this week" : "Bu hafta değişmedi";
  }
  return language === "en"
    ? `${summary.weight_start} kg to ${summary.weight_end} kg`
    : `${summary.weight_start} kg'dan ${summary.weight_end} kg'a`;
}

function currentWeightOf(logs: ProgressLog[]): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].weight !== null) return logs[i].weight;
  }
  return null;
}

/** Kilo hedefinin yönü (kilo verme mi alma mı) profil hedefine göre değil,
 * doğrudan mevcut/hedef kilo karşılaştırmasına göre belirlenir — böylece
 * kullanıcı "genel hedef" alanını hiç doldurmamış olsa bile doğru çalışır. */
function weightGoalRemainingText(current: number, target: number, language: PreferredLanguage): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return language === "en" ? "— you've reached your goal!" : "— hedefine ulaştın!";
  if (diff > 0) {
    return language === "en" ? `(you need to lose ${diff.toFixed(1)} kg)` : `(${diff.toFixed(1)} kg vermen gerekiyor)`;
  }
  return language === "en"
    ? `(you need to gain ${Math.abs(diff).toFixed(1)} kg)`
    : `(${Math.abs(diff).toFixed(1)} kg alman gerekiyor)`;
}

export default function ProgressPage() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, logsData, profileData, trendsData] = await Promise.all([
        getWeeklySummary(token),
        getProgressLogs(token, 90),
        getProfile(token),
        getTrends(token, 12),
      ]);
      setSummary(summaryData);
      setLogs(logsData);
      setProfile(profileData);
      setTrends(trendsData);
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!weight) {
      setFormError(t("Kaydetmek için bir kilo değeri girmelisin.", "You need to enter a weight value to save."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, { weight: Number(weight), workout_completed: false });
      setFormSuccess(t("Kaydedildi!", "Saved!"));
      setWeight("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("İlerleme", "Progress")}</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t("Güncel Kilo", "Current Weight")}
            value={summary?.weight_end !== null && summary?.weight_end !== undefined ? `${summary.weight_end} kg` : "—"}
            hint={weightHint(summary, language)}
            icon={<Scale className="h-4 w-4" />}
            seriesVar="--series-1"
          />
          <StatTile
            label={t("Bu Hafta Antrenman", "Workouts This Week")}
            value={String(summary?.workout_count ?? 0)}
            icon={<Dumbbell className="h-4 w-4" />}
            seriesVar="--series-2"
          />
          <StatTile
            label={t("Bu Hafta Kayıt", "Entries This Week")}
            value={String(summary?.log_count ?? 0)}
            icon={<ClipboardList className="h-4 w-4" />}
            seriesVar="--series-3"
          />
          <StatTile
            label={t("Seri", "Streak")}
            value={t(`${summary?.streak_weeks ?? 0} hafta`, `${summary?.streak_weeks ?? 0} weeks`)}
            hint={
              (summary?.streak_weeks ?? 0) >= 2
                ? t("üst üste düzenli!", "consistent streak!")
                : (summary?.streak_weeks ?? 0) === 1
                  ? t("bu hafta başladın", "started this week")
                  : undefined
            }
            icon={<Flame className="h-4 w-4" />}
            seriesVar="--series-5"
          />
        </div>
      )}

      {!isLoading && summary ? (
        summary.log_count > 0 ? (
          <InsightCard title={t("Bu Haftaki İçgörün", "Your Insight This Week")} message={summary.summary_text} />
        ) : (
          <InfoBanner
            message={t(
              "Henüz bu hafta bir kayıt yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
              "No entry logged this week yet. You can add your first entry using the form below."
            )}
          />
        )
      ) : null}

      {!isLoading && profile?.target_weight_kg && currentWeightOf(logs) !== null ? (
        <Card>
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Kilo Hedefi", "Weight Goal")}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("Hedef", "Goal")}: <span className="font-medium text-zinc-900 dark:text-zinc-50">{profile.target_weight_kg} kg</span>
            {" — "}
            {t("Şu an", "Now")}: <span className="font-medium text-zinc-900 dark:text-zinc-50">{currentWeightOf(logs)} kg</span>
            {" "}
            {weightGoalRemainingText(currentWeightOf(logs) ?? 0, profile.target_weight_kg, language)}
          </p>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Kilo Kaydet", "Log Weight")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div>
            <Label htmlFor="weight">{t("Kilo (kg)", "Weight (kg)")}</Label>
            <TextInput
              id="weight"
              type="number"
              min={0}
              max={500}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="max-w-[10rem]"
            />
          </div>

          <PrimaryButton type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Kilo Trendi", "Weight Trend")}
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WeightChart logs={logs} />}
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Aylar Arası Trend", "Trend Over Months")}
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          {t("Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.", "The weekly pattern of mood and workout days over the last 12 weeks.")}
        </p>
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <>
            <TrendCorrelationChart points={trends?.points ?? []} />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              {correlationInsightText(trends?.mood_workout_correlation ?? null, language)}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
