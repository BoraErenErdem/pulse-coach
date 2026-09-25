import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { deleteTodayMood, getTodayMood, setTodayMood, type MoodKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { MOOD_KEYS, MOOD_META, type ThemeColors, useThemeColors } from "@/components/ui";
import { MoodFaceIcon } from "@/components/mood-icons";
import { tapLight } from "@/lib/haptics";

// web/src/components/MoodPicker.tsx'in mobil portu - aynı davranış (seçim
// mood_logs'ta kalıcı, orchestrator prompt'una SADECE ton için bağlam
// ekliyor, kriz tespitini hiç etkilemiyor - bkz. backend mood_support_agent).
// 2026-08-15 (Faz M2b): `useThemeColors()`'a geçirildi - ÖNCEDEN statik
// (sadece açık tema) renkler kullanıyordu, Sohbet ekranının koyu modda
// "sırıtmasının" (kullanıcı geri bildirimi) gerçek nedenlerinden biri buydu -
// etiket metni ve seçili balon her zaman açık tema tonlarında kalıyordu.
// `variant="panel"` (2026-09-19, arkadaşın "bilgilendirme ekranı" mockup'ı):
// Sohbet'in "Bugün" panelinde kullanılan yeni görünüm - etiket solda/mood
// ikonları sağda tek satırda, ikonlar emoji yerine ince çizgili SVG yüz
// ikonları (bkz. mood-icons.tsx), hepsi ortak bir pil zemininde. Varsayılan
// ("default", parametre HİÇ verilmezse) davranış TAMAMEN AYNI kaldı -
// mood-history.tsx bu bileşeni AYRICA kullanıyor, o ekranın görünümü bu
// turun kapsamı DIŞINDA, değişmedi.
export function MoodPicker({
  onMoodChange,
  variant = "default",
  accent,
  labelColor,
}: {
  onMoodChange?: (mood: MoodKey | null) => void;
  // "hero" (2026-09-25, Ruh Hali sayfasının "Bugün" kartı): büyük 5 düğme,
  // altında etiket, seçim halkası `accent` renginde. Diğer varyantlar aynı.
  variant?: "default" | "panel" | "hero";
  accent?: string;
  labelColor?: string;
}) {
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

  const isPanel = variant === "panel";

  if (variant === "hero") {
    const ring = accent ?? c.accent;
    return (
      <View style={s.heroRow}>
        {MOOD_OPTIONS.map((option) => {
          const active = selected === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => handleSelect(option.key)}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active, disabled: isPending }}
              style={({ pressed }) => [
                s.heroOption,
                { borderColor: active ? ring : "transparent", backgroundColor: active ? `${ring}33` : "transparent" },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={s.heroEmoji}>{option.emoji}</Text>
              <Text style={[s.heroLabel, { color: labelColor ?? c.text }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={isPanel ? s.rowPanel : s.row}>
      <Text style={isPanel ? s.labelPanel : s.label}>
        {isPanel ? "• " : ""}
        {t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}
      </Text>
      <View style={[s.options, isPanel && s.optionsPanel]}>
        {MOOD_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            disabled={isPending}
            // İkon/emoji-only buton - ekran okuyucu için ruh hali adı + seçili
            // durumu. Panel varyantındaki 26px baloncuklar 44pt minimumun
            // altında: dikey hitSlop dokunma alanını büyütüyor (yatayda
            // komşu baloncuklarla çakışmasın diye eklenmiyor).
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: selected === option.key, disabled: isPending }}
            hitSlop={isPanel ? { top: 9, bottom: 9 } : undefined}
            style={[s.bubble, isPanel && s.bubblePanel, selected === option.key && s.bubbleActive]}
          >
            {isPanel ? (
              <MoodFaceIcon mood={option.key} size={18} color={selected === option.key ? c.accent : c.muted} />
            ) : (
              <Text style={s.emoji}>{option.emoji}</Text>
            )}
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
    // "panel" varyantı (bkz. yukarıdaki bileşen notu) - etiket solda/pil
    // sağda tek satır.
    rowPanel: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    labelPanel: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    optionsPanel: {
      backgroundColor: `${c.accent}14`,
      borderWidth: 1,
      borderColor: `${c.accent}33`,
      borderRadius: 999,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    bubblePanel: {
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    heroRow: { flexDirection: "row", gap: 6 },
    heroOption: {
      flex: 1,
      minHeight: 64,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    heroEmoji: { fontSize: 26 },
    heroLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  });
}
