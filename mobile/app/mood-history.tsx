import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ApiError, getMoodHistory, type MoodKey, type MoodLog } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, DetailScreen, ErrorBanner, Skeleton, colors } from "@/components/ui";
import { MoodTrendChart } from "@/components/charts/mood-trend-chart";

// web/src/app/(app)/mood/page.tsx'in mobil portu - Faz M5. Mod SEÇİMİ zaten
// Sohbet sekmesinde (MoodPicker, Faz M2) yapılıyor, bu ekran SADECE geçmiş/
// trend gösteriyor (web'deki ayrı sayfayla aynı kapsam).
const MOOD_OPTIONS: Record<MoodKey, { emoji: string; label: string }> = {
  zor: { emoji: "😔", label: "Zor" },
  dusuk: { emoji: "😕", label: "Düşük" },
  notr: { emoji: "🙂", label: "Nötr" },
  iyi: { emoji: "😊", label: "İyi" },
  harika: { emoji: "🤩", label: "Harika" },
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function MoodHistoryScreen() {
  const { token } = useAuth();
  const [history, setHistory] = useState<MoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await getMoodHistory(token, 90);
      setHistory(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  return (
    <DetailScreen title="Ruh Hali">
      <ScrollView contentContainerStyle={styles.container}>
        {loadError ? <ErrorBanner message={loadError} /> : null}

        <Card>
          <Text style={styles.cardTitle}>Son 90 Gün Trend</Text>
          {isLoading ? <Skeleton height={220} /> : <MoodTrendChart history={history} />}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Geçmiş Kayıtlar</Text>
          {isLoading ? (
            <Skeleton height={140} />
          ) : history.length === 0 ? (
            <Text style={styles.emptyText}>
              Henüz ruh hali kaydı yok. Sohbet sekmesindeki mod seçiciyi kullandıkça burada
              listelenecek.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {[...history].reverse().map((entry) => {
                const option = MOOD_OPTIONS[entry.mood_key];
                return (
                  <View key={entry.log_date} style={styles.entryRow}>
                    <Text style={styles.emoji}>{option?.emoji ?? "🙂"}</Text>
                    <Text style={styles.entryDate}>{formatDate(entry.log_date)}</Text>
                    <Text style={styles.entryLabel}>— {option?.label ?? entry.mood_key}</Text>
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

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emoji: { fontSize: 16 },
  entryDate: { fontSize: 13, color: colors.text },
  entryLabel: { fontSize: 13, color: colors.muted },
});
