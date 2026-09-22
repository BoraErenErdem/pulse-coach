import { type ReactNode, memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/lib/theme-context";
import { useThemeColors } from "@/components/ui";
import { GlassShell } from "@/components/progress-cards";
import { CountUp } from "@/components/progress-motion";
import { WORKOUT_TILE_GRADIENT_DARK, useWorkoutIdentityColors, type WorkoutIdentityKey } from "@/components/workout-identity";

// Antrenman sekmesi kartları (2026-09-22 redesign) -
// [[reference-pulsecoach-design-language]]'a göre: aynı yüzey dili (§2,
// GlassShell/ProgressSectionCard progress-cards.tsx'ten yeniden kullanılıyor),
// ama sayfaya ÖZEL istatistik kutusu - kendi kimlik paletiyle
// (workout-identity.ts). Ortak `StatTile` (ui.tsx, diğer sekmelerde hâlâ
// kullanılıyor) DOKUNULMADI.

const LIGHT_FILL = "rgba(255,255,255,0.75)";

function usePalette() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return {
    isDark,
    c,
    text: isDark ? "#FFFFFF" : c.text,
    subtleText: isDark ? "rgba(255,255,255,0.88)" : c.text,
  };
}

/** 2x2 ızgaradaki istatistik kutusu - progress-cards.tsx::ProgressTile'ın
 * Antrenman'a özel ikizi. Dokununca hafif sıçrar + ikon zıplar (B katmanı,
 * TEK ortak koreografi - İlerleme'nin metrik başına 3 farklı animasyonunun
 * aksine, burada "antrenman" kimliğinin tekliğini vurgulamak için kasıtlı
 * olarak sade/tutarlı).
 */
export const WorkoutTile = memo(function WorkoutTile({
  identity,
  icon,
  label,
  value,
  hint,
  onPress,
  containerStyle,
  countUp,
  valueColor,
}: {
  identity: WorkoutIdentityKey;
  icon: (color: string) => ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  onPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  countUp?: { value: number; decimals?: number; suffix?: string; from?: number };
  valueColor?: string;
}) {
  const p = usePalette();
  const ids = useWorkoutIdentityColors();
  const solid = ids[identity];
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const [tapKey, setTapKey] = useState(0);
  const iconScale = useSharedValue(1);
  useEffect(() => {
    if (tapKey === 0 || reduced) return;
    iconScale.value = withSequence(
      withTiming(1.3, { duration: 130, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220 })
    );
  }, [tapKey, reduced, iconScale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  function handlePress() {
    scale.value = withSequence(
      withTiming(1.04, { duration: 100, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 })
    );
    setTapKey((k) => k + 1);
    onPress?.();
  }

  return (
    <Pressable onPress={handlePress} hitSlop={4} style={containerStyle}>
      {({ pressed }) => (
        <Animated.View entering={FadeIn.duration(300)} style={[bounceStyle, pressed && { opacity: 0.85 }]}>
          <GlassShell
            gradient={WORKOUT_TILE_GRADIENT_DARK[identity]}
            lightFill={LIGHT_FILL}
            lightGradient={[`${solid}40`, "rgba(255,255,255,0.86)"]}
            glow={p.isDark ? WORKOUT_TILE_GRADIENT_DARK[identity][0] : solid}
            radius={20}
          >
            <View style={s.tileBody}>
              <View style={s.tileLabelRow}>
                <Animated.View style={iconStyle}>{icon(p.isDark ? "rgba(255,255,255,0.85)" : solid)}</Animated.View>
                <Text style={[s.tileLabel, { color: p.text }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              <View style={s.tileValueRow}>
                {countUp ? (
                  <CountUp
                    value={countUp.value}
                    decimals={countUp.decimals}
                    suffix={countUp.suffix}
                    from={countUp.from}
                    replayKey={tapKey}
                    style={[s.tileValue, { color: valueColor ?? p.text }]}
                  />
                ) : typeof value === "string" ? (
                  <Text style={[s.tileValue, { color: valueColor ?? p.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                  </Text>
                ) : (
                  value
                )}
              </View>
              <Text style={[s.tileHint, { color: p.subtleText }]} numberOfLines={1}>
                {hint ?? " "}
              </Text>
            </View>
          </GlassShell>
        </Animated.View>
      )}
    </Pressable>
  );
});

const s = StyleSheet.create({
  tileBody: {
    minHeight: 124,
    padding: 13,
    justifyContent: "space-between",
  },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  tileValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tileValue: {
    fontSize: 26,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  tileHint: {
    fontSize: 12,
  },
});
