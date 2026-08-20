import { useEffect } from "react";
import { Tabs } from "expo-router";
import { useNavigationState } from "@react-navigation/native";
import { Apple, Dumbbell, LineChart, MessageCircle, User } from "lucide-react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";

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
  Icon: typeof MessageCircle;
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
export default function TabsLayout() {
  const t = useT();
  const c = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
        },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("Sohbet", "Chat"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={MessageCircle} routeName="index" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t("İlerleme", "Progress"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={LineChart} routeName="progress" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: t("Antrenman", "Workouts"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={Dumbbell} routeName="workouts" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t("Beslenme", "Nutrition"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={Apple} routeName="nutrition" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("Profil", "Profile"),
          tabBarIcon: ({ color, size }) => <AnimatedTabIcon Icon={User} routeName="profile" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
