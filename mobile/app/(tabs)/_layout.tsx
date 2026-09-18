import { useEffect, type ComponentType } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigationState } from "@react-navigation/native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import {
  ChatNavIcon,
  FLOATING_TAB_BAR_HEIGHT,
  getFloatingTabBarBottomOffset,
  NutritionNavIcon,
  ProfileNavIcon,
  ProgressNavIcon,
  WorkoutNavIcon,
} from "@/components/nav-icons";

// Sekme ikonuna dokununca/geçince küçük bir "pop" (kullanıcı isteği,
// 2026-08-21: "sekmeler arası geçişte sekmelerin ikonlarına da animasyon
// ekle" - bir önceki turda ekran İÇERİĞİNE eklenen giriş animasyonunun
// devamı). İLK sürüm `tabBarIcon`'un kendi `focused` parametresine
// güveniyordu ama kullanıcı telefonda "hiç animasyon göremedim" dedi -
// kök neden: @react-navigation/bottom-tabs HER ikonu İKİ KEZ render ediyor
// (biri HEP focused:true, diğeri HEP focused:false - aralarında SADECE
// opaklık çapraz geçiş yapıyor, bkz. node_modules/@react-navigation/
// bottom-tabs/src/views/TabBarIcon.tsx "We render the icon twice"), yani
// `focused` prop'u bir kopya için ASLA değişmiyordu - `useEffect` sadece
// ilk mount'ta bir kez ateşlenip bir daha hiç oynamıyordu. Çözüm: gerçek
// aktif sekmeyi `focused` prop'undan DEĞİL, tab navigator'ın kendi
// state'inden (`useNavigationState`) okuyoruz - bu her navigasyon
// değişiminde GERÇEKTEN güncelleniyor. `useEffect`+paylaşımlı değer deseni
// (Reveal'daki AYNI ilke, bkz. ui.tsx) - `entering` değil, çünkü bu ikon
// bileşeni sekmeler arası hiç unmount olmuyor. Ölçek dışına taşmasın diye
// "zarif, abartısız" marka diliyle uyumlu ufak bir sıçrama (1 -> 1.22 -> 1).
function AnimatedTabIcon({
  Icon,
  routeName,
  color,
  size,
}: {
  Icon: ComponentType<{ color: string; size: number }>;
  routeName: string;
  color: string;
  size: number;
}) {
  const isFocused = useNavigationState((state) => state.routes[state.index]?.name === routeName);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) return;
    scale.value = withSequence(
      withTiming(1.22, { duration: 150, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 170, easing: Easing.out(Easing.cubic) })
    );
  }, [isFocused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon color={color} size={size} />
    </Animated.View>
  );
}

// 5 sekmeli iskelet (plan kararı): web'deki 8 sayfa buraya sığdırılıyor.
// Redesign (2026-08-15, Faz 1): tab çubuğu artık `useThemeColors()` ile koyu
// temaya tepki veriyor - PulseMark motifiyle aynı marka rengi (accent),
// pasif ikonlar `muted`.
// Faz M2 (mobile-native redesign): eski jenerik "Diğer" sekmesi (Menu ikonu,
// düz liste) gerçek bir "Profil" hub'ına dönüştü (bkz. profile.tsx) -
// kullanıcı "Diğer"in çöp-çekmecesi gibi hissettirdiğini belirtti.
// Faz 13 (kısa ömürlü): merkezi hızlı-ekle FAB'ı burada, tab çubuğunun
// ÜZERİNDE yüzen genel bir katman olarak denendi - kullanıcı iki ayrı
// turda bunun önce Antrenman sekmesinin ikonunu, sonra (konum düzeltmesi
// sonrası) Sohbet ekranının mesaj gönderme satırını kapattığını buldu.
// Kök neden: "her ekranda aynı yerde dur" varsayımı, ekranların KENDİ
// bottom-anchored içeriğiyle (sekme ikonları, mesaj satırı) çakışıyordu.
// Artık bu genel katman YOK - hızlı-ekle SADECE Sohbet ekranının kendi
// giriş satırına gömülü (bkz. components/quick-add-menu.tsx), Antrenman
// zaten kendi özel "+ Ekle"sine sahip, İlerleme/Beslenme'nin birincil
// ekleme formu sayfa açılır açılmaz zaten görünür - ayrı bir FAB'a
// ihtiyaçları yok.
// Tasarım turu (2026-09-19, arkadaşın chat mockup'ındaki altbar.png):
// standart, tam genişlikte, etiketli çubuk yerine YÜZEN, köşeleri tam
// yuvarlak, sadece ikonlu bir pil - artık kullanıcı onayıyla TÜM sekmelerde
// (önceki tur SADECE Sohbet ekranına odaklanmıştı, kullanıcı bu turda
// "artık o altbarları kullanıcaz" diyerek kapsamı genişletti). Pil dolgusu
// BİLEREK `c.surface` (uygulamanın KENDİ zemin tonu, mockup'ın saf beyaz/
// #1E1E1E'si DEĞİL) - rengi app'in mevcut sıcak paletiyle tutarlı tutmak
// için (bkz. proje belleği: "açık mod arkaplanı kendi krem rengine sabit
// kal" ilkesiyle AYNI mantık). `position:"absolute"` + `useSafeAreaInsets`
// ile taban boşluğu cihazın home-indicator'ına göre ayarlanıyor.
//
// Kenar boşluğu (2026-09-18, kullanıcı gerçek iPhone'da test etti): 16→28→40
// denemelerinin HİÇBİRİ cihazda görünmedi - pil hep ekranın iki kenarına
// yapışık kaldı. KÖK NEDEN: @react-navigation/bottom-tabs çubuğun kendi
// stilinde `start:0, end:0` veriyor ve RN'de mantıksal `start`/`end`,
// `left`/`right`'ın ÖNÜNE geçiyor - bu yüzden `left/right` sessizce
// yok sayılıyordu. Çözüm `start`/`end` ile geçersiz kılmak. Değer 20:
// WhatsApp alt çubuğunun ekran görüntüsünden ölçülen kenar boşluğu (~20pt).
// (Daha önce ikonları merkeze kümeleyen bir `tabBar` render prop'u da
// denenip geri alındı: mockup'ta ikonlar pilin genişliğine göre eşit
// dağılıyor, standart `flex:1` davranışı doğru.)
const FLOATING_TAB_BAR_SIDE_MARGIN = 20;
export default function TabsLayout() {
  const t = useT();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          position: "absolute",
          start: FLOATING_TAB_BAR_SIDE_MARGIN,
          end: FLOATING_TAB_BAR_SIDE_MARGIN,
          bottom: getFloatingTabBarBottomOffset(insets.bottom),
          height: FLOATING_TAB_BAR_HEIGHT,
          borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
          // Sekme öğelerinin kendi dokunma/vurgu katmanı (RN Navigation'ın
          // iç `PlatformPressable`'ı) `borderRadius`e SAYGI GÖSTERMİYORDU,
          // köşelerde dikdörtgen köşeler pilin yuvarlak sınırının dışına
          // taşıyordu (kullanıcı bulgusu, gerçek iPhone) - `overflow:
          // "hidden"` pilin kendi içeriğini kendi yuvarlak sınırına kırpar.
          overflow: "hidden",
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        },
        tabBarItemStyle: { paddingVertical: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("Sohbet", "Chat"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={ChatNavIcon} routeName="index" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t("İlerleme", "Progress"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={ProgressNavIcon} routeName="progress" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: t("Antrenman", "Workouts"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={WorkoutNavIcon} routeName="workouts" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t("Beslenme", "Nutrition"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={NutritionNavIcon} routeName="nutrition" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("Profil", "Profile"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={ProfileNavIcon} routeName="profile" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
