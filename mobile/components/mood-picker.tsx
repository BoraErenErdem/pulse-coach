import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { deleteTodayMood, getTodayMood, setTodayMood, type MoodKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { MOOD_KEYS, MOOD_META, type ThemeColors, useThemeColors } from "@/components/ui";
import { tapLight } from "@/lib/haptics";

// web/src/components/MoodPicker.tsx'in mobil portu - aynı davranış (seçim
// mood_logs'ta kalıcı, orchestrator prompt'una SADECE ton için bağlam
// ekliyor, kriz tespitini hiç etkilemiyor - bkz. backend mood_support_agent).
// 2026-08-15 (Faz M2b): `useThemeColors()`'a geçirildi - ÖNCEDEN statik
// (sadece açık tema) renkler kullanıyordu, Sohbet ekranının koyu modda
// "sırıtmasının" (kullanıcı geri bildirimi) gerçek nedenlerinden biri buydu -
// etiket metni ve seçili balon her zaman açık tema tonlarında kalıyordu.
export function MoodPicker({ onMoodChange }: { onMoodChange?: (mood: MoodKey | null) => void }) {
  const { token } = useAuth();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [selected, setSelected] = useState<MoodKey | null>(null);
  const [isPending, setIsPending] = useState(false);

  const MOOD_OPTIONS: { key: MoodKey; emoji: string; label: string }[] = MOOD_KEYS.map((key) => ({
    key,
    emoji: MOOD_META[key].emoji,
    label: t(MOOD_META[key].tr, MOOD_META[key].en),
  }));

  // MoodPicker sadece unmount-olmayan Sohbet sekmesinde render ediliyor -
  // düz useEffect sadece İLK mount'ta çalışırdı, kullanıcının başka bir
  // günde/cihazda seçtiği mod hiç yansımazdı (2026-08-10 pürüz taramasında
  // bulundu, aynı dosyadaki günlük ipucu/profil düzeltmesiyle aynı bug sınıfı).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getTodayMood(token)
        .then((mood) => setSelected(mood?.mood_key ?? null))
        .catch(() => {});
    }, [token])
  );

  async function handleSelect(key: MoodKey) {
    if (!token || isPending) return;
    const previous = selected;
    const next = selected === key ? null : key;
    setSelected(next);
    onMoodChange?.(next);
    tapLight();
    setIsPending(true);
    try {
      if (next) {
        await setTodayMood(token, next);
      } else {
        await deleteTodayMood(token);
      }
    } catch {
      setSelected(previous);
      onMoodChange?.(previous);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <View style={s.row}>
      <Text style={s.label}>{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</Text>
      <View style={s.options}>
        {MOOD_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            disabled={isPending}
            style={[s.bubble, selected === option.key && s.bubbleActive]}
          >
            <Text style={s.emoji}>{option.emoji}</Text>
          </Pressable>
        ))}
        {isPending ? <ActivityIndicator size="small" color={c.muted} style={{ marginLeft: 4 }} /> : null}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
    },
    label: {
      fontSize: 12,
      color: c.muted,
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
      backgroundColor: `${c.accent}26`,
    },
    emoji: {
      fontSize: 16,
    },
  });
}
