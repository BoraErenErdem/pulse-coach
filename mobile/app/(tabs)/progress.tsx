import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
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
import { TrendCorrelationChart } from "@/components/charts/trend-correlation-chart";
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
    const parsedWeight = Number(weight.replace(",", "."));
    if (Number.isNaN(parsedWeight)) {
      setFormError(t("Geçerli bir kilo değeri gir (ör. 78.5).", "Enter a valid weight value (e.g. 78.5)."));
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, { weight: parsedWeight, workout_completed: false });
      setFormSuccess(t("Kaydedildi!", "Saved!"));
      setWeight("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentWeight = currentWeightOf(logs);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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

          <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
          </PrimaryButton>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{t("Kilo Trendi", "Weight Trend")}</Text>
          {isLoading ? <Skeleton height={200} /> : <WeightChart logs={logs} />}
        </Card>

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
});
