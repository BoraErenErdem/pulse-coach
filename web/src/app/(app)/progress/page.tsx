"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  type ProgressLog,
  type Trends,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { formatPercent, toLocaleUpper } from "@/lib/format";
import { WORKOUT_TYPE_LABELS } from "@/lib/labels";
import { buildWeeklyInsightMessage, correlationInsightText, currentWeightOf, weightHint } from "@/lib/progress-insights";
import {
  Card,
  FormCard,
  EmptyState,
  IconButton,
  ErrorBanner,
  InfoBanner,
  InsightCard,
  Label,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  StatTile,
  StreakDots,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { BodyMetricsPanel, MonthlyTrendPanel } from "@/components/charts/progress-panels";
import { GoalsOverviewCard } from "@/components/GoalsOverviewCard";

// 2026-08-06 (Faz B): "Bugün antrenman yaptım" checkbox'ı + "Antrenman Türü
// Dağılımı" grafiği kaldırıldı - Antrenman sayfasındaki gerçek set/oturum
// kaydıyla bağımsız ve zayıf bir kopyası gibi duruyordu (kullanıcı bulgusu).
// Form artık SADECE kilo girişi; tür dağılımı grafiği Antrenman sayfasına
// taşındı (WorkoutSession bazlı, daha doğru).

// "Geçmiş Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel
// olarak bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - kademeli
// yükleme (sayfa başına bu kadar kayıt) + gün başlıklarına gruplama.
const HISTORY_PAGE_SIZE = 20;

export default function ProgressPage() {
  const { token } = useAuth();
  const router = useRouter();
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

  // "Geçmiş Kayıtlar" listesi için BAĞIMSIZ, sayfalı bir veri akışı -
  // grafikleri besleyen `logs`/`getProgressLogs(token, 90)` çağrısından
  // KASITLI OLARAK ayrı tutuluyor (2026-08-14, kullanıcı isteği: uzun
  // listeler görsel olarak bunaltıcıydı). `logs`'u limit'e çevirmek
  // Vücut Trendi'nin 90 günlük grafiğini kırardı.
  const [historyItems, setHistoryItems] = useState<ProgressLog[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  async function loadHistoryPage(offset: number, replace: boolean) {
    if (!token) return;
    const page = await getProgressLogs(token, undefined, HISTORY_PAGE_SIZE, offset, true);
    const newestFirst = [...page].reverse();
    setHistoryItems((prev) => (replace ? newestFirst : [...prev, ...newestFirst]));
    setHasMoreHistory(page.length === HISTORY_PAGE_SIZE);
    setHistoryOffset(offset + page.length);
  }

  async function handleLoadMoreHistory() {
    setIsLoadingMoreHistory(true);
    try {
      await loadHistoryPage(historyOffset, false);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  const { isLoading, error: loadError, refresh: loadData } = useAsyncResource(async () => {
    if (!token) return;
    const [summaryData, logsData, trendsData, bodyCompData] = await Promise.all([
      getWeeklySummary(token),
      getProgressLogs(token, 90),
      getTrends(token, 12),
      getBodyCompositionInsight(token),
      loadHistoryPage(0, true),
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
  // Artık `historyItems`'tan türetiliyor (grafiklerin kaynağı `logs`'tan
  // BAĞIMSIZ) - zaten en-yeni-önce sırada, reverse() gerekmiyor.
  // Bu filtre artık SADECE savunma katmanı - asıl filtreleme backend'e
  // taşındı (`getProgressLogs(..., measurementsOnly=true)`, bkz.
  // loadHistoryPage) çünkü SADECE burada, frontend'de filtrelemek "limit'in
  // İÇİNDEKİ ham kayıtların çoğu antrenman-işaretliyse gösterilen sayı
  // limit'ten az çıkar" tutarsızlığına yol açıyordu (2026-08-14, kullanıcı
  // canlı telefon testinde yakaladı: sayfa boyutu küçültülünce "1 kayıt
  // var" görünüp "Daha Fazla Göster"e basınca birden 5 kayıt gelmesi).
  const measurementLogs = historyItems.filter((log) => log.weight !== null || log.waist_cm !== null || log.body_fat_pct !== null);
  const currentWeight = currentWeightOf(logs);
  const streakDays = summary?.streak_days ?? 0;
  const workoutTypeLines = Object.entries(summary?.workout_types ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${(WORKOUT_TYPE_LABELS[language] as Record<string, string>)[type] ?? type}: ${count}`);
  const bodyGoals = {
    weight: profile?.target_weight_kg ?? null,
    waist: profile?.target_waist_cm ?? null,
    fat: profile?.target_body_fat_pct ?? null,
  };

  // Masaüstü düzeni (2026-10-08, "kopuk" bulgusu): sayfa mobildeki SIRAYLA bantlardan oluşur;
  // her bant ya tam genişlik ya da dengeli iki yarı. Kutular tek sırada 4'lü; Hedefler + koç
  // yorumu + form solda, Vücut Trendi sağda; Aylar Arası ve Geçmiş tam genişlik.
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("İlerleme", "Progress")}</h1>
      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[124px] rounded-[20px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label={t("Güncel Kilo", "Current Weight")}
            // Bu hafta kilo kaydı yoksa haftalık özet null döner - son bilinen kiloya düş (mobil).
            value={summary?.weight_end != null ? `${summary.weight_end} kg` : currentWeight !== null ? `${currentWeight} kg` : "—"}
            hint={weightHint(summary, language)}
            icon={<Scale className="h-4 w-4" />}
            identity="weight"
          />
          <StatTile
            label={t("Son 7 Gün Antrenman", "Workouts (7d)")}
            value={String(summary?.workout_count ?? 0)}
            icon={<Dumbbell className="h-4 w-4" />}
            identity="workout"
          />
          <StatTile
            label={t("Son 7 Gün Kayıt", "Entries (7d)")}
            value={String(summary?.log_count ?? 0)}
            icon={<ClipboardList className="h-4 w-4" />}
            identity="entries"
          />
          <StatTile
            label={t("Seri", "Streak")}
            value={String(streakDays)}
            accessory={<StreakDots count={streakDays} />}
            hint={streakDays > 0 ? t("gün üst üste", "days in a row") : t("ruh halini işaretle, başlasın", "log your mood to start")}
            icon={<Flame className="h-4 w-4" />}
            identity="streak"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {!isLoading ? <GoalsOverviewCard logs={logs} profile={profile} /> : null}

          {!isLoading && summary ? (
            summary.log_count > 0 ? (
              <InsightCard
                title={t("Son 7 Günün İçgörüsü", "Your Last 7 Days Insight")}
                message={buildWeeklyInsightMessage(summary.summary_text, workoutTypeLines, language)}
              />
            ) : (
              <InfoBanner
                message={t(
                  "Henüz bu hafta bir kayıt yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No entry logged this week yet. You can add your first entry using the form below."
                )}
              />
            )
          ) : null}

          {!isLoading && bodyCompositionInsight ? (
            <InsightCard title={t("Vücut Kompozisyonu İçgörün", "Your Body Composition Insight")} message={bodyCompositionInsight} />
          ) : null}

          <FormCard title={t("Kilo Kaydet", "Log Weight")}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
              {formError ? <ErrorBanner message={formError} /> : null}
              {/* Mobil yerleşim: üstte Kilo | Vücut Yağ, altta Bel Çevresi. */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weight">{t("Kilo (kg)", "Weight (kg)")}</Label>
                  <TextInput id="weight" type="number" min={0} max={500} step={0.1} placeholder={t("ör. 78.5", "e.g. 78.5")} value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="bodyFatPct">{t("Vücut Yağ (%)", "Body Fat (%)")}</Label>
                  <TextInput id="bodyFatPct" type="number" min={0} max={100} step={0.1} placeholder={t("opsiyonel", "optional")} value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="waistCm">{t("Bel Çevresi (cm)", "Waist (cm)")}</Label>
                  <TextInput id="waistCm" type="number" min={0} max={300} step={0.1} placeholder={t("opsiyonel", "optional")} value={waistCm} onChange={(e) => setWaistCm(e.target.value)} />
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
              <PrimaryButton type="submit" disabled={isSubmitting} className="w-full">
                <Save className="h-4 w-4" />
                {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </form>
          </FormCard>
        </div>

        <Card>
          <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Vücut Trendi", "Body Trends")}</h2>
          {isLoading ? <Skeleton className="h-80 w-full" /> : <BodyMetricsPanel logs={logs} goals={bodyGoals} onEditGoal={() => router.push("/goals")} />}
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Aylar Arası Trend", "Trend Over Months")}</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-500">
          {t("Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.", "The weekly pattern of mood and workout days over the last 12 weeks.")}
        </p>
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <MonthlyTrendPanel
            points={trends?.points ?? []}
            note={
              <p className="rounded-[14px] bg-[var(--pc-box)] px-3.5 py-3 text-[13px] leading-relaxed text-zinc-700 dark:text-white/90">
                {correlationInsightText(trends?.mood_workout_correlation ?? null, language)}
              </p>
            }
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Geçmiş Kayıtlar", "History")}</h2>
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
          <div className="space-y-4">
            {groupEntriesByDate(measurementLogs, (log) => log.log_date, language).map((group) => (
              <div key={group.label}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500">{toLocaleUpper(group.label, language)}</h3>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((log) => (
                    <div key={log.id} className="flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] bg-[var(--pc-box)] px-3.5 py-2">
                      {editingLogId === log.id ? (
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          <TextInput type="number" step={0.1} placeholder="kg" aria-label={t("Kilo (kg)", "Weight (kg)")} value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="w-20" />
                          <TextInput type="number" step={0.1} placeholder="cm" aria-label={t("Bel Çevresi (cm)", "Waist (cm)")} value={editWaistCm} onChange={(e) => setEditWaistCm(e.target.value)} className="w-20" />
                          <TextInput type="number" step={0.1} placeholder="%" aria-label={t("Vücut Yağ (%)", "Body Fat (%)")} value={editBodyFatPct} onChange={(e) => setEditBodyFatPct(e.target.value)} className="w-16" />
                          <IconButton label={t("Kaydet", "Save")} onClick={() => handleSaveLog(log.id)} className="hover:text-green-600 dark:hover:text-green-400">
                            <Check className="h-4 w-4" />
                          </IconButton>
                          <IconButton label={t("Vazgeç", "Cancel")} onClick={() => setEditingLogId(null)} className="hover:text-red-600 dark:hover:text-red-400">
                            <X className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ) : (
                        <>
                          {/* Mobil: değerler etiketli mini sütunlar ("83 kg / Kilo"). */}
                          <div className="flex gap-5">
                            {log.weight != null ? <EntryMetric value={`${log.weight} kg`} caption={t("Kilo", "Weight")} /> : null}
                            {log.waist_cm != null ? <EntryMetric value={`${log.waist_cm} cm`} caption={t("Bel", "Waist")} /> : null}
                            {log.body_fat_pct != null ? <EntryMetric value={formatPercent(log.body_fat_pct, language)} caption={t("Yağ", "Fat")} /> : null}
                          </div>
                          <div className="flex items-center">
                            <IconButton label={t("Kaydı düzenle", "Edit entry")} onClick={() => handleStartEditLog(log)} className="hover:text-[var(--tone-accent)]">
                              <Pencil className="h-[15px] w-[15px]" />
                            </IconButton>
                            <IconButton label={t("Kaydı sil", "Delete entry")} onClick={() => handleDeleteLog(log.id)} className="hover:text-red-600 dark:hover:text-red-400">
                              <Trash2 className="h-[15px] w-[15px]" />
                            </IconButton>
                          </div>
                        </>
                      )}
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
        )}
      </Card>
    </div>
  );
}

function EntryMetric({ value, caption }: { value: string; caption: string }) {
  return (
    <div>
      <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-zinc-500">{caption}</p>
    </div>
  );
}
