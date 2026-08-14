import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Trophy } from "lucide-react-native";
import {
  ApiError,
  getExerciseHistory,
  getExerciseInsight,
  type ExerciseHistory,
  type ExerciseHistoryEntry,
  type ExercisePeriodStat,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { groupEntriesByDate } from "@/lib/date-grouping";
import { useLanguage, useT } from "@/lib/language-context";
import { Card, DetailScreen, EmptyState, ErrorBanner, InsightCard, SecondaryButton, Skeleton, colors } from "@/components/ui";

// web/src/app/(app)/workouts/[exerciseName]/page.tsx'in mobil portu - 2026-08-13
// kullanıcı isteği. Her egzersiz SADECE kendi geçmişiyle kıyaslanır.

// "Tüm Kayıtlar" listesi zamanla çok uzayıp özellikle mobilde görsel olarak
// bunaltıcı oluyordu (2026-08-14, kullanıcı isteği) - bu ekranda önceden
// HİÇ limit/offset yoktu, en riskli noktaydı (sık yapılan bir egzersiz için
// liste sınırsız büyüyordu). Kademeli yükleme + gün başlıklarına gruplama
// (web ile AYNI desen).
const HISTORY_PAGE_SIZE = 20;

type Period = "weekly" | "monthly";

function formatDate(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function periodRangeText(stat: ExercisePeriodStat, language: PreferredLanguage): string {
  return `${formatDate(stat.period_start, language)} – ${formatDate(stat.period_end, language)}`;
}

function bestSetText(stat: ExercisePeriodStat, t: (tr: string, en: string) => string): string {
  if (stat.top_weight_kg !== null) {
    return t(`${stat.top_weight_kg} kg × ${stat.top_weight_reps} tekrar`, `${stat.top_weight_kg} kg × ${stat.top_weight_reps} reps`);
  }
  if (stat.top_weight_reps !== null) {
    return t(`${stat.top_weight_reps} tekrar`, `${stat.top_weight_reps} reps`);
  }
  return t("Veri yok", "No data");
}

export default function ExerciseHistoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const exerciseName = name ?? "";
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();

  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("weekly");
  const [insight, setInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // "Tüm Kayıtlar" listesi weekly/monthly kıyaslamasından BAĞIMSIZ, sayfalı
  // bir state - `history.weekly`/`history.monthly` backend'de zaten TAM
  // veriden hesaplanıp limit/offset'ten etkilenmiyor, bu yüzden web'deki
  // gibi ayrı bir grafik/liste ayrımı sorunu YOK - tek endpoint yeterli.
  const [historyEntries, setHistoryEntries] = useState<ExerciseHistoryEntry[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    function loadHistory() {
      if (!token || !exerciseName) return;
      setIsLoading(true);
      getExerciseHistory(token, exerciseName, HISTORY_PAGE_SIZE, 0)
        .then((data) => {
          setHistory(data);
          setHistoryEntries([...data.entries].reverse());
          setHasMoreHistory(data.entries.length === HISTORY_PAGE_SIZE);
          setHistoryOffset(data.entries.length);
        })
        .catch((err) => setLoadError(err instanceof ApiError ? err.message : t("Yüklenemedi.", "Couldn't load.")))
        .finally(() => setIsLoading(false));
    }
    loadHistory();
  }, [token, exerciseName, t]);

  async function handleLoadMoreHistory() {
    if (!token || !exerciseName) return;
    setIsLoadingMoreHistory(true);
    try {
      const data = await getExerciseHistory(token, exerciseName, HISTORY_PAGE_SIZE, historyOffset);
      const newestFirst = [...data.entries].reverse();
      setHistoryEntries((prev) => [...prev, ...newestFirst]);
      setHasMoreHistory(data.entries.length === HISTORY_PAGE_SIZE);
      setHistoryOffset((prev) => prev + data.entries.length);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : t("Yüklenemedi, tekrar dener misin?", "Couldn't load, want to try again?"));
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  useEffect(() => {
    // Regresyon (canlı cihaz testinde yakalandı, 2026-08-13): haftalık/aylık
    // arasında hızlı hızlı geçince ÖNCEKİ LLM çağrısı iptal EDİLMEDEN her
    // dokunuşta yeni bir çağrı tetikleniyordu - Ollama tek seferde bir
    // istek işlediği için birikip backend'in donmuş gibi hissettirmesine
    // yol açtı. `cancelled` bayrağı geç gelen/artık gereksiz yanıtları
    // yok sayar, TOGGLE_BUTTON'lar da yüklenirken devre dışı bırakılıp
    // (aşağıda) yeni istek birikmesi baştan engelleniyor.
    let cancelled = false;

    function loadInsight() {
      const pair = period === "weekly" ? history?.weekly : history?.monthly;
      if (!token || !exerciseName || !pair) {
        setInsight(null);
        return;
      }
      setIsInsightLoading(true);
      getExerciseInsight(token, exerciseName, period)
        .then((result) => {
          if (!cancelled) setInsight(result.message);
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
  }, [token, exerciseName, period, history]);

  const activePair = history ? (period === "weekly" ? history.weekly : history.monthly) : null;

  return (
    <DetailScreen title={exerciseName}>
      <ScrollView contentContainerStyle={styles.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <Skeleton height={220} />
        ) : !history ? null : (
          <>
            <Card>
              <View style={styles.headerRow}>
                <Text style={styles.cardTitle}>{t("Kendi Geçmişinle Kıyasla", "Compare With Your History")}</Text>
              </View>
              <View style={styles.toggleRow}>
                {(["weekly", "monthly"] as const).map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setPeriod(option)}
                    disabled={isInsightLoading}
                    style={[
                      styles.toggleButton,
                      period === option && styles.toggleButtonActive,
                      isInsightLoading && styles.toggleButtonDisabled,
                    ]}
                  >
                    <Text style={[styles.toggleButtonText, period === option && styles.toggleButtonTextActive]}>
                      {option === "weekly" ? t("Haftalık", "Weekly") : t("Aylık", "Monthly")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {activePair ? (
                <View style={styles.periodGrid}>
                  {[
                    { stat: activePair[0], label: t("Önceki dönem", "Previous period") },
                    { stat: activePair[1], label: t("Son dönem", "Latest period") },
                  ].map(({ stat, label }, index) => (
                    <View key={index} style={styles.periodCard}>
                      <Text style={styles.periodLabel}>{label}</Text>
                      <Text style={styles.periodRange}>{periodRangeText(stat, language)}</Text>
                      <Text style={styles.periodBest}>{bestSetText(stat, t)}</Text>
                      <Text style={styles.periodTotals}>
                        {t(`Toplam ${stat.total_sets} set / ${stat.total_reps} tekrar`, `Total ${stat.total_sets} sets / ${stat.total_reps} reps`)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon={<Trophy size={28} color={colors.muted} />}
                  message={t(
                    "Kıyaslama için henüz yeterli veri yok - bu egzersizi en az iki farklı dönemde loglaman gerekiyor.",
                    "Not enough data to compare yet - log this exercise in at least two different periods."
                  )}
                />
              )}

              {activePair ? (
                <View style={{ marginTop: 12 }}>
                  {isInsightLoading ? (
                    <Skeleton height={64} />
                  ) : insight ? (
                    <InsightCard title={t("Koçunun Yorumu", "Your Coach's Take")} message={insight} />
                  ) : null}
                </View>
              ) : null}
            </Card>

            <Card>
              <Text style={styles.cardTitle}>{t("Tüm Kayıtlar", "All Entries")}</Text>
              {historyError ? <ErrorBanner message={historyError} /> : null}
              <View style={{ gap: 14, marginTop: 8 }}>
                {groupEntriesByDate(historyEntries, (entry) => entry.session_date, language).map((group) => (
                  <View key={group.label} style={{ gap: 6 }}>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    {group.items.map((entry, index) => (
                      <View key={index} style={styles.entryRow}>
                        <View style={styles.entryRight}>
                          {entry.is_personal_record ? <Trophy size={14} color={colors.accent} /> : null}
                          <Text style={styles.entryText}>
                            {entry.weight_kg !== null
                              ? t(`${entry.weight_kg} kg × ${entry.reps} tekrar`, `${entry.weight_kg} kg × ${entry.reps} reps`)
                              : t(`${entry.reps} tekrar`, `${entry.reps} reps`)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
                {hasMoreHistory ? (
                  <SecondaryButton onPress={handleLoadMoreHistory} disabled={isLoadingMoreHistory} loading={isLoadingMoreHistory}>
                    {t("Daha Fazla Göster", "Show More")}
                  </SecondaryButton>
                ) : null}
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  headerRow: { marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  toggleRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  toggleButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleButtonActive: { backgroundColor: colors.accent },
  toggleButtonDisabled: { opacity: 0.5 },
  toggleButtonText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  toggleButtonTextActive: { color: "#fff" },
  periodGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  periodCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
  },
  periodLabel: { fontSize: 11, fontWeight: "600", color: colors.muted },
  periodRange: { fontSize: 10, color: colors.muted, marginTop: 2, marginBottom: 6 },
  periodBest: { fontSize: 14, fontWeight: "700", color: colors.text },
  periodTotals: { fontSize: 11, color: colors.muted, marginTop: 4 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  entryRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  entryText: { fontSize: 13, color: colors.text },
});
