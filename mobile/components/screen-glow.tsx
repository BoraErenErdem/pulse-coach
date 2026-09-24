import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { useSurfaceTone } from "@/components/surface-tone";

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
  // Renk bulunulan sekmenin yüzey tonundan (2026-09-24, bkz. surface-tone.tsx);
  // ton verilmeyen ekranlarda eskisi gibi turuncu.
  const { glowRgb } = useSurfaceTone();
  if (theme !== "dark") return null;
  return (
    <LinearGradient
      colors={[
        `rgba(${glowRgb},${0.34 * strength})`,
        `rgba(${glowRgb},${0.14 * strength})`,
        `rgba(${glowRgb},0)`,
      ]}
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: -insets.top, height: height + insets.top }}
    />
  );
}
