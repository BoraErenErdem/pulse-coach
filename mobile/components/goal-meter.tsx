import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/components/ui";

// web/src/components/ui.tsx'teki GoalMeter'ın mobil portu.

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
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {formatMeterNumber(value)} / {formatMeterNumber(goal)} {unit} (%{pct.toFixed(0)})
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    color: colors.text,
  },
  value: {
    fontSize: 12,
    color: colors.muted,
  },
  track: {
    height: 8,
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
