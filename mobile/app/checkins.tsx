import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
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
import { DetailScreen, EmptyState, ErrorBanner, Skeleton, colors } from "@/components/ui";

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
  const { refreshUnreadCount } = useNotifications();
  const t = useT();
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
      <ScrollView contentContainerStyle={styles.container}>
        {checkins && checkins.length > 0 ? (
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleMarkAllRead}
              disabled={!hasUnread}
              hitSlop={6}
              style={[styles.actionButton, !hasUnread && styles.actionButtonDisabled]}
            >
              <CheckCheck size={14} color={colors.muted} />
              <Text style={styles.actionButtonText}>{t("Tümünü okundu işaretle", "Mark all as read")}</Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteAll}
              hitSlop={6}
              style={[styles.actionButton, isConfirmingDeleteAll && styles.actionButtonConfirm]}
            >
              <Trash2 size={14} color={isConfirmingDeleteAll ? "#fff" : colors.muted} />
              <Text style={[styles.actionButtonText, isConfirmingDeleteAll && styles.actionButtonConfirmText]}>
                {isConfirmingDeleteAll ? t("Emin misin?", "Are you sure?") : t("Tümünü sil", "Delete all")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}

        {checkins === null && !error ? (
          <Skeleton height={140} />
        ) : checkins && checkins.length === 0 ? (
          <EmptyState
            icon={<MessageSquareHeart size={28} color={colors.muted} />}
            message={t(
              "Henüz bir bildirimin yok. Koçun haftalık ilerleme özetini ve gerektiğinde günlük hatırlatmaları burada bırakacak.",
              "You don't have any notifications yet. Your coach will leave your weekly progress summary and, when needed, daily reminders here."
            )}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {checkins?.map((checkin) => (
              <CheckinRow
                key={checkin.id}
                checkin={checkin}
                language={language}
                newLabel={t("Yeni", "New")}
                onDelete={() => handleDeleteOne(checkin.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

/** Yana kaydırınca (sağdan sola) kırmızı bir "Sil" eylemi ortaya çıkarır -
 * kullanıcı bilerek o eyleme dokunmadıkça silmez (tam kaydırıp bırakmak da
 * yeterli, Swipeable'ın varsayılan overshoot/threshold davranışı). */
function CheckinRow({
  checkin,
  language,
  newLabel,
  onDelete,
}: {
  checkin: CheckinMessage;
  language: PreferredLanguage;
  newLabel: string;
  onDelete: () => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={styles.swipeDeleteAction}
        >
          <Trash2 size={20} color="#fff" />
        </Pressable>
      )}
      overshootRight={false}
    >
      <View style={[styles.checkinCard, !checkin.delivered && styles.checkinCardNew]}>
        <View style={styles.checkinHeader}>
          <Text style={styles.checkinDate}>{formatDateTime(checkin.generated_at, language)}</Text>
          {!checkin.delivered ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{newLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.checkinMessage}>{checkin.message}</Text>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonConfirm: { backgroundColor: colors.error, borderColor: colors.error },
  actionButtonText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  actionButtonConfirmText: { color: "#fff" },
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
  swipeDeleteAction: {
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    borderRadius: 12,
    marginLeft: 8,
  },
});
