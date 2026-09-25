import { useEffect, useMemo, useState } from "react";
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
import { toLocaleUpper } from "@/lib/format";
import { useTheme } from "@/lib/theme-context";
import { DetailScreen, EmptyState, ErrorBanner, RevealOnMount, Skeleton, type ThemeColors, useThemeColors } from "@/components/ui";
import { SurfaceToneProvider, WORKOUT_SURFACE_TONE } from "@/components/surface-tone";
import { ProgressInsight, ProgressSectionCard, ProgressTextButton, stackTone } from "@/components/progress-cards";
import { WORKOUT_INSIGHT_TONE, useWorkoutIdentityColors } from "@/components/workout-identity";
import { ExercisePrChart } from "@/components/charts/exercise-pr-chart";

// web/src/app/(app)/workouts/[exerciseName]/page.tsx'in mobil portu - 2026-08-13
// kullanıcı isteği. Her egzersiz SADECE kendi geçmişiyle kıyaslanır.
// Redesign (Faz M2b, 2026-08-15): statik `colors` (+ sabit `#fff` kart
// arkaplanları - koyu modda kırık duruyordu) yerine `useThemeColors()`;
// Haftalık/Aylık aktif durumu artık ChipSelect'le AYNI ölçülü ton deseni
// (dolu accent yerine yumuşak ton+kenarlık) - bugünkü koyu mod "bunaltıcı
// turuncu" düzeltmesiyle tutarlı kalsın diye.
// Redesign turu 2 (2026-09-22, kullanıcı isteği): Antrenman sekmesinin yeni
// tasarım diline geçti - ortak `Card` yerine `ProgressSectionCard` (sıcak
// kahve/beyaz panel), vurgu rengi Antrenman'ın kendi kimliği (workout-
// identity.ts::sessions kırmızısı). `DetailScreen` (başlık çubuğu) SHARED -
// goals/checkins/mood-history/profile-settings de kullanıyor, DOKUNULMADI -
// sadece bu ekranın KENDİ içeriği yeni dile geçti.

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
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const workoutIds = useWorkoutIdentityColors();
  const panelMuted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  const panelBorder = isDark ? "rgba(255,255,255,0.15)" : c.border;
  const panelChartColors: ThemeColors = useMemo(
    () => ({ ...c, muted: panelMuted, border: panelBorder }),
    [c, panelMuted, panelBorder]
  );
  const s = useMemo(() => makeStyles(c, isDark, workoutIds.sessions), [c, isDark, workoutIds.sessions]);

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
  const tones = { compare: stackTone(0, 3), prChart: stackTone(1, 3), entries: stackTone(2, 3) };
  // `historyEntries` "Tüm Kayıtlar" listesi için YENİDEN ESKİYE (bugün en
  // üstte) - PR grafiği soldan sağa ESKİDEN YENİYE bir zaman çizelgesi
  // olduğu için TERSİ gerekiyor (kullanıcı bulgusu: ilk sürümde tarihler
  // grafikte 22/09 -> 31/08 -> 22/08 gibi TERS sırada çiziliyordu).
  const chronologicalEntries = useMemo(() => [...historyEntries].reverse(), [historyEntries]);

  return (
    // Antrenman'ın alt ekranı - aynı yüzey tonu (kırmızı + nötr panel).
    <SurfaceToneProvider tone={WORKOUT_SURFACE_TONE}>
    <DetailScreen title={exerciseName}>
      <ScrollView contentContainerStyle={s.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <Skeleton height={220} />
        ) : !history ? null : (
          <>
            <RevealOnMount delay={200}>
            <ProgressSectionCard title={t("Kendi Geçmişinle Kıyasla", "Compare With Your History")} {...tones.compare}>
              <View style={s.toggleRow}>
                {(["weekly", "monthly"] as const).map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setPeriod(option)}
                    disabled={isInsightLoading}
                    style={[
                      s.toggleButton,
                      period === option && s.toggleButtonActive,
                      isInsightLoading && s.toggleButtonDisabled,
                    ]}
                  >
                    <Text style={[s.toggleButtonText, { color: panelMuted }, period === option && s.toggleButtonTextActive]}>
                      {option === "weekly" ? t("Haftalık", "Weekly") : t("Aylık", "Monthly")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {activePair ? (
                <View style={s.periodGrid}>
                  {[
                    { stat: activePair[0], label: t("Önceki dönem", "Previous period") },
                    { stat: activePair[1], label: t("Son dönem", "Latest period") },
                  ].map(({ stat, label }, index) => (
                    <View key={index} style={s.periodCard}>
                      <Text style={[s.periodLabel, { color: panelMuted }]}>{label}</Text>
                      <Text style={[s.periodRange, { color: panelMuted }]}>{periodRangeText(stat, language)}</Text>
                      <Text style={s.periodBest}>{bestSetText(stat, t)}</Text>
                      <Text style={[s.periodTotals, { color: panelMuted }]}>
                        {t(`Toplam ${stat.total_sets} set / ${stat.total_reps} tekrar`, `Total ${stat.total_sets} sets / ${stat.total_reps} reps`)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon={<Trophy size={28} color={panelMuted} />}
                  message={t(
                    "Kıyaslama için henüz yeterli veri yok - bu egzersizi en az iki farklı dönemde loglaman gerekiyor.",
                    "Not enough data to compare yet - log this exercise in at least two different periods."
                  )}
                />
              )}

              {activePair ? (
                <View style={{ marginTop: 12 }}>
                  {isInsightLoading ? (
                    <ProgressInsight title={t("Koçunun Yorumu", "Your Coach's Take")} loading tone={WORKOUT_INSIGHT_TONE} />
                  ) : insight ? (
                    <ProgressInsight title={t("Koçunun Yorumu", "Your Coach's Take")} message={insight} tone={WORKOUT_INSIGHT_TONE} />
                  ) : null}
                </View>
              ) : null}
            </ProgressSectionCard>
            </RevealOnMount>

            <RevealOnMount delay={230}>
            <ProgressSectionCard title={t("Kişisel Rekor Gelişimi", "Personal Record Progress")} {...tones.prChart}>
              <ExercisePrChart
                entries={chronologicalEntries}
                language={language}
                color={workoutIds.sessions}
                themeColors={panelChartColors}
                emptyMessage={t(
                  "Kişisel rekor gelişimini görmek için en az iki farklı günde rekor kırman gerekiyor.",
                  "You need a personal record on at least two different days to see your progress."
                )}
              />
            </ProgressSectionCard>
            </RevealOnMount>

            <RevealOnMount delay={260}>
            <ProgressSectionCard title={t("Tüm Kayıtlar", "All Entries")} {...tones.entries}>
              {historyError ? <ErrorBanner message={historyError} /> : null}
              {historyEntries.length === 0 ? (
                // Nadir bir uç durum - bu ekrana SADECE en az bir seti loglanmış
                // egzersizlerden geçiliyor, ama o setler ekran arka plandayken
                // (bkz. useEffect'in tekil mount notu, bu ekran useFocusEffect
                // DEĞİL) başka bir yerden silinmiş olabilir. Diğer geçmiş
                // listeleriyle (Antrenman/Beslenme/İlerleme) TUTARLILIK için
                // - önceden bu durumda kart başlığın altında boş/açıklamasız
                // kalıyordu.
                <EmptyState
                  icon={<Trophy size={28} color={panelMuted} />}
                  message={t(
                    "Bu egzersiz için henüz bir kayıt yok.",
                    "No entries logged for this exercise yet."
                  )}
                />
              ) : (
                <View style={{ gap: 14 }}>
                  {groupEntriesByDate(historyEntries, (entry) => entry.session_date, language).map((group) => (
                    <View key={group.label} style={{ gap: 6 }}>
                      <Text style={[s.groupLabel, { color: panelMuted }]}>{toLocaleUpper(group.label, language)}</Text>
                      {group.items.map((entry, index) => (
                        <View key={index} style={s.entryRow}>
                          <View style={s.entryRight}>
                            {entry.is_personal_record ? <Trophy size={14} color={workoutIds.sessions} /> : null}
                            <Text style={s.entryText}>
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
                    <ProgressTextButton onPress={handleLoadMoreHistory} disabled={isLoadingMoreHistory} loading={isLoadingMoreHistory}>
                      {t("Daha Fazla Göster", "Show More")}
                    </ProgressTextButton>
                  ) : null}
                </View>
              )}
            </ProgressSectionCard>
            </RevealOnMount>
          </>
        )}
      </ScrollView>
    </DetailScreen>
    </SurfaceToneProvider>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean, accent: string) {
  const rowBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)";
  const text = isDark ? "#FFFFFF" : c.text;
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      letterSpacing: 0.4,
    },
    toggleRow: {
      flexDirection: "row",
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.15)" : c.border,
      borderRadius: 10,
      padding: 3,
      marginBottom: 12,
    },
    toggleButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    toggleButtonActive: { backgroundColor: `${accent}26`, borderWidth: 1, borderColor: accent },
    toggleButtonDisabled: { opacity: 0.5 },
    toggleButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    toggleButtonTextActive: { color: accent },
    periodGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    periodCard: {
      flex: 1,
      minWidth: 140,
      backgroundColor: rowBg,
      borderRadius: 10,
      padding: 12,
    },
    periodLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    periodRange: { fontSize: 10, marginTop: 2, marginBottom: 6 },
    periodBest: { fontSize: 14, fontFamily: "Inter_700Bold", color: text },
    periodTotals: { fontSize: 11, marginTop: 4 },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: rowBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    entryRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    entryText: { fontSize: 13, color: text },
  });
}
