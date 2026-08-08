import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { deleteTodayMood, getTodayMood, setTodayMood, type MoodKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { colors } from "@/components/ui";

// web/src/components/MoodPicker.tsx'in mobil portu - aynı davranış (seçim
// mood_logs'ta kalıcı, orchestrator prompt'una SADECE ton için bağlam
// ekliyor, kriz tespitini hiç etkilemiyor - bkz. backend mood_support_agent).
export function MoodPicker() {
  const { token } = useAuth();
  const t = useT();
  const [selected, setSelected] = useState<MoodKey | null>(null);
  const [isPending, setIsPending] = useState(false);

  const MOOD_OPTIONS: { key: MoodKey; emoji: string; label: string }[] = [
    { key: "zor", emoji: "😔", label: t("Zor", "Tough") },
    { key: "dusuk", emoji: "😕", label: t("Düşük", "Low") },
    { key: "notr", emoji: "🙂", label: t("Nötr", "Neutral") },
    { key: "iyi", emoji: "😊", label: t("İyi", "Good") },
    { key: "harika", emoji: "🤩", label: t("Harika", "Great") },
  ];

  useEffect(() => {
    if (!token) return;
    getTodayMood(token)
      .then((mood) => setSelected(mood?.mood_key ?? null))
      .catch(() => {});
  }, [token]);

  async function handleSelect(key: MoodKey) {
    if (!token || isPending) return;
    const previous = selected;
    const next = selected === key ? null : key;
    setSelected(next);
    setIsPending(true);
    try {
      if (next) {
        await setTodayMood(token, next);
      } else {
        await deleteTodayMood(token);
      }
    } catch {
      setSelected(previous);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</Text>
      <View style={styles.options}>
        {MOOD_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            disabled={isPending}
            style={[styles.bubble, selected === option.key && styles.bubbleActive]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
          </Pressable>
        ))}
        {isPending ? <ActivityIndicator size="small" style={{ marginLeft: 4 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
  },
  options: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  bubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleActive: {
    backgroundColor: "#fdf1e0",
  },
  emoji: {
    fontSize: 16,
  },
});
