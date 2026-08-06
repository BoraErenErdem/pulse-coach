import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  ApiError,
  WORKOUT_TYPES,
  getProfile,
  getProgressLogs,
  getTrends,
  getWeeklySummary,
  logProgress,
  type Profile,
  type ProgressLog,
  type Trends,
  type WeeklySummary,
  type WorkoutType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  ChipSelect,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  InsightCard,
  PrimaryButton,
  Skeleton,
  StatTile,
  SuccessBanner,
  ToggleRow,
  WORKOUT_TYPE_LABELS,
  colors,
  seriesColors,
} from "@/components/ui";
import { TrendCorrelationChart } from "@/components/charts/trend-correlation-chart";
import { WeightChart } from "@/components/charts/weight-chart";
import { WorkoutTypeChart } from "@/components/charts/workout-type-chart";

// web/src/app/(app)/progress/page.tsx'in mobil portu - Faz M3, chart
// kütüphanesinin ilk canlı testi burada (plan kararı: erken, ekran sayısı azken).
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

function weightGoalRemainingText(current: number, target: number): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return "— hedefine ulaştın!";
  if (diff > 0) return `(${diff.toFixed(1)} kg vermen gerekiyor)`;
  return `(${Math.abs(diff).toFixed(1)} kg alman gerekiyor)`;
}

export default function ProgressTab() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
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

    if (!wantsWeight && !wantsWorkout) {
      setFormError("Kaydetmek için en az kilo ya da antrenman bilgisi seçmelisin.");
      return;
    }

    // RN'in decimal-pad klavyesi tr-TR yerelinde "," gösteriyor ama Number()
    // "," ile ondalık ayrıştıramıyor (Number("78,5") -> NaN) - web'de HTML
    // input[type=number] bunu otomatik normalize ettiği için hiç görülmeyen,
    // mobile'a özgü bir bug (canlı testte bulundu).
    const parsedWeight = wantsWeight && weight ? Number(weight.replace(",", ".")) : undefined;
    if (wantsWeight && weight && Number.isNaN(parsedWeight)) {
      setFormError("Geçerli bir kilo değeri gir (ör. 78.5).");
      return;
    }

    setIsSubmitting(true);
    try {
      await logProgress(token, {
        weight: parsedWeight,
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

  const currentWeight = currentWeightOf(logs);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>İlerleme</Text>

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
              label="Güncel Kilo"
              value={summary?.weight_end != null ? `${summary.weight_end} kg` : "—"}
              hint={weightHint(summary)}
              color={seriesColors.series1}
            />
            <StatTile
              label="Bu Hafta Antrenman"
              value={String(summary?.workout_count ?? 0)}
              color={seriesColors.series2}
            />
            <StatTile
              label="Bu Hafta Kayıt"
              value={String(summary?.log_count ?? 0)}
              color={seriesColors.series3}
            />
            <StatTile
              label="Seri"
              value={`${summary?.streak_weeks ?? 0} hafta`}
              hint={(summary?.streak_weeks ?? 0) >= 2 ? "üst üste düzenli!" : undefined}
              color={seriesColors.series5}
            />
          </View>
        )}

        {!isLoading && summary ? (
          summary.log_count > 0 ? (
            <InsightCard title="Bu Haftaki İçgörün" message={summary.summary_text} />
          ) : (
            <InfoBanner message="Henüz bu hafta bir kayıt yok. Aşağıdaki formdan ilk kaydını ekleyebilirsin." />
          )
        ) : null}

        {!isLoading && profile?.target_weight_kg && currentWeight !== null ? (
          <Card>
            <Text style={styles.cardTitle}>Kilo Hedefi</Text>
            <Text style={styles.cardBody}>
              Hedef: <Text style={styles.bold}>{profile.target_weight_kg} kg</Text> — Şu an:{" "}
              <Text style={styles.bold}>{currentWeight} kg</Text>{" "}
              {weightGoalRemainingText(currentWeight, profile.target_weight_kg)}
            </Text>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.cardTitle}>İlerleme Kaydet</Text>
          {formSuccess ? <SuccessBanner message={formSuccess} /> : null}
          {formError ? <ErrorBanner message={formError} /> : null}

          <ToggleRow label="Kilo girmek istiyorum" value={wantsWeight} onChange={setWantsWeight} />
          {wantsWeight ? (
            <View style={{ paddingLeft: 30 }}>
              <FormLabel>Kilo (kg)</FormLabel>
              <FormInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="ör. 78.5"
                style={{ maxWidth: 140 }}
              />
            </View>
          ) : null}

          <ToggleRow label="Bugün antrenman yaptım" value={wantsWorkout} onChange={setWantsWorkout} />
          {wantsWorkout ? (
            <View style={{ paddingLeft: 30 }}>
              <FormLabel>Antrenman Türü</FormLabel>
              <ChipSelect
                options={WORKOUT_TYPES}
                value={workoutType}
                onChange={setWorkoutType}
                labels={WORKOUT_TYPE_LABELS}
              />
            </View>
          ) : null}

          <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </PrimaryButton>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Kilo Trendi</Text>
          {isLoading ? <Skeleton height={200} /> : <WeightChart logs={logs} />}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Antrenman Türü Dağılımı</Text>
          {isLoading ? <Skeleton height={200} /> : <WorkoutTypeChart logs={logs} />}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Aylar Arası Trend</Text>
          <Text style={styles.cardSubtitle}>
            Son 12 haftada ruh hali ve antrenman günlerinin haftalık örüntüsü.
          </Text>
          {isLoading ? (
            <Skeleton height={280} />
          ) : (
            <>
              <TrendCorrelationChart points={trends?.points ?? []} />
              <Text style={styles.cardBody}>
                {correlationInsightText(trends?.mood_workout_correlation ?? null)}
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
