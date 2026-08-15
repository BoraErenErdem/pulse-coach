import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { Apple, Dumbbell, Smile } from "lucide-react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 92;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** "Ritim" bileşik skoru - chat/anasayfa ekranı için (Redesign, ChatGPT'nin
 * mockup'ından uyarlanan 3 fikirden biri: "Hareket %68 · Beslenme %81 ·
 * Ruh Hali %74" tarzı tek bakışta özet). Üç girdi de AYRI backend
 * endpoint'lerinden (bugünkü antrenman oturumu var mı, günlük beslenme
 * özeti/kalori hedefi, bugünkü mood) türetilir - yeni backend alanı GEREKMEZ,
 * tamamen istemci tarafı bir bileşim. Herhangi bir girdi henüz yoksa (örn.
 * bugün mood seçilmemiş) o segment %0 sayılır ama "—" ile ayrı gösterilir ki
 * kullanıcı "hiç yapmadım" ile "seçmedim" farkını görsün.
 */
export function RhythmRing({
  movementPct,
  nutritionPct,
  moodPct,
}: {
  movementPct: number | null;
  nutritionPct: number | null;
  moodPct: number | null;
}) {
  const c = useThemeColors();
  const t = useT();
  const s = useMemo(() => makeStyles(c), [c]);

  const values = [movementPct, nutritionPct, moodPct].filter((v): v is number => v != null);
  const overall = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming((overall ?? 0) / 100, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [overall, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const label = rhythmLabel(overall, t);

  return (
    <View style={s.card}>
      <View style={s.ringWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={c.surfaceMuted}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={c.accent}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
            animatedProps={animatedProps}
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={s.ringCenter}>
          <Text style={s.ringNumber}>{overall != null ? overall : "—"}</Text>
        </View>
      </View>
      <View style={s.breakdown}>
        <Text style={s.label}>{label}</Text>
        <RhythmRow icon={<Dumbbell size={13} color={c.muted} />} name={t("Hareket", "Movement")} pct={movementPct} c={c} />
        <RhythmRow icon={<Apple size={13} color={c.muted} />} name={t("Beslenme", "Nutrition")} pct={nutritionPct} c={c} />
        <RhythmRow icon={<Smile size={13} color={c.muted} />} name={t("Ruh Hali", "Mood")} pct={moodPct} c={c} />
      </View>
    </View>
  );
}

function RhythmRow({
  icon,
  name,
  pct,
  c,
}: {
  icon: React.ReactNode;
  name: string;
  pct: number | null;
  c: ThemeColors;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.row}>
      {icon}
      <Text style={s.rowName}>{name}</Text>
      <Text style={s.rowValue}>{pct != null ? `%${pct}` : "—"}</Text>
    </View>
  );
}

function rhythmLabel(overall: number | null, t: (tr: string, en: string) => string): string {
  if (overall == null) return t("Bugün başlangıç", "Today's a start");
  if (overall >= 80) return t("Harika gidiyor", "Going great");
  if (overall >= 60) return t("Dengeli bir gün", "A balanced day");
  if (overall >= 40) return t("Fena değil", "Not bad");
  return t("Bugün başlangıç", "Today's a start");
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    ringWrap: {
      width: SIZE,
      height: SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    ringCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    ringNumber: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    breakdown: {
      flex: 1,
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
      marginBottom: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowName: {
      flex: 1,
      fontSize: 12,
      color: c.muted,
    },
    rowValue: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
  });
}
