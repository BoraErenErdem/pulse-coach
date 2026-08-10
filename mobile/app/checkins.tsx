import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { MessageSquareHeart } from "lucide-react-native";
import { ApiError, getCheckins, type CheckinMessage, type PreferredLanguage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { DetailScreen, ErrorBanner, Skeleton, colors } from "@/components/ui";

// web/src/app/(app)/checkins/page.tsx'in mobil portu - Faz M5.
function formatDateTime(iso: string, language: PreferredLanguage): string {
  return new Date(iso).toLocaleString(language === "en" ? "en-US" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckinsScreen() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  const [checkins, setCheckins] = useState<CheckinMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kardeş push ekranları (profile/goals/mood-history) hepsi useFocusEffect
  // kullanıyor - tab'lar unmount olmadığı için düz useEffect sadece İLK
  // mount'ta çalışır, ekrana geri dönünce yeni bir haftalık check-in oluşmuş
  // olsa bile görünmezdi (2026-08-10 sekme mimarisi incelemesinde bulundu,
  // Tema B'deki aynı bug sınıfının bu ekranda unutulmuş hali).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getCheckins(token)
        .then(setCheckins)
        .catch((err) => setError(err instanceof ApiError ? err.message : t("Yüklenemedi.", "Couldn't load.")));
    }, [token, t])
  );

  return (
    <DetailScreen title={t("Check-in Mesajları", "Check-in Messages")}>
      <ScrollView contentContainerStyle={styles.container}>
        {error ? <ErrorBanner message={error} /> : null}

        {checkins === null && !error ? (
          <Skeleton height={140} />
        ) : checkins && checkins.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MessageSquareHeart size={28} color={colors.muted} />
            <Text style={styles.emptyText}>
              {t(
                "Henüz bir check-in mesajın yok. Koçun her hafta ilerlemene göre otomatik bir check-in mesajı bırakacak.",
                "You don't have a check-in message yet. Your coach will leave an automatic check-in message each week based on your progress."
              )}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {checkins?.map((checkin) => (
              <View
                key={checkin.id}
                style={[styles.checkinCard, !checkin.delivered && styles.checkinCardNew]}
              >
                <View style={styles.checkinHeader}>
                  <Text style={styles.checkinDate}>{formatDateTime(checkin.generated_at, language)}</Text>
                  {!checkin.delivered ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>{t("Yeni", "New")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.checkinMessage}>{checkin.message}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  emptyWrap: { alignItems: "center", gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: "center", paddingHorizontal: 16 },
  checkinCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  checkinCardNew: { borderColor: colors.accent },
  checkinHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkinDate: { fontSize: 11, color: colors.muted },
  newBadge: {
    backgroundColor: colors.accent + "20",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newBadgeText: { fontSize: 10, fontWeight: "600", color: colors.accent },
  checkinMessage: { fontSize: 13, color: colors.text, lineHeight: 19 },
});
