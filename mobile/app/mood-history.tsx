import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { HeartPulse } from "lucide-react-native";
import { ApiError, getMoodHistory, getMoodInsight, type MoodInsight, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { groupEntriesByWeek } from "@/lib/date-grouping";
import {
  Card,
  DetailScreen,
  EmptyState,
  ErrorBanner,
  InsightCard,
  MOOD_KEYS,
  MOOD_META,
  Skeleton,
  type ThemeColors,
  useThemeColors,
} from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/mood-trend-chart";

// web/src/app/(app)/mood/page.tsx'in mobil portu - Faz M5. Mod SEÇİMİ zaten
// Sohbet sekmesinde (MoodPicker, Faz M2) yapılıyor, bu ekran SADECE geçmiş/
// trend gösteriyor (web'deki ayrı sayfayla aynı kapsam).
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`.
// Bu ekranda silme/düzenleme YOK (mood salt-okunur geçmiş) - BottomSheet/
// SwipeableRow'a gerek yok, sadece tema düzeltmesi.
// Haftalık ızgara (2026-08-16, kullanıcı isteği - daha önce değerlendirilip
// ertelenmiş bir öneri, şimdi uygulandı, bkz. 616df14): düz "Geçmiş
// Kayıtlar" listesi (90 gün, hiç sayfalanmıyordu - bu ekran 4 kardeş
// ekrandan [İlerleme/Antrenman/Beslenme/Egzersiz Geçmişi] farklı olarak
// kademeli yükleme TURUNU hiç görmemişti) yerine Pzt-Paz 7 hücrelik
// haftalık satırlar geldi - hem "bir bakışta" daha anlaşılır hem de 90 günü
// ~13 kompakt satıra indirip "liste çok uzun" sorununu kendiliğinden
// çözüyor, ayrıca sayfalama GEREKMİYOR.
// İçgörü kartı (2026-08-16, kullanıcı isteği): kural-tabanlı istatistik +
// LLM ile yumuşatma (GET /mood/insight, bkz. backend d9b6486) - Trend
// kartıyla Haftalık Görünüm kartı arasında, exercise-history.tsx'teki
// "Koçunun Yorumu" ile AYNI ayrı/gecikmeli yükleme deseni (LLM birkaç
// saniye sürebiliyor, grafik/ızgara bunu beklemeden anında görünür).
const DAY_LABELS: Record<"tr" | "en", string[]> = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isFutureDate(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d.getTime() > t.getTime();
}

export default function MoodHistoryScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [insight, setInsight] = useState<MoodInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  const MOOD_OPTIONS = MOOD_KEYS.reduce(
    (acc, key) => {
      acc[key] = { emoji: MOOD_META[key].emoji, label: t(MOOD_META[key].tr, MOOD_META[key].en) };
      return acc;
    },
    {} as Record<MoodKey, { emoji: string; label: string }>
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await getMoodHistory(token, 90);
      setHistory(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  // Yeterli sinyal yoksa backend hiç LLM çağırmadan hızlıca message: null
  // döner (bkz. GET /mood/insight), bu yüzden veri az/yokken de her focus'ta
  // çağırmak güvenli/ucuz.
  const loadInsight = useCallback(async () => {
    if (!token) return;
    setIsInsightLoading(true);
    try {
      const result = await getMoodInsight(token);
      setInsight(result);
    } catch {
      setInsight(null);
    } finally {
      setIsInsightLoading(false);
    }
  }, [token]);

  const weeks = useMemo(() => groupEntriesByWeek(history, (entry) => entry.log_date), [history]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadInsight();
    }, [loadData, loadInsight])
  );

  return (
    <DetailScreen title={t("Ruh Hali", "Mood")}>
      <ScrollView contentContainerStyle={s.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        <Card>
          <Text style={s.cardTitle}>{t("Son 90 Gün Trend", "Last 90 Days Trend")}</Text>
          {isLoading ? <Skeleton height={220} /> : <MoodTrendChart history={history} />}
        </Card>

        {isInsightLoading ? (
          <Skeleton height={64} />
        ) : insight?.status === "ready" && insight.message ? (
          <InsightCard title={t("Ruh Hali Gözlemi", "Mood Observation")} message={insight.message} />
        ) : insight?.status === "insufficient_data" && history.length > 0 ? (
          // Zaten kayıt var ama içgörü için henüz yetersiz - bunu Haftalık
          // Görünüm'ün "hiç kayıt yok" EmptyState'iyle KARIŞTIRMA (o zaten
          // history.length===0 iken görünüyor, burası history.length>0 ama
          // sinyal=insufficient iken).
          <View style={s.insightPlaceholder}>
            <HeartPulse size={16} color={c.muted} />
            <Text style={s.insightPlaceholderText}>
              {t(
                "Henüz yeterli veri yok - ruh halini birkaç hafta daha kaydettikçe burada kişisel bir gözlem göreceksin.",
                "Not enough data yet - keep logging your mood for a few more weeks and a personal observation will appear here."
              )}
            </Text>
          </View>
        ) : null}

        <Card>
          <Text style={s.cardTitle}>{t("Haftalık Görünüm", "Weekly View")}</Text>
          {isLoading ? (
            <Skeleton height={140} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<HeartPulse size={28} color={c.muted} />}
              message={t(
                "Henüz ruh hali kaydı yok. Sohbet sekmesindeki mod seçiciyi kullandıkça burada listelenecek.",
                "No mood logged yet. Entries will appear here as you use the mood picker on the chat tab."
              )}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.dayLabelRow}>
                {DAY_LABELS[language].map((label) => (
                  <Text key={label} style={s.dayLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              {weeks.map((week) => (
                <View key={week.weekStartIso} style={s.weekRow}>
                  {week.days.map((entry, i) => {
                    const dateIso = addDaysIso(week.weekStartIso, i);
                    const option = entry ? MOOD_OPTIONS[entry.mood_key] : null;
                    const future = isFutureDate(dateIso);
                    return (
                      <View
                        key={dateIso}
                        style={[s.dayCell, option ? s.dayCellFilled : future ? s.dayCellFuture : s.dayCellEmpty]}
                        accessibilityLabel={
                          formatDate(dateIso, language, { day: "2-digit", month: "long" }) +
                          (option ? `: ${option.label}` : "")
                        }
                      >
                        {option ? (
                          <Text style={s.dayEmoji}>{option.emoji}</Text>
                        ) : (
                          <Text style={[s.dayNumber, future && s.dayNumberFuture]}>
                            {new Date(`${dateIso}T00:00:00`).getDate()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    cardTitle: { fontSize: 15, fontWeight: "700", color: c.text },
    insightPlaceholder: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    insightPlaceholderText: { flex: 1, fontSize: 13, color: c.muted },
    dayLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 4,
    },
    dayLabel: {
      flex: 1,
      textAlign: "center",
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
      textTransform: "uppercase",
    },
    weekRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 4,
    },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    // Mod loglanmış gün - MoodPicker'ın seçili balonuyla AYNI accent tonlama
    // (bkz. mood-picker.tsx::bubbleActive), tutarlılık için.
    dayCellFilled: { backgroundColor: `${c.accent}26` },
    // Geçmişte kalmış ama loglanmamış gün - hafif bir çerçeveyle "buraya
    // bir kayıt eklenebilirdi" hissi.
    dayCellEmpty: { backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
    // Henüz gelmemiş gün - çerçevesiz/boş, "eksik" değil "henüz yok" mesajı.
    dayCellFuture: { backgroundColor: "transparent" },
    dayEmoji: { fontSize: 17 },
    dayNumber: { fontSize: 11, color: c.muted },
    dayNumberFuture: { color: c.border },
  });
}
