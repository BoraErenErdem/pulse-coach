import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Apple, Dumbbell, Plus, Scale } from "lucide-react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { useQuickAdd } from "@/lib/quick-add-context";
import { useT } from "@/lib/language-context";
import { tapLight } from "@/lib/haptics";

const TRIGGER_SIZE = 42;
// Menü bir `Modal` içinde render ediliyor (bkz. dosya başı not) - Modal
// KENDİ ayrı katmanında olduğu için Sohbet ekranının tab çubuğu/giriş
// satırı hesaba dahil DEĞİL, elle toplanması gerekiyor: tab çubuğunun
// TABAN yüksekliği (safe-area HARİÇ, o ayrıca insets.bottom'dan geliyor)
// + giriş satırının kendi yüksekliği (16+16 dikey dolgu + 42px gönder
// düğmesi, bkz. index.tsx'teki inputRow/sendButton).
const TAB_BAR_BASE_HEIGHT = Platform.OS === "ios" ? 49 : 56;
const INPUT_ROW_HEIGHT = 74;

/** Sohbet ekranının mesaj satırına GÖMÜLÜ hızlı-ekle tetikleyicisi.
 *
 * Geçmiş (2026-08-15): İlk sürüm tab çubuğunun ÜZERİNDE `position:absolute`
 * ile yüzen GENEL bir FAB'dı - ekrana göre sabit bir konumda durduğu için
 * önce Antrenman sekmesinin ikonunu, sonra da (konum düzeltmesinden sonra)
 * Sohbet ekranının mesaj gönderme satırını KAPATTI (kullanıcı iki ayrı
 * turda da bunu yakaladı). Artık `inputRow`'un normal flex akışının bir
 * PARÇASI (WhatsApp'taki ataç düğmesi gibi, metin alanının solunda) -
 * DÜĞMENİN kendisi absolute değil, çakışma riski yok. Açılan menü (bu
 * ekranın DIŞINDaki her yere dokununca kapanması gerektiği için) hâlâ bir
 * `Modal` kullanıyor - `BottomSheet`teki KANITLANMIŞ aynı desen, elle
 * "-1000 inset" gibi kırılgan hack'lere gerek yok.
 *
 * İkinci istek: "+ sekmeye göre özel olsun, sadece Sohbet'te çoklu seçenek
 * olsun". Antrenman zaten kendi özel "+ Ekle"sine sahip; İlerleme/
 * Beslenme'nin birincil ekleme formu sayfa açılır açılmaz (kaydırmadan)
 * zaten görünür durumda - o ekranlara AYRICA bir hızlı-ekle düğmesi eklemek
 * gereksiz tekrar olurdu. Bu yüzden bu bileşen SADECE Sohbet ekranında
 * kullanılıyor, diğer sekmelerde hiçbir "+" YOK.
 */
export function QuickAddMenu() {
  const c = useThemeColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestOpenWorkoutSheet } = useQuickAdd();
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  const s = useMemo(() => makeStyles(c, insets.bottom), [c, insets.bottom]);
  const menuProgress = useSharedValue(0);

  // Aynı hafif popover deseni (tam ekran karartma/uzun kayma YOK, sadece
  // ölçek+opaklık, ~150ms) - kullanıcının "yeni animasyonu beğendim" dediği
  // ilk sürümle AYNI.
  useEffect(() => {
    if (isOpen) {
      setIsMenuMounted(true);
      menuProgress.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    } else if (isMenuMounted) {
      menuProgress.value = withTiming(0, { duration: 110, easing: Easing.in(Easing.cubic) });
      const timeout = setTimeout(() => setIsMenuMounted(false), 110);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: menuProgress.value,
    transform: [{ scale: 0.9 + menuProgress.value * 0.1 }],
  }));

  function openWorkout() {
    tapLight();
    setIsOpen(false);
    // ÖNEMLİ: "/(tabs)/workouts" DEĞİL "/workouts" - grup segmentli yol
    // expo-router'da ikinci, görünmez bir Antrenman kopyası mount ediyordu
    // (bkz. commit geçmişi, 2026-08-15).
    router.push("/workouts");
    requestOpenWorkoutSheet();
  }

  function goTo(path: "/nutrition" | "/progress") {
    tapLight();
    setIsOpen(false);
    router.push(path);
  }

  return (
    <>
      {isMenuMounted ? (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => setIsOpen(false)}>
          {/* `flex:1` ŞART - BottomSheet'teki `root` stiliyle aynı neden:
              Modal'ın (özellikle react-native-web'de) içeriği saracak bir
              KÖK View'a ihtiyacı var, yoksa Modal'ın kendisi tam ekran
              yerine İÇERİĞİN boyutuna küçülüp sayfayı sol üstte küçük bir
              kutuya sıkıştırıyordu (canlı testte bulundu, 2026-08-15). */}
          <View style={s.modalRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsOpen(false)} />
            <Animated.View style={[s.menu, menuAnimatedStyle]} pointerEvents="box-none">
              <Pressable onPress={openWorkout} style={s.option}>
                <View style={[s.optionIcon, { backgroundColor: `${c.accent}1F` }]}>
                  <Dumbbell size={16} color={c.accent} />
                </View>
                <Text style={s.optionText}>{t("Antrenman Ekle", "Add Workout")}</Text>
              </Pressable>
              <Pressable onPress={() => goTo("/nutrition")} style={s.option}>
                <View style={[s.optionIcon, { backgroundColor: `${c.accent}1F` }]}>
                  <Apple size={16} color={c.accent} />
                </View>
                <Text style={s.optionText}>{t("Beslenme Ekle", "Add Nutrition")}</Text>
              </Pressable>
              <Pressable onPress={() => goTo("/progress")} style={s.option}>
                <View style={[s.optionIcon, { backgroundColor: `${c.accent}1F` }]}>
                  <Scale size={16} color={c.accent} />
                </View>
                <Text style={s.optionText}>{t("Kilo Ekle", "Add Weight")}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
      <Pressable
        onPress={() => {
          tapLight();
          setIsOpen((v) => !v);
        }}
        style={({ pressed }) => [s.trigger, pressed && { opacity: 0.7 }]}
      >
        <Plus size={20} color={c.accent} />
      </Pressable>
    </>
  );
}

function makeStyles(c: ThemeColors, insetBottom: number) {
  return StyleSheet.create({
    modalRoot: { flex: 1 },
    trigger: {
      width: TRIGGER_SIZE,
      height: TRIGGER_SIZE,
      borderRadius: TRIGGER_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Sohbet ekranının kendi düzenine göre BİLİNEN bir konum: giriş
    // satırının hemen üzerinde, sol kenar hizasında. Bu bileşen artık
    // SADECE bu ekranda kullanıldığı için (bkz. dosya başı not) bu sabit
    // değerler kırılgan değil - eski "5 farklı ekranda çalışsın" GENEL
    // FAB'ın aksine, burada tek bir bilinen bağlam var.
    menu: {
      position: "absolute",
      left: 16,
      bottom: insetBottom + TAB_BAR_BASE_HEIGHT + INPUT_ROW_HEIGHT + 8,
      minWidth: 190,
      borderRadius: 14,
      padding: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    optionIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    optionText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: c.text,
    },
  });
}
