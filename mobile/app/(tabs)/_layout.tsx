import { Tabs } from "expo-router";
import { Apple, Dumbbell, LineChart, MessageCircle, User } from "lucide-react-native";
import { useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";

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
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t("İlerleme", "Progress"),
          tabBarIcon: ({ color, size }) => <LineChart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: t("Antrenman", "Workouts"),
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t("Beslenme", "Nutrition"),
          tabBarIcon: ({ color, size }) => <Apple color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("Profil", "Profile"),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
