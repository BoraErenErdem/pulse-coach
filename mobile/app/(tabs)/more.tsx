import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, ChevronRight, Heart, Target, User } from "lucide-react-native";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { useNotifications } from "@/lib/notifications-context";
import { PrimaryButton, colors } from "@/components/ui";

// Ruh Hali/Hedefler/Bildirimler/Profil web'de ayrı sayfalar - burada tek
// "Diğer" sekmesi altında toplanıyor (bkz. plan: 5 sekme kararı). Faz M5:
// artık her satır kendi alt ekranına (mobile/app/ kökünde, tab çubuğunun
// dışında push edilen ekranlar) yönlendiriyor. "Check-in'ler" → "Bildirimler"
// (2026-08-12, push bildirimleri) - haftalık özet + günlük hatırlatma AYNI
// ekranda birleşti (bkz. mobile/app/checkins.tsx).
function menuItems(t: (tr: string, en: string) => string) {
  return [
    { icon: Heart, label: t("Ruh Hali", "Mood"), href: "/mood-history" as const },
    { icon: Target, label: t("Hedefler", "Goals"), href: "/goals" as const },
    { icon: Bell, label: t("Bildirimler", "Notifications"), href: "/checkins" as const },
    { icon: User, label: t("Profil", "Profile"), href: "/profile" as const },
  ];
}

export default function MoreTab() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const t = useT();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>{t("Diğer", "More")}</Text>
      {user ? <Text style={styles.email}>{user.email}</Text> : null}

      <View style={styles.list}>
        {menuItems(t).map(({ icon: Icon, label, href }) => (
          <Pressable key={label} onPress={() => router.push(href)} style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon size={18} color={colors.muted} />
              <Text style={styles.rowLabel}>{label}</Text>
              {href === "/checkins" && unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.logoutWrap}>
        <PrimaryButton onPress={logout}>{t("Çıkış Yap", "Log Out")}</PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  email: {
    fontSize: 13,
    color: colors.muted,
    marginTop: -12,
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  logoutWrap: {
    marginTop: "auto",
  },
});
