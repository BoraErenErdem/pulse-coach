import { useEffect } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// web/src/components/PulseMark.tsx'in RN karşılığı - AYNI path/imza motif
// ("Nabız → Eğri"), react-native-svg + reanimated ile çizilme animasyonu.
// react-native-svg'nin `pathLength` normalizasyonu platformlar arası tutarsız
// olabildiği için (web'deki gibi 0->1 değil) burada path'in GERÇEK
// uzunluğunu aşan sabit bir strokeDasharray (260) kullanılıyor - offset bu
// sabite göre animasyonlanıyor, path'in tam uzunluğunu bilmeye gerek yok.
const PULSE_PATH =
  "M2,24 L16,24 L20,13 L25,34 L29,6 L34,24 L41,24 C48,24 51,23 57,18 C68,9 78,5 92,5";
const DASH_LENGTH = 260;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function PulseMark({
  size = 24,
  color = "#DD5B2E",
  animated = false,
  loop = false,
}: {
  size?: number;
  color?: string;
  /** Bileşen görünür olduğunda bir kere "kendini çizerek" belirir. */
  animated?: boolean;
  /** Yükleme durumu — animasyon sonsuz tekrar eder. */
  loop?: boolean;
}) {
  const progress = useSharedValue(animated ? 0 : 1);
  const dotOpacity = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      progress.value = 1;
      dotOpacity.value = 1;
      return;
    }
    if (loop) {
      progress.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false
      );
      dotOpacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else {
      progress.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) });
      dotOpacity.value = withTiming(1, { duration: 300, easing: Easing.ease });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, loop]);

  const animatedPathProps = useAnimatedProps(() => ({
    strokeDashoffset: DASH_LENGTH * (1 - progress.value),
  }));
  const animatedDotProps = useAnimatedProps(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <Svg width={size} height={size * 0.42} viewBox="0 0 100 42">
      <AnimatedPath
        d={PULSE_PATH}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[DASH_LENGTH, DASH_LENGTH]}
        animatedProps={animatedPathProps}
      />
      <AnimatedCircle cx={92} cy={5} r={4.5} fill={color} animatedProps={animatedDotProps} />
    </Svg>
  );
}
