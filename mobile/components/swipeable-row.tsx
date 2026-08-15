import { useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Trash2 } from "lucide-react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { tapWarning } from "@/lib/haptics";

/** Sağdan sola kaydırınca kırmızı bir "Sil" eylemi ortaya çıkaran genel satır
 * sarmalayıcısı - önceden checkins.tsx'te TEK bir yerde, kendi kopyasıyla
 * vardı (bkz. redesign planı Faz M2: mobile-native jest katmanı). Artık
 * paylaşımlı - Antrenman/Beslenme geçmiş satırları, Hedefler listesi de
 * bunu kullanıyor. Silme dokunulduğunda haptik uyarı + swipeable'ı kapatıp
 * `onDelete` çağrılır (tam kaydırıp bırakmak da yeterli - Swipeable'ın
 * varsayılan overshoot/threshold davranışı). */
export function SwipeableRow({
  children,
  onDelete,
  style,
}: {
  children: ReactNode;
  onDelete: () => void;
  style?: ViewStyle;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const swipeableRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeableRef}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            tapWarning();
            onDelete();
          }}
          style={s.deleteAction}
        >
          <Trash2 size={20} color="#FFFFFF" />
        </Pressable>
      )}
    >
      <View style={style}>{children}</View>
    </Swipeable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    deleteAction: {
      backgroundColor: c.error,
      justifyContent: "center",
      alignItems: "center",
      width: 72,
      borderRadius: 12,
      marginLeft: 8,
    },
  });
}
