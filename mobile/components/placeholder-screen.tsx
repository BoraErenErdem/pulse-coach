import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/components/ui";

/** Faz M2-M5'te gerçek içerikle değiştirilecek geçici sekme ekranı. */
export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  note: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
});
