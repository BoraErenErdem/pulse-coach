import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckSquare, Heart, Target, User } from "lucide-react-native";
import { useAuth } from "@/lib/auth-context";
import { PrimaryButton, colors } from "@/components/ui";

// Ruh Hali/Hedefler/Check-in'ler/Profil web'de ayrı sayfalar - burada tek
// "Diğer" sekmesi altında toplanıyor (bkz. plan: 5 sekme kararı). İçerikleri
// Faz M5'te dolduruluyor, şimdilik "yakında" satırları + gerçek logout.
const UPCOMING_ITEMS = [
  { icon: Heart, label: "Ruh Hali" },
  { icon: Target, label: "Hedefler" },
  { icon: CheckSquare, label: "Check-in'ler" },
  { icon: User, label: "Profil" },
];

export default function MoreTab() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Diğer</Text>
      {user ? <Text style={styles.email}>{user.email}</Text> : null}

      <View style={styles.list}>
        {UPCOMING_ITEMS.map(({ icon: Icon, label }) => (
          <View key={label} style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon size={18} color={colors.muted} />
              <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <Text style={styles.rowNote}>Yakında (Faz M5)</Text>
          </View>
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text,
  },
  rowNote: {
    fontSize: 12,
    color: colors.muted,
  },
  logoutWrap: {
    marginTop: "auto",
  },
});
