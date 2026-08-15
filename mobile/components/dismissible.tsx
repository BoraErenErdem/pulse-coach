import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { tapLight } from "@/lib/haptics";

const DISMISS_DISTANCE = 80;

/** Yana YA DA yukarı kaydırınca kaybolan genel sarmalayıcı - "X" düğmesiyle
 * kapatma yerine jestle kapatma (bkz. redesign planı Faz M2b, kullanıcının
 * cihazda test ettikten sonraki somut isteği: "günün ipucu" artık X yerine
 * kaydırarak kapanmalı). Yeterince UZAKLAŞTIRILMAZSA (< 80px) yerine geri
 * yaylanır - yanlışlıkla dokunuşla kapanmayı önlemek için. Aşağı kaydırma
 * BİLEREK sayılmıyor - ScrollView'ın kendi aşağı kaydırma jestiyle
 * çakışmaması için. */
export function Dismissible({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  function finishDismiss() {
    tapLight();
    onDismiss();
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      const horizontalEnough = Math.abs(e.translationX) > DISMISS_DISTANCE;
      const upEnough = e.translationY < -DISMISS_DISTANCE;
      if (horizontalEnough || upEnough) {
        translateX.value = withTiming(e.translationX > 0 ? 400 : e.translationX < 0 ? -400 : 0, { duration: 180 });
        translateY.value = withTiming(upEnough ? -300 : 0, { duration: 180 });
        opacity.value = withTiming(0, { duration: 180 }, (finished) => {
          if (finished) runOnJS(finishDismiss)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}
