import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Bell, Dumbbell, Flame, HeartPulse, LogOut, Settings, Smile } from "lucide-react-native";
import {
  getAchievements,
  getLatestCheckin,
  getMoodHistory,
  getWeeklySummary,
  type AchievementBadge,
  type CheckinMessage,
  type MoodKey,
  type MoodLog,
  type WeeklySummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useNotifications } from "@/lib/notifications-context";
import { useProfile } from "@/lib/profile-context";
import { formatDate } from "@/lib/format";
import { displayNameOf, getTimeGreeting } from "@/lib/greeting";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { MOOD_META, type ThemeColors, useThemeColors } from "@/components/ui";
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { ScreenGlow } from "@/components/screen-glow";
import { PROFILE_SURFACE_TONE, SurfaceToneProvider } from "@/components/surface-tone";
import { celebrateOnce } from "@/components/progress-motion";
import { useGoalItems, useGoalOverview } from "@/components/goal-overview";
import { useIdentityColors } from "@/components/progress-identity";
import { useProfileAccent } from "@/components/profile-identity";
import {
  AchievementsPanel,
  badgeTitle,
  CoachNoteCard,
  ProfileGoalsCard,
  ProfileHeroCard,
  ProfileMenuPanel,
  ProfileTile,
  type ProfileMenuItem,
} from "@/components/profile-cards";

// Profil sekmesi (2026-09-25 redesign, kullanıcı onaylı plan): önceden düz bir
// kısa yol menüsüydü (kimlik rengi/yüzey tonu yoktu). Artık diğer sekmelerle
// aynı dil ve sıra: kimlik + metrikler -> hedef -> koç -> (başarılar, menü).
// Kimlik AMETİST (bkz. profile-identity.ts); alt sayfalar içeriğin sahibi olan
// sekmenin kimliğinde (Ruh Hali camgöbeği, Bildirimler koç turuncusu, Hedef
// Merkezi'nde her kart kendi sekmesinin renginde).
//
// Hareket politikası (tasarım dili §6): odaklanışta tekrar oynayan animasyon
// YOK - veri her odaklanışta tazelenir, içerik son hâliyle görünür. Tek olay
// animasyonu: yeni kazanılan rozette cihazda BİR KEZ konfeti.

const MOOD_SCORE: Record<MoodKey, number> = { zor: 1, dusuk: 2, notr: 3, iyi: 4, harika: 5 };
const SCORE_MOOD: MoodKey[] = ["zor", "dusuk", "notr", "iyi", "harika"];

// Modül seviyesinde ikon render fonksiyonları - ProfileTile memo'su her
// render'da yeni fonksiyon referansıyla boşa gitmesin (tasarım dili §9).
const streakIcon = (color: string) => <Flame size={15} color={color} />;
const workoutIcon = (color: string) => <Dumbbell size={15} color={color} />;
const moodIcon = (color: string) => <Smile size={15} color={color} />;

export default function ProfileTab() {
  return (
    <SurfaceToneProvider tone={PROFILE_SURFACE_TONE}>
      <ProfileScreen />
    </SurfaceToneProvider>
  );
}

function ProfileScreen() {
  const { token, user, logout } = useAuth();
  const { language } = useLanguage();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { profile } = useProfile();
  const router = useRouter();
  const t = useT();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(c, insets.bottom), [c, insets.bottom]);
  const accent = useProfileAccent();
  const ids = useIdentityColors();

  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [moodWeek, setMoodWeek] = useState<MoodLog[] | null>(null);
  const [latestCheckin, setLatestCheckin] = useState<CheckinMessage | null>(null);
  const [badges, setBadges] = useState<AchievementBadge[] | null>(null);
  // "İlk yükleme bitti" bir kez true olur, sonraki tazelemelerde sıfırlanmaz
  // (tasarım dili §9 - iskelet/kart her odaklanışta yeniden mount olmasın).
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [badgeHint, setBadgeHint] = useState<string | null>(null);

  const { data: goalData, reload: reloadGoals } = useGoalOverview(token);
  const goalGroups = useGoalItems(profile, goalData);
  const goalItems = useMemo(
    () => [...goalGroups.progress, ...goalGroups.workouts, ...goalGroups.nutrition],
    [goalGroups]
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    await Promise.allSettled([
      getWeeklySummary(token).then(setSummary),
      getMoodHistory(token, 7).then(setMoodWeek),
      getLatestCheckin(token).then(setLatestCheckin),
      getAchievements(token).then((result) => setBadges(result.badges)),
      reloadGoals(),
    ]);
    refreshUnreadCount();
    setHasLoaded(true);
  }, [token, reloadGoals, refreshUnreadCount]);

  useDebouncedFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  // C katmanı (gerçek olay): yeni kazanılan rozet cihazda BİR KEZ kutlanır.
  useEffect(() => {
    if (!badges) return;
    let cancelled = false;
    (async () => {
      const fresh: string[] = [];
      for (const badge of badges) {
        if (badge.earned && (await celebrateOnce(`badge_${badge.key}`))) fresh.push(badge.key);
      }
      if (cancelled || fresh.length === 0) return;
      setCelebrateKey((k) => k + 1);
      tapSuccess();
      setBadgeHint(
        fresh.length === 1
          ? t(`🏅 Yeni rozet: ${badgeTitle(fresh[0], language)}`, `🏅 New badge: ${badgeTitle(fresh[0], language)}`)
          : t(`🏅 ${fresh.length} yeni rozet kazandın!`, `🏅 You earned ${fresh.length} new badges!`)
      );
      setTimeout(() => setBadgeHint(null), 6000);
    })();
    return () => {
      cancelled = true;
    };
  }, [badges, t, language]);

  const go = useCallback((href: Href) => router.push(href), [router]);

  // ---- kimlik kartı
  const name = user ? displayNameOf(profile, user.email) : "";
  const memberSince = user?.created_at
    ? t(
        `Üye: ${formatDate(user.created_at, language, { month: "long", year: "numeric" })}`,
        `Member since ${formatDate(user.created_at, language, { month: "long", year: "numeric" })}`
      )
    : null;
  const GOAL_LABELS: Record<string, string> = {
    weight_loss: t("Kilo vermek", "Lose weight"),
    muscle_gain: t("Kas yapmak", "Build muscle"),
    general_health: t("Genel sağlık", "General health"),
  };
  const ACTIVITY_LABELS: Record<string, string> = {
    sedentary: t("Hareketsiz", "Sedentary"),
    light: t("Hafif aktif", "Lightly active"),
    moderate: t("Orta aktif", "Moderately active"),
    active: t("Çok aktif", "Very active"),
  };
  const TONE_LABELS: Record<string, string> = {
    sicak: t("Koç: Samimi", "Coach: Warm"),
    enerjik: t("Koç: Enerjik", "Coach: Energetic"),
    notr: t("Koç: Nötr", "Coach: Neutral"),
  };
  const heroChips = [
    profile?.goal ? GOAL_LABELS[profile.goal] : null,
    profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level] : null,
    TONE_LABELS[profile?.coach_tone ?? "notr"],
  ].filter((chip): chip is string => !!chip);

  // ---- kutular
  const streak = summary?.streak_days ?? null;
  const weekly = goalData?.weeklyGoal ?? null;
  const workoutValue = weekly?.goal_days ? `${weekly.done_days}/${weekly.goal_days}` : summary ? String(summary.workout_count) : "–";
  const moodAverage = useMemo(() => {
    if (!moodWeek || moodWeek.length === 0) return null;
    const avg = moodWeek.reduce((sum, entry) => sum + MOOD_SCORE[entry.mood_key], 0) / moodWeek.length;
    return SCORE_MOOD[Math.min(4, Math.max(0, Math.round(avg) - 1))];
  }, [moodWeek]);

  const menuItems: ProfileMenuItem[] = [
    {
      key: "mood",
      icon: HeartPulse,
      color: ids.mood,
      label: t("Ruh Hali Geçmişi", "Mood History"),
      hint: t("Takvim, trend ve koç gözlemi", "Calendar, trend and coach observation"),
      onPress: () => go("/mood-history"),
    },
    {
      key: "checkins",
      icon: Bell,
      color: c.accent,
      label: t("Bildirimler", "Notifications"),
      hint: t("Koçunun mesajları", "Messages from your coach"),
      badge: unreadCount,
      onPress: () => go("/checkins"),
    },
    {
      key: "settings",
      icon: Settings,
      color: accent.text,
      label: t("Hesap ve Ayarlar", "Account & Settings"),
      hint: t("Bilgilerin, tercihler, bildirimler, veri", "Your info, preferences, notifications, data"),
      onPress: () => go("/profile-settings"),
    },
  ];

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenGlow height={420} />
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={accent.graphic}
            onRefresh={async () => {
              setIsRefreshing(true);
              await loadAll();
              setIsRefreshing(false);
            }}
          />
        }
      >
        <Text style={s.title}>{t("Profil", "Profile")}</Text>

        <ProfileHeroCard
          initial={name.charAt(0).toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR") || "?"}
          greeting={getTimeGreeting(new Date(), language)}
          name={name}
          memberSince={memberSince}
          chips={heroChips}
          restrictions={profile?.dietary_restrictions ?? null}
          needsSetup={profile != null && profile.goal === null}
          onEdit={() => go("/profile-settings")}
        />

        <View style={s.tileRow}>
          <ProfileTile
            tileKey="streak"
            icon={streakIcon}
            label={t("Seri", "Streak")}
            value={streak != null ? t(`${streak} gün`, `${streak} d`) : "–"}
            hint={t("üst üste", "in a row")}
            onPress={() => go("/progress")}
          />
          <ProfileTile
            tileKey="workouts"
            icon={workoutIcon}
            label={t("Bu Hafta", "This Week")}
            value={workoutValue}
            hint={weekly?.goal_days ? t("antrenman günü", "workout days") : t("antrenman", "workouts")}
            onPress={() => go("/workouts")}
          />
          <ProfileTile
            tileKey="mood"
            icon={moodIcon}
            label={t("Ruh Hali", "Mood")}
            value={moodAverage ? MOOD_META[moodAverage].emoji : "–"}
            hint={moodAverage ? t(MOOD_META[moodAverage].tr, MOOD_META[moodAverage].en) : t("kayıt yok", "no entries")}
            onPress={() => go("/mood-history")}
          />
        </View>

        <ProfileGoalsCard items={goalItems} loading={!goalData} onPress={() => go("/goals")} />

        <CoachNoteCard checkin={latestCheckin} unread={unreadCount} loading={!hasLoaded} onPress={() => go("/checkins")} />

        <AchievementsPanel badges={badges} celebrateKey={celebrateKey} hint={badgeHint} />

        <ProfileMenuPanel items={menuItems} toneFrom={0.6} toneTo={0.9} />

        <Pressable
          onPress={() => {
            tapLight();
            logout();
          }}
          style={({ pressed }) => [s.logout, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <LogOut size={17} color={c.error} />
          <Text style={[s.logoutText, { color: c.error }]}>{t("Çıkış Yap", "Log Out")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors, insetBottom: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 14, paddingBottom: 24 + getFloatingTabBarClearance(insetBottom) },
    title: { fontSize: 30, fontFamily: "Inter_500Medium", color: c.text, marginBottom: 2 },
    tileRow: { flexDirection: "row", gap: 10 },
    logout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${c.error}55`,
      marginTop: 4,
    },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });
}
