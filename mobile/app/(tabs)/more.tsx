import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CheckSquare, ChevronRight, Heart, Target, User } from "lucide-react-native";
import { useAuth } from "@/lib/auth-context";
import { PrimaryButton, colors } from "@/components/ui";

// Ruh Hali/Hedefler/Check-in'ler/Profil web'de ayrı sayfalar - burada tek
// "Diğer" sekmesi altında toplanıyor (bkz. plan: 5 sekme kararı). Faz M5:
// artık her satır kendi alt ekranına (mobile/app/ kökünde, tab çubuğunun
// dışında push edilen ekranlar) yönlendiriyor.
const MENU_ITEMS = [
  { icon: Heart, label: "Ruh Hali", href: "/mood-history" as const },
  { icon: Target, label: "Hedefler", href: "/goals" as const },
  { icon: CheckSquare, label: "Check-in'ler", href: "/checkins" as const },
  { icon: User, label: "Profil", href: "/profile" as const },
];

export default function MoreTab() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Diğer</Text>
      {user ? <Text style={styles.email}>{user.email}</Text> : null}

      <View style={styles.list}>
        {MENU_ITEMS.map(({ icon: Icon, label, href }) => (
          <Pressable key={label} onPress={() => router.push(href)} style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon size={18} color={colors.muted} />
              <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.logoutWrap}>
        <PrimaryButton onPress={logout}>Çıkış Yap</PrimaryButton>
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
  logoutWrap: {
    marginTop: "auto",
  },
});
