import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/components/ui.tsx'teki GoalMeter'ın mobil portu.
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()` -
// bu bileşen goals.tsx/nutrition.tsx/exercise-goals-list.tsx'te kullanılıyor,
// hiçbiri koyu modda doğru render olmuyordu.

/** Tam sayı hedefler ("100 kg") gereksiz ".0" ile kalabalıklaşmasın, ama
 * ondalıklı bir hedef ("100.5 kg") de tam sayıya yuvarlanıp veri kaybı
 * izlenimi vermesin (kullanıcı bulgusu - egzersiz hedefine "100,5" girince
 * ilerleme çubuğunda "101" görünüyordu; kaydedilen değer aslında değişmiyor,
 * SADECE bu gösterim tam sayıya yuvarlıyordu). */
function formatMeterNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function GoalMeter({
  label,
  value,
  goal,
  unit,
  color,
  valueColor,
  trackColor,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  // Sıcak panel zemininde (Antrenman sekmesi) ortak c.muted/c.surfaceMuted
  // (soğuk teal-gri) soluk/yabancı kalıyordu (kullanıcı bulgusu, 2026-09-22)
  // - opsiyonel override YOKSA eski davranış (c.muted/c.surfaceMuted) aynen
  // sürer, goals.tsx/nutrition.tsx etkilenmez.
  valueColor?: string;
  trackColor?: string;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <View>
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.value, valueColor ? { color: valueColor } : null]}>
          {formatMeterNumber(value)} / {formatMeterNumber(goal)} {unit} (%{pct.toFixed(0)})
        </Text>
      </View>
      <View style={[s.track, trackColor ? { backgroundColor: trackColor } : null]}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    label: {
      fontSize: 13,
      color: c.text,
    },
    value: {
      fontSize: 12,
      color: c.muted,
    },
    track: {
      height: 8,
      width: "100%",
      borderRadius: 999,
      backgroundColor: c.surfaceMuted,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: 999,
    },
  });
}
