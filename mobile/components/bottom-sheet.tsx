import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { tapLight } from "@/lib/haptics";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_OFFSCREEN = SCREEN_HEIGHT;
const DISMISS_THRESHOLD = 120;
// 2026-08-15: kullanıcı geri bildirimi ("+ butonuna basınca gelen animasyon
// çok abartı") - eski değerlerde (damping 22, stiffness 220) kritik
// sönümlemenin (~2*sqrt(stiffness)≈29.7) ALTINDAYDI, yani panel yerine
// oturmadan önce gözle görülür şekilde zıplıyordu/aşırı gidip geri
// geliyordu. Artık kritik sönümlemeye YAKIN (damping 30, stiffness 300) -
// hâlâ bir yay hissi var (tamamen doğrusal/robotik değil) ama sıçrama
// yok, daha hızlı yerine oturuyor. Bu bileşen PAYLAŞIMLI olduğu için
// (antrenman formu + hızlı-ekle seçici, vb.) düzeltme HER kullanım
// yerine otomatik yayılıyor.
const SPRING_CONFIG = { damping: 30, stiffness: 300 };

/** Odaklı bir görev için (antrenman seti ekleme, öğün kaydetme) alttan açılan
 * panel - web'in aynı formu sayfanın ORTASINDA gösterdiği deseninin
 * mobile-native karşılığı (bkz. redesign planı Faz M2 - "port edilmiş" web
 * formu yerine gerçek bir mobil etkileşim).
 *
 * Kapanış YOLLARI: backdrop'a dokunma, tutamacı aşağı sürükleme (>120px),
 * Android geri tuşu, ya da `onClose` çağrısı - hepsi AYNI kaynaktan geçer:
 * `visible` prop'u false olunca içerideki useEffect animasyonlu çıkışı
 * BAŞLATIR, animasyon bitince (`finished` callback) gerçek unmount olur -
 * `visible=false` anında `null` dönmüyoruz, aksi halde çıkış animasyonu hiç
 * görünmezdi. Kalıcı (ownership) durum HÂLÂ çağıran ekranda (`visible`
 * state'i) - bu bileşen sadece animasyonu/jesti yönetiyor. */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const translateY = useSharedValue(SHEET_OFFSCREEN);
  const backdropOpacity = useSharedValue(0);
  const [isMounted, setIsMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      tapLight();
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(SHEET_OFFSCREEN, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.root}>
        <Animated.View style={[s.backdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[s.sheet, sheetAnimatedStyle]}>
          <GestureDetector gesture={pan}>
            <View style={s.handleWrap}>
              <View style={s.handle} />
            </View>
          </GestureDetector>
          <SafeAreaView edges={["bottom"]} style={s.safeArea}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
                {children}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000A6" },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: SCREEN_HEIGHT * 0.88,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -4 },
      elevation: 12,
    },
    handleWrap: { alignItems: "center", paddingVertical: 10 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border },
    safeArea: { flexShrink: 1 },
    content: { padding: 20, paddingTop: 4, gap: 16 },
  });
}
