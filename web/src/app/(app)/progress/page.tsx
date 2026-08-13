"use client";

import { useState, type FormEvent } from "react";
import { Check, ClipboardList, Dumbbell, Flame, Pencil, Save, Scale, Trash2, X } from "lucide-react";
import {
  ApiError,
  deleteProgressLog,
  getBodyCompositionInsight,
  getProgressLogs,
  getTrends,
  getWeeklySummary,
  logProgress,
  updateProgressLog,
  type PreferredLanguage,
  type ProgressLog,
  type Trends,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import {
  Card,
  EmptyState,
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
import { BodyFatChart } from "@/components/charts/BodyFatChart";
import { TrendCorrelationChart } from "@/components/charts/TrendCorrelationChart";
import { WaistChart } from "@/components/charts/WaistChart";
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
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç raporu, bulgu #7).
  const { profile } = useProfile();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);

  const [weight, setWeight] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [bodyCompositionInsight, setBodyCompositionInsight] = useState<string | null>(null);
  const {
    isSubmitting,
    error: formError,
    success: formSuccess,
    setError: setFormError,
    setSuccess: setFormSuccess,
    resetMessages: resetFormMessages,
    submit,
  } = useFormSubmit();

  // Geçmiş kayıtlar (düzenle/sil) - 2026-08-11 kullanıcı bulgusu: bu sayfada
  // ÖNCEDEN hiç kayıt listesi yoktu, sadece grafik vardı - yanlış girilen
  // bir kilo/bel/yağ kaydını düzeltmenin/silmenin yolu hiç yoktu (Antrenman/
  // Beslenme sayfalarının "Geçmiş Kayıtlar" kartının aksine).
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editWaistCm, setEditWaistCm] = useState("");
  const [editBodyFatPct, setEditBodyFatPct] = useState("");

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const [summaryData, logsData, trendsData, bodyCompData] = await Promise.all([
      getWeeklySummary(token),
      getProgressLogs(token, 90),
      getTrends(token, 12),
      getBodyCompositionInsight(token),
    ]);
    setSummary(summaryData);
    setLogs(logsData);
    setTrends(trendsData);
    setBodyCompositionInsight(bodyCompData.message);
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    resetFormMessages();

    if (!weight) {
      setFormError(t("Kaydetmek için bir kilo değeri girmelisin.", "You need to enter a weight value to save."));
      return;
    }

    await submit(async () => {
      await logProgress(token, {
        weight: Number(weight),
        waist_cm: waistCm ? Number(waistCm) : undefined,
        body_fat_pct: bodyFatPct ? Number(bodyFatPct) : undefined,
        workout_completed: false,
      });
      setFormSuccess(t("Kaydedildi!", "Saved!"));
      setWeight("");
      setWaistCm("");
      setBodyFatPct("");
      await loadData();
    });
  }

  function handleStartEditLog(log: ProgressLog) {
    setEditingLogId(log.id);
    setEditWeight(log.weight != null ? String(log.weight) : "");
    setEditWaistCm(log.waist_cm != null ? String(log.waist_cm) : "");
    setEditBodyFatPct(log.body_fat_pct != null ? String(log.body_fat_pct) : "");
    setHistoryError(null);
  }

  async function handleSaveLog(logId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      const updated = await updateProgressLog(token, logId, {
        weight: editWeight ? Number(editWeight) : undefined,
        waist_cm: editWaistCm ? Number(editWaistCm) : undefined,
        body_fat_pct: editBodyFatPct ? Number(editBodyFatPct) : undefined,
      });
      setLogs((prev) => prev.map((l) => (l.id === logId ? updated : l)));
      setEditingLogId(null);
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    }
  }

  async function handleDeleteLog(logId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteProgressLog(token, logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  // Sadece kilo/bel/yağ oranından en az biri girilmiş kayıtlar - sohbetten
  // gelen SADECE antrenman-işaretli satırlar (weight/waist/fat hepsi null)
  // burada gösterilmiyor, o veri zaten Antrenman sayfasında kendi başına var.
  const measurementLogs = logs.filter((log) => log.weight !== null || log.waist_cm !== null || log.body_fat_pct !== null);

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

      {/* Sadece anlamlı bir sapma tespit edilirse görünür (bkz.
          get_body_composition_insight) - veri desteklemedikçe hiç render
          edilmez (2026-08-11, kullanıcı isteği). */}
      {!isLoading && bodyCompositionInsight ? (
        <InsightCard
          title={t("Vücut Kompozisyonu İçgörün", "Your Body Composition Insight")}
          message={bodyCompositionInsight}
        />
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="waistCm">{t("Bel Çevresi (cm)", "Waist (cm)")}</Label>
              <TextInput
                id="waistCm"
                type="number"
                min={0}
                max={300}
                step={0.1}
                placeholder={t("opsiyonel", "optional")}
                value={waistCm}
                onChange={(e) => setWaistCm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bodyFatPct">{t("Vücut Yağ (%)", "Body Fat (%)")}</Label>
              <TextInput
                id="bodyFatPct"
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder={t("opsiyonel", "optional")}
                value={bodyFatPct}
                onChange={(e) => setBodyFatPct(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 text-xs text-zinc-500">
            <p>
              {t(
                "Bel çevresi: mezuranın nasıl tutulduğuna, gün içindeki saate ve şişkinlik/sıvı durumuna göre değişkenlik gösterebilir.",
                "Waist: can vary based on how the tape is held, the time of day, and bloating/fluid retention."
              )}
            </p>
            <p>
              {t(
                "Vücut yağ oranı: özellikle ev tipi ölçüm cihazları (BIA'lı tartılar) hidrasyon durumuna oldukça duyarlıdır, günden güne birkaç puan oynayabilir.",
                "Body fat %: home devices (BIA-based scales) in particular are quite sensitive to hydration status and can shift by a few points day to day."
              )}
            </p>
          </div>

          <PrimaryButton type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Geçmiş Kayıtlar", "History")}
        </h2>
        {historyError ? <ErrorBanner message={historyError} /> : null}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : measurementLogs.length === 0 ? (
          <EmptyState
            icon={<Scale className="h-8 w-8" />}
            message={t(
              "Henüz bir kilo/bel/yağ oranı kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
              "No weight/waist/body fat entry yet. You can add your first entry using the form above."
            )}
          />
        ) : (
          <div className="space-y-1.5">
            {[...measurementLogs].reverse().map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {editingLogId === log.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <TextInput
                      type="number"
                      step={0.1}
                      placeholder={t("kg", "kg")}
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      className="w-20"
                    />
                    <TextInput
                      type="number"
                      step={0.1}
                      placeholder={t("cm", "cm")}
                      value={editWaistCm}
                      onChange={(e) => setEditWaistCm(e.target.value)}
                      className="w-20"
                    />
                    <TextInput
                      type="number"
                      step={0.1}
                      placeholder="%"
                      value={editBodyFatPct}
                      onChange={(e) => setEditBodyFatPct(e.target.value)}
                      className="w-16"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveLog(log.id)}
                      className="text-zinc-400 transition-colors hover:text-green-600 dark:hover:text-green-400"
                      aria-label={t("Kaydet", "Save")}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingLogId(null)}
                      className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      aria-label={t("Vazgeç", "Cancel")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-zinc-700 dark:text-zinc-200">
                      {log.log_date} —{" "}
                      {[
                        log.weight != null ? `${log.weight} kg` : null,
                        log.waist_cm != null ? `${log.waist_cm} cm` : null,
                        log.body_fat_pct != null ? `%${log.body_fat_pct}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditLog(log)}
                        className="text-zinc-400 transition-colors hover:text-accent"
                        aria-label={t("Kaydı düzenle", "Edit entry")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        aria-label={t("Kaydı sil", "Delete entry")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Kilo Trendi", "Weight Trend")}
        </h2>
        {isLoading ? <Skeleton className="h-64 w-full" /> : <WeightChart logs={logs} />}
      </Card>

      {!isLoading && logs.some((log) => log.waist_cm !== null) ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Bel Çevresi Trendi", "Waist Trend")}
          </h2>
          <WaistChart logs={logs} />
        </Card>
      ) : null}

      {!isLoading && logs.some((log) => log.body_fat_pct !== null) ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Vücut Yağ Trendi", "Body Fat Trend")}
          </h2>
          <BodyFatChart logs={logs} />
        </Card>
      ) : null}

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
