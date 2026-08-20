import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeIn } from "react-native-reanimated";
import { CheckCheck, MessageSquareHeart, Trash2 } from "lucide-react-native";
import {
  ApiError,
  deleteAllCheckins,
  deleteCheckin,
  getCheckins,
  markAllCheckinsRead,
  type CheckinMessage,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useNotifications } from "@/lib/notifications-context";
import { DetailScreen, EmptyState, ErrorBanner, Skeleton, type ThemeColors, useThemeColors } from "@/components/ui";
import { SwipeableRow } from "@/components/swipeable-row";

// web/src/app/(app)/checkins/page.tsx'in mobil portu - Faz M5.
// Redesign (Faz M2b, 2026-08-15): statik `colors` (ve sabit `#fff` kart
// arkaplanı - koyu modda kırık duruyordu) yerine `useThemeColors()`; kendi
// elle yazılmış `Swipeable` kopyası, artık başka üç ekranın da kullandığı
// paylaşımlı `SwipeableRow`a geçirildi (bkz. redesign planı Faz M2:
// "checkins.tsx zaten Swipeable kullanıyor - tekilleştirilip yaygınlaştırılabilir").
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
  const { refreshUnreadCount } = useNotifications();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [checkins, setCheckins] = useState<CheckinMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);

  // Kardeş push ekranları (profile/goals/mood-history) hepsi useFocusEffect
  // kullanıyor - tab'lar unmount olmadığı için düz useEffect sadece İLK
  // mount'ta çalışır, ekrana geri dönünce yeni bir haftalık check-in oluşmuş
  // olsa bile görünmezdi (2026-08-10 sekme mimarisi incelemesinde bulundu,
  // Tema B'deki aynı bug sınıfının bu ekranda unutulmuş hali).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getCheckins(token)
        .then((data) => {
          setCheckins(data);
          // list_checkins zaten sunucu tarafında delivered=True işaretledi -
          // "Diğer" menüsündeki rozeti de aynı anda tazeliyoruz.
          refreshUnreadCount();
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : t("Yüklenemedi.", "Couldn't load.")));
    }, [token, t, refreshUnreadCount])
  );

  const hasUnread = (checkins ?? []).some((c) => !c.delivered);

  async function handleMarkAllRead() {
    if (!token) return;
    setActionError(null);
    try {
      await markAllCheckinsRead(token);
      setCheckins((prev) => (prev ? prev.map((c) => ({ ...c, delivered: true })) : prev));
      refreshUnreadCount();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Yapılamadı, tekrar dener misin?", "Couldn't do that, want to try again?"));
    }
  }

  async function handleDeleteOne(checkinId: number) {
    if (!token) return;
    setActionError(null);
    try {
      await deleteCheckin(token, checkinId);
      setCheckins((prev) => (prev ? prev.filter((c) => c.id !== checkinId) : prev));
      refreshUnreadCount();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  async function handleDeleteAll() {
    if (!token) return;
    if (!isConfirmingDeleteAll) {
      // İki adımlı onay - geri alınamaz toplu bir işlem, tek dokunuşla
      // yanlışlıkla tetiklenmesin (web'deki AYNI desen, bkz. checkins/page.tsx).
      setIsConfirmingDeleteAll(true);
      return;
    }
    setActionError(null);
    try {
      await deleteAllCheckins(token);
      setCheckins([]);
      refreshUnreadCount();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    } finally {
      setIsConfirmingDeleteAll(false);
    }
  }

  return (
    <DetailScreen title={t("Bildirimler", "Notifications")}>
      <ScrollView contentContainerStyle={s.container}>
        {checkins && checkins.length > 0 ? (
          <Animated.View entering={FadeIn.duration(250)} style={s.actionRow}>
            <Pressable
              onPress={handleMarkAllRead}
              disabled={!hasUnread}
              hitSlop={6}
              style={[s.actionButton, !hasUnread && s.actionButtonDisabled]}
            >
              <CheckCheck size={14} color={c.muted} />
              <Text style={s.actionButtonText}>{t("Tümünü okundu işaretle", "Mark all as read")}</Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteAll}
              hitSlop={6}
              style={[s.actionButton, isConfirmingDeleteAll && s.actionButtonConfirm]}
            >
              <Trash2 size={14} color={isConfirmingDeleteAll ? "#fff" : c.muted} />
              <Text style={[s.actionButtonText, isConfirmingDeleteAll && s.actionButtonConfirmText]}>
                {isConfirmingDeleteAll ? t("Emin misin?", "Are you sure?") : t("Tümünü sil", "Delete all")}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}

        {checkins === null && !error ? (
          <Skeleton height={140} />
        ) : checkins && checkins.length === 0 ? (
          <EmptyState
            icon={<MessageSquareHeart size={28} color={c.muted} />}
            message={t(
              "Henüz bir bildirimin yok. Koçun haftalık ilerleme özetini ve gerektiğinde günlük hatırlatmaları burada bırakacak.",
              "You don't have any notifications yet. Your coach will leave your weekly progress summary and, when needed, daily reminders here."
            )}
          />
        ) : (
          <Animated.View entering={FadeIn.delay(60).duration(250)} style={{ gap: 12 }}>
            {checkins?.map((checkin) => (
              <SwipeableRow key={checkin.id} onDelete={() => handleDeleteOne(checkin.id)}>
                <View style={[s.checkinCard, !checkin.delivered && s.checkinCardNew]}>
                  <View style={s.checkinHeader}>
                    <Text style={s.checkinDate}>{formatDateTime(checkin.generated_at, language)}</Text>
                    {!checkin.delivered ? (
                      <View style={s.newBadge}>
                        <Text style={s.newBadgeText}>{t("Yeni", "New")}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.checkinMessage}>{checkin.message}</Text>
                </View>
              </SwipeableRow>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    actionButtonDisabled: { opacity: 0.4 },
    actionButtonConfirm: { backgroundColor: c.error, borderColor: c.error },
    actionButtonText: { fontSize: 11, fontWeight: "600", color: c.muted },
    actionButtonConfirmText: { color: "#fff" },
    checkinCard: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 6,
    },
    checkinCardNew: { borderColor: c.accent },
    checkinHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    checkinDate: { fontSize: 11, color: c.muted },
    newBadge: {
      backgroundColor: `${c.accent}20`,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    newBadgeText: { fontSize: 10, fontWeight: "600", color: c.accent },
    checkinMessage: { fontSize: 13, color: c.text, lineHeight: 19 },
  });
}
