"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Dumbbell, Save, Scale } from "lucide-react";
import {
  ApiError,
  WORKOUT_TYPES,
  getProfile,
  getProgressLogs,
  getWeeklySummary,
  logProgress,
  type Profile,
  type ProgressLog,
  type WeeklySummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  ErrorBanner,
  InfoBanner,
  Label,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { WeightChart } from "@/components/charts/WeightChart";
import { WorkoutTypeChart } from "@/components/charts/WorkoutTypeChart";

const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  kuvvet: "Kuvvet",
  kardiyo: "Kardiyo",
  esneklik: "Esneklik",
  karışık: "Karışık",
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wantsWeight, setWantsWeight] = useState(false);
  const [weight, setWeight] = useState("");
  const [wantsWorkout, setWantsWorkout] = useState(false);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("kuvvet");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [summaryData, logsData, profileData] = await Promise.all([
        getWeeklySummary(token),
        getProgressLogs(token, 90),
        getProfile(token),
      ]);
      setSummary(summaryData);
      setLogs(logsData);
      setProfile(profileData);
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

    if (!wantsWeight && !wantsWorkout) {
      setFormError("Kaydetmek için en az kilo ya da antrenman bilgisi seçmelisin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, {
        weight: wantsWeight && weight ? Number(weight) : undefined,
        workout_completed: wantsWorkout,
        workout_type: wantsWorkout ? workoutType : undefined,
      });
      setFormSuccess("Kaydedildi!");
      setWeight("");
      setWantsWeight(false);
      setWantsWorkout(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">İlerleme</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
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
        </div>
      )}

      {!isLoading && summary ? (
        summary.log_count > 0 ? (
          <InfoBanner message={summary.summary_text} />
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
          İlerleme Kaydet
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="flex items-center gap-2">
            <input
              id="wantsWeight"
              type="checkbox"
              checked={wantsWeight}
              onChange={(e) => setWantsWeight(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-accent"
            />
            <Label htmlFor="wantsWeight" className="mb-0">
              Kilo girmek istiyorum
            </Label>
          </div>
          {wantsWeight ? (
            <div className="animate-fade-in-up pl-6">
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
          ) : null}

          <div className="flex items-center gap-2">
            <input
              id="wantsWorkout"
              type="checkbox"
              checked={wantsWorkout}
              onChange={(e) => setWantsWorkout(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-accent"
            />
            <Label htmlFor="wantsWorkout" className="mb-0">
              Bugün antrenman yaptım
            </Label>
          </div>
          {wantsWorkout ? (
            <div className="animate-fade-in-up pl-6">
              <Label htmlFor="workoutType">Antrenman Türü</Label>
              <select
                id="workoutType"
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {WORKOUT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {WORKOUT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <PrimaryButton type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        </form>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Kilo Trendi
          </h2>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <WeightChart logs={logs} />}
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Antrenman Türü Dağılımı
          </h2>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <WorkoutTypeChart logs={logs} />}
        </Card>
      </div>
    </div>
  );
}
