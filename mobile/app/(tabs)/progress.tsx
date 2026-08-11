import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Check, Pencil, Trash2, X } from "lucide-react-native";
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
import { formatDate, parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  InsightCard,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  colors,
  seriesColors,
} from "@/components/ui";
import { BodyFatChart } from "@/components/charts/body-fat-chart";
import { TrendCorrelationChart } from "@/components/charts/trend-correlation-chart";
import { WaistChart } from "@/components/charts/waist-chart";
import { WeightChart } from "@/components/charts/weight-chart";

// web/src/app/(app)/progress/page.tsx'in mobil portu - Faz M3, chart
// kütüphanesinin ilk canlı testi burada (plan kararı: erken, ekran sayısı azken).
// 2026-08-06 (Faz B): "Bugün antrenman yaptım" checkbox'ı + "Antrenman Türü
// Dağılımı" grafiği kaldırıldı - Antrenman sekmesindeki gerçek set/oturum
// kaydıyla bağımsız ve zayıf bir kopyası gibi duruyordu (kullanıcı bulgusu).
// Form artık SADECE kilo girişi; tür dağılımı grafiği Antrenman sekmesine
// taşındı (WorkoutSession bazlı, daha doğru).
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

export default function ProgressTab() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // profil artık ProfileProvider'dan paylaşımlı - bu ekran ARTIK kendi
  // getProfile çağrısını yapmıyor (2026-08-10 mimari borç raporu, bulgu #7).
  const { profile } = useProfile();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bodyCompositionInsight, setBodyCompositionInsight] = useState<string | null>(null);

  // Geçmiş kayıtlar (düzenle/sil) - 2026-08-11 kullanıcı bulgusu: bu ekranda
  // ÖNCEDEN hiç kayıt listesi yoktu, sadece grafik vardı - yanlış girilen
  // bir kilo/bel/yağ kaydını düzeltmenin/silmenin yolu hiç yoktu (Antrenman/
  // Beslenme sekmelerinin "Geçmiş Kayıtlar" kartının aksine).
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editWaistCm, setEditWaistCm] = useState("");
  const [editBodyFatPct, setEditBodyFatPct] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
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
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  // Diğer sekmelerde (ör. Sohbet'te mood değiştirme) yapılan değişiklikler
  // bu sekmeye geri dönülünce görünsün diye - plain useEffect SADECE ilk
  // mount'ta çalışırdı, tab'lar arası geçişte ekran bellekte kaldığı için
  // veri bayatlıyordu (canlı testte bulundu: mood değiştirip Aylar Arası
  // Trend'e bakınca hiç değişmemiş görünüyordu).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleSubmit() {
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);

    if (!weight) {
      setFormError(t("Kaydetmek için bir kilo değeri girmelisin.", "You need to enter a weight value to save."));
      return;
    }

    // RN'in decimal-pad klavyesi tr-TR yerelinde "," gösteriyor ama Number()
    // "," ile ondalık ayrıştıramıyor (Number("78,5") -> NaN) - web'de HTML
    // input[type=number] bunu otomatik normalize ettiği için hiç görülmeyen,
    // mobile'a özgü bir bug (canlı testte bulundu).
    const parsedWeight = parseLocaleNumber(weight);
    if (Number.isNaN(parsedWeight)) {
      setFormError(t("Geçerli bir kilo değeri gir (ör. 78.5).", "Enter a valid weight value (e.g. 78.5)."));
      return;
    }

    // Bel çevresi/vücut yağ oranı opsiyonel - boşsa hiç doğrulanmaz/gönderilmez.
    const parsedWaist = waistCm ? parseLocaleNumber(waistCm) : undefined;
    if (waistCm && Number.isNaN(parsedWaist)) {
      setFormError(t("Geçerli bir bel çevresi değeri gir.", "Enter a valid waist value."));
      return;
    }
    const parsedBodyFat = bodyFatPct ? parseLocaleNumber(bodyFatPct) : undefined;
    if (bodyFatPct && Number.isNaN(parsedBodyFat)) {
      setFormError(t("Geçerli bir vücut yağ oranı değeri gir.", "Enter a valid body fat % value."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, {
        weight: parsedWeight,
        waist_cm: parsedWaist,
        body_fat_pct: parsedBodyFat,
        workout_completed: false,
      });
      setFormSuccess(t("Kaydedildi!", "Saved!"));
      setWeight("");
      setWaistCm("");
      setBodyFatPct("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEditLog(log: ProgressLog) {
    setEditingLogId(log.id);
    setEditWeight(log.weight != null ? String(log.weight) : "");
    setEditWaistCm(log.waist_cm != null ? String(log.waist_cm) : "");
    setEditBodyFatPct(log.body_fat_pct != null ? String(log.body_fat_pct) : "");
    setEditError(null);
  }

  async function handleSaveLog(logId: number) {
    if (!token) return;
    setEditError(null);

    const parsedWeight = editWeight ? parseLocaleNumber(editWeight) : undefined;
    if (editWeight && Number.isNaN(parsedWeight)) {
      setEditError(t("Geçerli bir kilo değeri gir.", "Enter a valid weight value."));
      return;
    }
    const parsedWaist = editWaistCm ? parseLocaleNumber(editWaistCm) : undefined;
    if (editWaistCm && Number.isNaN(parsedWaist)) {
      setEditError(t("Geçerli bir bel çevresi değeri gir.", "Enter a valid waist value."));
      return;
    }
    const parsedBodyFat = editBodyFatPct ? parseLocaleNumber(editBodyFatPct) : undefined;
    if (editBodyFatPct && Number.isNaN(parsedBodyFat)) {
      setEditError(t("Geçerli bir vücut yağ oranı değeri gir.", "Enter a valid body fat % value."));
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateProgressLog(token, logId, {
        weight: parsedWeight,
        waist_cm: parsedWaist,
        body_fat_pct: parsedBodyFat,
      });
      setEditingLogId(null);
      await loadData();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : t("Güncellenemedi, tekrar dener misin?", "Couldn't update, want to try again?"));
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteLog(logId: number) {
    if (!token) return;
    setHistoryError(null);
    try {
      await deleteProgressLog(token, logId);
      await loadData();
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  const currentWeight = currentWeightOf(logs);
  // Sadece kilo/bel/yağ oranından en az biri girilmiş kayıtlar - sohbetten
  // gelen SADECE antrenman-işaretli satırlar (weight/waist/fat hepsi null)
  // burada gösterilmiyor, o veri zaten Antrenman sekmesinde kendi başına var.
  const measurementLogs = logs.filter(
    (log) => log.weight !== null || log.waist_cm !== null || log.body_fat_pct !== null
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t("İlerleme", "Progress")}</Text>

          {loadError ? <ErrorBanner message={loadError} /> : null}

          {isLoading ? (
            <View style={styles.statGrid}>
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
            </View>
          ) : (
            <View style={styles.statGrid}>
              <StatTile
                label={t("Güncel Kilo", "Current Weight")}
                value={summary?.weight_end != null ? `${summary.weight_end} kg` : "—"}
                hint={weightHint(summary, language)}
                color={seriesColors.series1}
              />
              <StatTile
                label={t("Bu Hafta Antrenman", "Workouts This Week")}
                value={String(summary?.workout_count ?? 0)}
                color={seriesColors.series2}
              />
              <StatTile
                label={t("Bu Hafta Kayıt", "Entries This Week")}
                value={String(summary?.log_count ?? 0)}
                color={seriesColors.series3}
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
                color={seriesColors.series5}
              />
            </View>
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

          {!isLoading && profile?.target_weight_kg && currentWeight !== null ? (
            <Card>
              <Text style={styles.cardTitle}>{t("Kilo Hedefi", "Weight Goal")}</Text>
              <Text style={styles.cardBody}>
                {t("Hedef", "Goal")}: <Text style={styles.bold}>{profile.target_weight_kg} kg</Text> — {t("Şu an", "Now")}:{" "}
                <Text style={styles.bold}>{currentWeight} kg</Text>{" "}
                {weightGoalRemainingText(currentWeight, profile.target_weight_kg, language)}
              </Text>
            </Card>
          ) : null}

          {/* Sadece anlamlı bir sapma tespit edilirse görünür (bkz.
              get_body_composition_insight) - "her açılışta bir şeyler
              söyleme" yorgunluğu yaratmamak için veri desteklemedikçe hiç
              render edilmez (2026-08-11, kullanıcı isteği). */}
          {!isLoading && bodyCompositionInsight ? (
            <InsightCard
              title={t("Vücut Kompozisyonu İçgörün", "Your Body Composition Insight")}
              message={bodyCompositionInsight}
            />
          ) : null}

          <Card>
            <Text style={styles.cardTitle}>{t("Kilo Kaydet", "Log Weight")}</Text>
            {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
            {formError ? <ErrorBanner message={formError} /> : null}

            <View>
              <FormLabel>{t("Kilo (kg)", "Weight (kg)")}</FormLabel>
              <FormInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder={t("ör. 78.5", "e.g. 78.5")}
                style={{ maxWidth: 140 }}
              />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Bel Çevresi (cm)", "Waist (cm)")}</FormLabel>
                <FormInput
                  value={waistCm}
                  onChangeText={setWaistCm}
                  keyboardType="numeric"
                  placeholder={t("opsiyonel", "optional")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormLabel>{t("Vücut Yağ (%)", "Body Fat (%)")}</FormLabel>
                <FormInput
                  value={bodyFatPct}
                  onChangeText={setBodyFatPct}
                  keyboardType="numeric"
                  placeholder={t("opsiyonel", "optional")}
                />
              </View>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.hintText}>
                {t(
                  "Bel çevresi: mezuranın nasıl tutulduğuna, gün içindeki saate ve şişkinlik/sıvı durumuna göre değişkenlik gösterebilir.",
                  "Waist: can vary based on how the tape is held, the time of day, and bloating/fluid retention."
                )}
              </Text>
              <Text style={styles.hintText}>
                {t(
                  "Vücut yağ oranı: özellikle ev tipi ölçüm cihazları (BIA'lı tartılar) hidrasyon durumuna oldukça duyarlıdır, günden güne birkaç puan oynayabilir.",
                  "Body fat %: home devices (BIA-based scales) in particular are quite sensitive to hydration status and can shift by a few points day to day."
                )}
              </Text>
            </View>

            <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
              {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
            </PrimaryButton>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
            {historyError ? <ErrorBanner message={historyError} /> : null}
            {editError ? <ErrorBanner message={editError} /> : null}
            {isLoading ? (
              <Skeleton height={100} />
            ) : measurementLogs.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(
                  "Henüz bir kilo/bel/yağ oranı kaydı yok. Yukarıdaki formdan ilk kaydını ekleyebilirsin.",
                  "No weight/waist/body fat entry yet. You can add your first entry using the form above."
                )}
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                {[...measurementLogs].reverse().map((log) => (
                  <View key={log.id} style={styles.entryRow}>
                    {editingLogId === log.id ? (
                      <View style={styles.entryEditRow}>
                        <FormInput
                          value={editWeight}
                          onChangeText={setEditWeight}
                          keyboardType="numeric"
                          placeholder={t("kg", "kg")}
                          style={{ width: 64 }}
                        />
                        <FormInput
                          value={editWaistCm}
                          onChangeText={setEditWaistCm}
                          keyboardType="numeric"
                          placeholder={t("cm", "cm")}
                          style={{ width: 64 }}
                        />
                        <FormInput
                          value={editBodyFatPct}
                          onChangeText={setEditBodyFatPct}
                          keyboardType="numeric"
                          placeholder="%"
                          style={{ width: 56 }}
                        />
                        <Pressable onPress={() => handleSaveLog(log.id)} hitSlop={8} disabled={isSavingEdit}>
                          <Check size={16} color={colors.success} />
                        </Pressable>
                        <Pressable onPress={() => setEditingLogId(null)} hitSlop={8}>
                          <X size={16} color={colors.error} />
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.entryText}>
                          {formatDate(log.log_date, language, { day: "2-digit", month: "2-digit", year: "numeric" })}
                          {" — "}
                          {[
                            log.weight != null ? `${log.weight} kg` : null,
                            log.waist_cm != null ? `${log.waist_cm} cm` : null,
                            log.body_fat_pct != null ? `%${log.body_fat_pct}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                        <View style={styles.iconRow}>
                          <Pressable onPress={() => handleStartEditLog(log)} hitSlop={8}>
                            <Pencil size={14} color={colors.muted} />
                          </Pressable>
                          <Pressable onPress={() => handleDeleteLog(log.id)} hitSlop={8}>
                            <Trash2 size={14} color={colors.muted} />
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t("Kilo Trendi", "Weight Trend")}</Text>
            {isLoading ? <Skeleton height={200} /> : <WeightChart logs={logs} />}
          </Card>

          {!isLoading && logs.some((log) => log.waist_cm !== null) ? (
            <Card>
              <Text style={styles.cardTitle}>{t("Bel Çevresi Trendi", "Waist Trend")}</Text>
              <WaistChart logs={logs} />
            </Card>
          ) : null}

          {!isLoading && logs.some((log) => log.body_fat_pct !== null) ? (
            <Card>
              <Text style={styles.cardTitle}>{t("Vücut Yağ Trendi", "Body Fat Trend")}</Text>
              <BodyFatChart logs={logs} />
            </Card>
          ) : null}

          <Card>
            <Text style={styles.cardTitle}>{t("Aylar Arası Trend", "Trend Over Months")}</Text>
            <Text style={styles.cardSubtitle}>
              {t(
                "Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.",
                "The weekly pattern of mood and workout days over the last 12 weeks."
              )}
            </Text>
            {isLoading ? (
              <Skeleton height={280} />
            ) : (
              <>
                <TrendCorrelationChart points={trends?.points ?? []} />
                <Text style={styles.cardBody}>
                  {correlationInsightText(trends?.mood_workout_correlation ?? null, language)}
                </Text>
              </>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -10,
  },
  cardBody: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  bold: {
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  hintText: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
  },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
  entryText: { fontSize: 13, color: colors.text, flex: 1 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
