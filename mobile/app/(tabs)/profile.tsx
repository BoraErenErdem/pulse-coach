import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import { Bell, ChevronRight, Flame, Heart, LogOut, Target, User } from "lucide-react-native";
import { getWeeklySummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useNotifications } from "@/lib/notifications-context";
import { getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { tapLight } from "@/lib/haptics";
import { Card, Reveal, SecondaryButton, type ThemeColors, useIsActiveTab, useThemeColors } from "@/components/ui";

// 2026-08-15 (Faz M2, mobile-native redesign): eskiden "Diğer" adında düz bir
// Pressable satır listesiydi (bkz. git geçmişi more.tsx) - kullanıcı bunun
// jenerik bir "çöp çekmecesi" gibi hissettirdiğini belirtti. Artık gerçek bir
// "Profil" sekmesi: gruplandırılmış kartlar (Bugün/Hedefler/Hesap), her satır
// kendi anlamlı grubunda. Asıl ayarlar (hedef/aktivite/dil/bildirim/veri/hesap
// silme) `profile-settings.tsx`e taşındı - bu ekran SADECE bir hub/kısa yol
// menüsü.
function MenuRow({
  icon: Icon,
  label,
  badge,
  onPress,
  c,
}: {
  icon: typeof Heart;
  label: string;
  badge?: number;
  onPress: () => void;
  c: ThemeColors;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
    >
      <View style={s.rowLeft}>
        <View style={s.rowIconWrap}>
          <Icon size={17} color={c.accent} />
        </View>
        <Text style={s.rowLabel}>{label}</Text>
        {badge && badge > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={c.muted} />
    </Pressable>
  );
}

export default function ProfileTab() {
  const { token, user, logout } = useAuth();
  const { language } = useLanguage();
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  // Sadece GERÇEK bir sekme değişiminde yeniden oynasın - alt sayfa (Ruh
  // Hali Geçmişi/Bildirimler/Hedefler/Ayarlar) push/pop edilirken DEĞİL
  // (kullanıcı bulgusu: "profil sekmesinin içindeki herhangi bir sayfaya
  // girip çıktığımda profil sekmesi baştan yükleniyor gibi geç geliyor").
  // Bkz. ui.tsx::Reveal'daki `active` prop notu.
  const isActive = useIsActiveTab("profile");

  // Kimlik kartı (2026-08-21 tasarım denetimi): bu hub ekranı diğer
  // sekmelere (Sohbet/İlerleme/Antrenman/Beslenme - hepsinde renkli
  // StatTile/halka/grafik var) kıyasla "kişiliksiz" bulundu - sade bir
  // e-posta + düz menü listesiydi, altında da Çıkış Yap'ı dibe iten koca
  // bir boşluk vardı. Yeni bir backend alanı GEREKMEDEN (streak zaten
  // İlerleme sekmesinin kullandığı aynı endpoint'te) küçük bir karşılama +
  // seri rozeti ekleniyor - diğer sekmelerle aynı "canlı" hissi taşır.
  const [streakDays, setStreakDays] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getWeeklySummary(token)
        .then((summary) => setStreakDays(summary.streak_days))
        .catch(() => {});
    }, [token])
  );

  function go(href: Href) {
    return () => router.push(href);
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.container}>
        <Text style={s.title}>{t("Profil", "Profile")}</Text>
        {user ? <Text style={s.email}>{user.email}</Text> : null}

        <Reveal active={isActive}>
          <View style={s.identityCard}>
            <Text style={s.identityGreeting}>
              {getTimeGreeting(new Date(), language)}
              {user ? `, ${nameFromEmail(user.email)}` : ""}
            </Text>
            <View style={s.identityStreak}>
              <Flame size={16} color={streakDays && streakDays > 0 ? c.accent : c.muted} />
              <Text style={s.identityStreakText}>
                {streakDays != null
                  ? t(`${streakDays} gün üst üste`, `${streakDays}-day streak`)
                  : t("Seri yükleniyor...", "Loading streak...")}
              </Text>
            </View>
          </View>
        </Reveal>

        <Reveal active={isActive} delay={60}>
          <Text style={s.sectionLabel}>{t("BUGÜN", "TODAY")}</Text>
          <Card>
            <MenuRow icon={Heart} label={t("Ruh Hali Geçmişi", "Mood History")} onPress={go("/mood-history")} c={c} />
            <View style={s.divider} />
            <MenuRow
              icon={Bell}
              label={t("Bildirimler", "Notifications")}
              badge={unreadCount}
              onPress={go("/checkins")}
              c={c}
            />
          </Card>
        </Reveal>

        <Reveal active={isActive} delay={120}>
          <Text style={s.sectionLabel}>{t("HEDEFLER", "GOALS")}</Text>
          <Card>
            <MenuRow icon={Target} label={t("Egzersiz + Beslenme", "Exercise + Nutrition")} onPress={go("/goals")} c={c} />
          </Card>
        </Reveal>

        <Reveal active={isActive} delay={180}>
          <Text style={s.sectionLabel}>{t("HESAP", "ACCOUNT")}</Text>
          <Card>
            <MenuRow
              icon={User}
              label={t("Ayarlar, dil, veri", "Settings, language, data")}
              onPress={go("/profile-settings")}
              c={c}
            />
          </Card>
        </Reveal>

        <View style={s.logoutWrap}>
          <SecondaryButton
            onPress={() => {
              tapLight();
              logout();
            }}
          >
            <LogOut size={16} color={c.text} />
            {t("Çıkış Yap", "Log Out")}
          </SecondaryButton>
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, padding: 20, gap: 6 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.text },
    email: { fontSize: 13, color: c.muted, marginTop: -2, marginBottom: 10 },
    // Kimlik kartı - bkz. ProfileTab içindeki tanıtım notu. Card BİLEREK
    // kullanılmıyor (o dolgu+kenarlıklı bir kutu, bu daha hafif bir
    // karşılama şeridi - diğer 3 Card'dan görsel olarak AYRIŞIYOR, çünkü
    // bir "menü grubu" değil).
    identityCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
      marginBottom: 4,
    },
    identityGreeting: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    identityStreak: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: `${c.accent}1F`,
    },
    identityStreakText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 14,
      marginBottom: 6,
      marginLeft: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
    },
    rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    rowIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: `${c.accent}1F`,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { fontSize: 14, color: c.text, flex: 1 },
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: c.error,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 2 },
    logoutWrap: { marginTop: "auto", paddingTop: 16 },
  });
}
