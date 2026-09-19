import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";

/** Koyu modda ekranın tepesine sıcak turuncu parıltı (2026-09-19). Sekmeler
 * arası geçişte zemin rengi sıçramasın diye Sohbet ve İlerleme AYNI bileşeni
 * kullanıyor (üst kenardaki renk birebir aynı, sadece sönme boyu farklı).
 *
 * Ekranın EN TEPESİNDEN başlar: `top: -insets.top` - durum çubuğu/güvenli alan
 * şeridi (ScrollView'ın dışında) siyah kalmasın (iPhone bulgusu); absolute konum
 * güvenli alan dolgusuna göre nasıl çözülürse çözülsün şerit kapanır, fazlası
 * ekran dışında kalır. SafeAreaView'ın İLK çocuğu olarak konmalı (içeriğin
 * arkasında kalsın). Açık modda hiçbir şey çizmez (düz krem kalıyor). */
export function ScreenGlow({ height = 520, strength = 1 }: { height?: number; strength?: number }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  if (theme !== "dark") return null;
  return (
    <LinearGradient
      colors={[
        `rgba(255,138,61,${0.34 * strength})`,
        `rgba(255,138,61,${0.14 * strength})`,
        "rgba(255,138,61,0)",
      ]}
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: -insets.top, height: height + insets.top }}
    />
  );
}
