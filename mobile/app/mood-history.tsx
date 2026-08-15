import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { HeartPulse } from "lucide-react-native";
import { ApiError, getMoodHistory, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import {
  Card,
  DetailScreen,
  EmptyState,
  ErrorBanner,
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

export default function MoodHistoryScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  return (
    <DetailScreen title={t("Ruh Hali", "Mood")}>
      <ScrollView contentContainerStyle={s.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        <Card>
          <Text style={s.cardTitle}>{t("Son 90 Gün Trend", "Last 90 Days Trend")}</Text>
          {isLoading ? <Skeleton height={220} /> : <MoodTrendChart history={history} />}
        </Card>

        <Card>
          <Text style={s.cardTitle}>{t("Geçmiş Kayıtlar", "History")}</Text>
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
            <View style={{ gap: 6 }}>
              {[...history].reverse().map((entry) => {
                const option = MOOD_OPTIONS[entry.mood_key];
                return (
                  <View key={entry.log_date} style={s.entryRow}>
                    <Text style={s.emoji}>{option?.emoji ?? "🙂"}</Text>
                    <Text style={s.entryDate}>
                      {formatDate(entry.log_date, language, { day: "2-digit", month: "long", year: "numeric" })}
                    </Text>
                    <Text style={s.entryLabel}>— {option?.label ?? entry.mood_key}</Text>
                  </View>
                );
              })}
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
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.surfaceMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    emoji: { fontSize: 16 },
    entryDate: { fontSize: 13, color: c.text },
    entryLabel: { fontSize: 13, color: c.muted },
  });
}
