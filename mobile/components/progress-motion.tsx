import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import * as Storage from "@/lib/storage";

// İlerleme sekmesinin hareket parçaları (2026-09-19, A/B/C katmanları):
// sayaç (CountUp), konfeti ve "bir kez kutla" kaydı. Hepsi "hareketi azalt"
// ayarına uyar (animasyon yok, son değer hemen görünür).

/** `target`e doğru yumuşakça (easeOutCubic) akan sayı. `replayKey` artınca
 * `from`dan baştan oynar. JS (rAF) tabanlı - Text içeriğini Reanimated ile
 * animasyonlamak kırılgan (bkz. ui.tsx::AnimatedStreakCount notu). */
export function useAnimatedNumber(
  target: number,
  replayKey = 0,
  opts: { duration?: number; delay?: number; from?: number } = {}
): number {
  const { duration = 650, delay = 0, from = 0 } = opts;
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : from);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const timer = setTimeout(() => {
      const startedAt = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - startedAt) / duration);
        const eased = 1 - (1 - t) ** 3;
        setValue(from + (target - from) * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, replayKey]);
  return value;
}

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  from,
  replayKey = 0,
  style,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  from?: number;
  replayKey?: number;
  style?: StyleProp<TextStyle>;
}) {
  const shown = useAnimatedNumber(value, replayKey, { from: from ?? 0 });
  const f = 10 ** decimals;
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
      {(Math.round(shown * f) / f).toFixed(decimals)}
      {suffix}
    </Text>
  );
}

// ---- Konfeti (hedefe ulaşma kutlaması)
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (-Math.PI * 0.95) + (i / 17) * Math.PI * 0.9; // yukarı yelpaze
  return {
    dx: Math.cos(angle) * (90 + ((i * 37) % 60)),
    dy: Math.sin(angle) * (110 + ((i * 53) % 70)),
    rot: ((i * 73) % 360) - 180,
    size: 6 + ((i * 5) % 6),
    delay: (i % 6) * 25,
    color: ["#FFD84D", "#FF8A3D", "#FF453A", "#5EDC8B", "#4DD6E6", "#FFA3C8", "#FFFFFF"][i % 7],
    round: i % 3 === 0,
  };
});

function Piece({ c, replayKey }: { c: (typeof CONFETTI)[number]; replayKey: number }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (replayKey === 0 || reduced) return;
    p.value = 0;
    p.value = withDelay(c.delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: c.dx * p.value },
      // yerçekimi: yukarı fırlar sonra düşer
      { translateY: c.dy * p.value + 150 * p.value * p.value },
      { rotate: `${c.rot * p.value * 2}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: c.size,
          height: c.round ? c.size : c.size * 1.6,
          borderRadius: c.round ? c.size / 2 : 2,
          backgroundColor: c.color,
        },
        style,
      ]}
    />
  );
}

/** Kartın alt-ortasından yukarı fırlayan konfeti. Sadece `replayKey` > 0 iken
 * (bir kutlama tetiklenince) oynar. */
export function ConfettiBurst({ replayKey }: { replayKey: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "flex-end" }]}>
      <View style={{ width: 0, height: 0, marginBottom: 24 }}>
        {CONFETTI.map((c, i) => (
          <Piece key={i} c={c} replayKey={replayKey} />
        ))}
      </View>
    </View>
  );
}

// ---- "Bir kez kutla" kaydı
/** Bu anahtar için kutlama İLK kez mi? İlkse işaretler ve true döner - aynı
 * kutlama her ekran ziyaretinde tekrar oynamasın diye (kalıcı, cihazda). Depolama
 * hata verirse kutlama yapılmaz (sessizce false). */
export async function celebrateOnce(key: string): Promise<boolean> {
  try {
    const storageKey = `pulsecoach_celebrated_${key}`;
    const existing = await Storage.getItemAsync(storageKey);
    if (existing) return false;
    await Storage.setItemAsync(storageKey, "1");
    return true;
  } catch {
    return false;
  }
}

/** Haftanın Pazartesi'si (yerel tarih, YYYY-MM-DD) - "haftanın ilk antrenmanı". */
export function weekKey(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
