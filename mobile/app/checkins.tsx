import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { BellRing, CalendarCheck, CheckCheck, MessageSquareHeart, Settings, Trash2 } from "lucide-react-native";
import {
  ApiError,
  deleteAllCheckins,
  deleteCheckin,
  getCheckins,
  markAllCheckinsRead,
  type CheckinKind,
  type CheckinMessage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useNotifications } from "@/lib/notifications-context";
import { useTheme } from "@/lib/theme-context";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { DetailScreen, ErrorBanner, Skeleton, type ThemeColors, useThemeColors } from "@/components/ui";
import { SwipeableRow } from "@/components/swipeable-row";
import { GlassShell } from "@/components/progress-cards";
import { PROGRESS_SURFACE_TONE, SurfaceToneProvider, useRampColor } from "@/components/surface-tone";
import { SegmentToggle } from "@/components/nutrition-cards";
import { relativeDay } from "@/components/profile-cards";

// Profil > Bildirimler (2026-09-25 redesign). Mesajlar KOÇTAN geldiği için
// kimlik koçun/Sohbet'in turuncusu (İlerleme'nin yüzey tonu). Önceden düz, soğuk
// kartlardı; artık sıcak panel kartları, güne göre gruplar (Bugün/Dün/Bu hafta/
// Daha eski), türe göre ikon + filtre ve 44pt toplu işlem düğmeleri.
// Liste GET'i sunucuda "okundu" işaretliyor ama bu yanıtta eski durumu döner
// (bkz. checkin_service.list_and_mark_delivered) - "Yeni" rozeti bir kez görünür.

type Filter = "all" | CheckinKind;
const DAY_MS = 86400000;

function dayGroup(iso: string): "today" | "yesterday" | "week" | "older" {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

export default function CheckinsScreen() {
  // Koçun turuncusu - İlerleme/Sohbet'le aynı aile, sıcak nötr panel tabanı
  // (varsayılan turuncu-kahve rampa uzun mesaj listesinde çok baskındı).
  return (
    <SurfaceToneProvider tone={PROGRESS_SURFACE_TONE}>
      <Checkins />
    </SurfaceToneProvider>
  );
}

function Checkins() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const { refreshUnreadCount } = useNotifications();
  const router = useRouter();
  const t = useT();
  const c = useThemeColors();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ramp = useRampColor();
  const s = useMemo(() => makeStyles(c, isDark), [c, isDark]);
  const [checkins, setCheckins] = useState<CheckinMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const KIND_META: Record<CheckinKind, { icon: typeof BellRing; label: string; color: string }> = {
    weekly_summary: { icon: CalendarCheck, label: t("Haftalık özet", "Weekly summary"), color: c.accent },
    daily_nudge: { icon: BellRing, label: t("Hatırlatma", "Reminder"), color: c.insightAccent },
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getCheckins(token);
      setCheckins(data);
      setError(null);
      // Liste sunucuda okundu işaretlendi - rozeti de hemen tazele.
      refreshUnreadCount();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Yüklenemedi.", "Couldn't load."));
    }
  }, [token, t, refreshUnreadCount]);

  useDebouncedFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const unread = (checkins ?? []).filter((item) => !item.delivered).length;
  const visible = useMemo(
    () => (checkins ?? []).filter((item) => filter === "all" || item.kind === filter),
    [checkins, filter]
  );
  const groups = useMemo(() => {
    const order: ("today" | "yesterday" | "week" | "older")[] = ["today", "yesterday", "week", "older"];
    const map = new Map<string, CheckinMessage[]>();
    for (const item of visible) {
      const key = dayGroup(item.generated_at);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return order.filter((key) => map.has(key)).map((key) => ({ key, items: map.get(key)! }));
  }, [visible]);
  const GROUP_LABELS = {
    today: t("Bugün", "Today"),
    yesterday: t("Dün", "Yesterday"),
    week: t("Bu hafta", "This week"),
    older: t("Daha eski", "Older"),
  };

  async function handleMarkAllRead() {
    if (!token) return;
    setActionError(null);
    try {
      await markAllCheckinsRead(token);
      setCheckins((prev) => (prev ? prev.map((item) => ({ ...item, delivered: true })) : prev));
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
      setCheckins((prev) => (prev ? prev.filter((item) => item.id !== checkinId) : prev));
      refreshUnreadCount();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  async function handleDeleteAll() {
    if (!token) return;
    if (!isConfirmingDeleteAll) {
      // İki adımlı onay - geri alınamaz toplu işlem; 4 sn içinde onaylanmazsa geri döner.
      setIsConfirmingDeleteAll(true);
      confirmTimer.current = setTimeout(() => setIsConfirmingDeleteAll(false), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
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

  const text = isDark ? "#FFFFFF" : c.text;
  const muted = isDark ? "rgba(255,255,255,0.75)" : c.muted;
  const filterOptions = useMemo(
    () =>
      [
        { key: "all" as Filter, label: t("Tümü", "All") },
        { key: "weekly_summary" as Filter, label: t("Haftalık", "Weekly") },
        { key: "daily_nudge" as Filter, label: t("Hatırlatma", "Reminders") },
      ] as const,
    [t]
  );

  return (
    <DetailScreen title={t("Bildirimler", "Notifications")} subtitle={unread > 0 ? t(`${unread} yeni mesaj`, `${unread} new messages`) : undefined} glowHeight={300}>
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={c.accent}
            onRefresh={async () => {
              setIsRefreshing(true);
              await load();
              setIsRefreshing(false);
            }}
          />
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        {actionError ? <ErrorBanner message={actionError} /> : null}

        {checkins === null && !error ? (
          <>
            <Skeleton height={60} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </>
        ) : checkins && checkins.length === 0 ? (
          <GlassShell gradient={[ramp(0), ramp(0.3)]} lightFill="rgba(255,255,255,0.85)" radius={22} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} subtle>
            <View style={s.emptyBody}>
              <View style={[s.kindIcon, s.emptyIcon, { backgroundColor: `${c.accent}26`, borderColor: `${c.accent}66` }]}>
                <MessageSquareHeart size={24} color={c.accent} />
              </View>
              <Text style={[s.emptyTitle, { color: text }]}>{t("Henüz bildirimin yok", "No notifications yet")}</Text>
              <Text style={[s.emptyText, { color: muted }]}>
                {t(
                  "Koçun haftalık ilerleme özetini ve gerektiğinde günlük hatırlatmaları burada bırakacak.",
                  "Your coach will leave your weekly progress summary and, when needed, daily reminders here."
                )}
              </Text>
              <Pressable onPress={() => router.push("/profile-settings")} style={s.linkRow} accessibilityRole="button">
                <Settings size={15} color={c.accent} />
                <Text style={[s.linkText, { color: c.accent }]}>{t("Bildirim tercihleri", "Notification preferences")}</Text>
              </Pressable>
            </View>
          </GlassShell>
        ) : (
          <>
            <SegmentToggle
              options={filterOptions}
              value={filter}
              onChange={setFilter}
              colors={{ accent: c.accent, fill: c.accentSolid, onFill: c.onAccentSolid }}
            />
            <View style={s.actionRow}>
              <Pressable
                onPress={handleMarkAllRead}
                disabled={unread === 0}
                style={({ pressed }) => [s.actionButton, unread === 0 && s.actionDisabled, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: unread === 0 }}
              >
                <CheckCheck size={16} color={muted} />
                <Text style={[s.actionText, { color: text }]}>{t("Tümünü okundu say", "Mark all read")}</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteAll}
                style={({ pressed }) => [s.actionButton, isConfirmingDeleteAll && { backgroundColor: c.error, borderColor: c.error }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Trash2 size={16} color={isConfirmingDeleteAll ? "#FFFFFF" : muted} />
                <Text style={[s.actionText, { color: isConfirmingDeleteAll ? "#FFFFFF" : text }]}>
                  {isConfirmingDeleteAll ? t("Emin misin?", "Are you sure?") : t("Tümünü sil", "Delete all")}
                </Text>
              </Pressable>
            </View>
            <Text style={[s.hint, { color: c.muted }]}>{t("Tek bir mesajı silmek için sola kaydır.", "Swipe left to delete a message.")}</Text>

            {visible.length === 0 ? (
              <Text style={[s.emptyText, { color: c.muted, textAlign: "center" }]}>{t("Bu türde mesaj yok.", "No messages of this type.")}</Text>
            ) : null}

            {groups.map((group, groupIndex) => (
              <View key={group.key} style={{ gap: 10 }}>
                <Text style={[s.groupLabel, { color: c.muted }]}>{GROUP_LABELS[group.key]}</Text>
                {group.items.map((item) => {
                  const meta = KIND_META[item.kind] ?? KIND_META.weekly_summary;
                  const Icon = meta.icon;
                  const tone = Math.min(0.85, groupIndex * 0.25);
                  return (
                    <SwipeableRow key={item.id} onDelete={() => handleDeleteOne(item.id)}>
                      <GlassShell
                        gradient={[ramp(tone), ramp(tone + 0.15)]}
                        lightFill="rgba(255,255,255,0.88)"
                        radius={18}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        subtle
                        accentBorder={item.delivered ? undefined : meta.color}
                        glow={item.delivered ? undefined : meta.color}
                      >
                        <View style={s.cardBody}>
                          <View style={s.cardHead}>
                            <View style={[s.kindIcon, { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}66` }]}>
                              <Icon size={15} color={meta.color} />
                            </View>
                            <Text style={[s.kindLabel, { color: text }]}>{meta.label}</Text>
                            <Text style={[s.time, { color: muted }]}>{relativeDay(item.generated_at, language, t)}</Text>
                            {!item.delivered ? (
                              <View style={[s.newPill, { backgroundColor: meta.color }]}>
                                <Text style={[s.newText, { color: isDark ? "#1E1208" : "#FFFFFF" }]}>{t("Yeni", "New")}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[s.message, { color: text }]}>{item.message}</Text>
                        </View>
                      </GlassShell>
                    </SwipeableRow>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { padding: 16, gap: 14, paddingBottom: 40 },
    actionRow: { flexDirection: "row", gap: 8 },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.16)" : c.border,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
    },
    actionDisabled: { opacity: 0.45 },
    actionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    hint: { fontSize: 12, marginTop: -4 },
    groupLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4, marginLeft: 2 },
    cardBody: { padding: 16, gap: 10 },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    kindIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    kindLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    time: { flex: 1, fontSize: 12, textAlign: "right" },
    newPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    newText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    message: { fontSize: 14, lineHeight: 21 },
    emptyBody: { padding: 22, alignItems: "center", gap: 10 },
    emptyIcon: { width: 52, height: 52, borderRadius: 26 },
    emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
    linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  });
}
