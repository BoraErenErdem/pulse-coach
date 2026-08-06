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
  type Profile,
  type ProgressLog,
  type Trends,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
function correlationInsightText(correlation: number | null): string {
  if (correlation === null) {
    return "Anlamlı bir örüntü görebilmek için en az 4 haftalık hem ruh hali hem antrenman kaydı gerekiyor.";
  }
  if (correlation >= 0.3) {
    return `Antrenman yaptığın haftalarda ruh halin genelde daha iyi görünüyor (korelasyon: ${correlation.toFixed(2)}). Bu bir nedensellik kanıtı değil, sadece gözlemlenen bir örüntü.`;
  }
  if (correlation <= -0.3) {
    return `Bu dönemde antrenman günleri arttıkça ruh halinin daha düşük göründüğü bir örüntü var (korelasyon: ${correlation.toFixed(2)}) — başka etkenler (ör. yorgunluk, program yoğunluğu) rol oynuyor olabilir.`;
  }
  return `Antrenman günleri ile ruh halin arasında belirgin bir örüntü görünmüyor (korelasyon: ${correlation.toFixed(2)}).`;
}

function weightHint(summary: WeeklySummary | null): string | undefined {
  if (!summary || summary.weight_start === null || summary.weight_end === null) return undefined;
  if (summary.weight_start === summary.weight_end) return "Bu hafta değişmedi";
  return `${summary.weight_start} kg'dan ${summary.weight_end} kg'a`;
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
function weightGoalRemainingText(current: number, target: number): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return "— hedefine ulaştın!";
  if (diff > 0) return `(${diff.toFixed(1)} kg vermen gerekiyor)`;
  return `(${Math.abs(diff).toFixed(1)} kg alman gerekiyor)`;
}

export default function ProgressPage() {
  const { token } = useAuth();
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!weight) {
      setFormError("Kaydetmek için bir kilo değeri girmelisin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, { weight: Number(weight), workout_completed: false });
      setFormSuccess("Kaydedildi!");
      setWeight("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-7">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">İlerleme</h1>

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
            label="Güncel Kilo"
            value={summary?.weight_end !== null && summary?.weight_end !== undefined ? `${summary.weight_end} kg` : "—"}
            hint={weightHint(summary)}
            icon={<Scale className="h-4 w-4" />}
            seriesVar="--series-1"
          />
          <StatTile
            label="Bu Hafta Antrenman"
            value={String(summary?.workout_count ?? 0)}
            icon={<Dumbbell className="h-4 w-4" />}
            seriesVar="--series-2"
          />
          <StatTile
            label="Bu Hafta Kayıt"
            value={String(summary?.log_count ?? 0)}
            icon={<ClipboardList className="h-4 w-4" />}
            seriesVar="--series-3"
          />
          <StatTile
            label="Seri"
            value={`${summary?.streak_weeks ?? 0} hafta`}
            hint={
              (summary?.streak_weeks ?? 0) >= 2
                ? "üst üste düzenli!"
                : (summary?.streak_weeks ?? 0) === 1
                  ? "bu hafta başladın"
                  : undefined
            }
            icon={<Flame className="h-4 w-4" />}
            seriesVar="--series-5"
          />
        </div>
      )}

      {!isLoading && summary ? (
        summary.log_count > 0 ? (
          <InsightCard title="Bu Haftaki İçgörün" message={summary.summary_text} />
        ) : (
          <InfoBanner message="Henüz bu hafta bir kayıt yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin." />
        )
      ) : null}

      {!isLoading && profile?.target_weight_kg && currentWeightOf(logs) !== null ? (
        <Card>
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Kilo Hedefi
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Hedef: <span className="font-medium text-zinc-900 dark:text-zinc-50">{profile.target_weight_kg} kg</span>
            {" — "}Şu an: <span className="font-medium text-zinc-900 dark:text-zinc-50">{currentWeightOf(logs)} kg</span>
            {" "}
            {weightGoalRemainingText(currentWeightOf(logs) ?? 0, profile.target_weight_kg)}
          </p>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Kilo Kaydet
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div>
            <Label htmlFor="weight">Kilo (kg)</Label>
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
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Kilo Trendi
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WeightChart logs={logs} />}
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Aylar Arası Trend
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.
        </p>
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <>
            <TrendCorrelationChart points={trends?.points ?? []} />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              {correlationInsightText(trends?.mood_workout_correlation ?? null)}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
