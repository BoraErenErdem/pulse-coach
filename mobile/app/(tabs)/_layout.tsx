import { Tabs } from "expo-router";
import { Apple, Dumbbell, LineChart, Menu, MessageCircle } from "lucide-react-native";
import { colors } from "@/components/ui";
import { useT } from "@/lib/language-context";

// 5 sekmeli iskelet (plan kararı): web'deki 8 sayfa buraya sığdırılıyor,
// Ruh Hali/Hedefler/Check-in'ler/Profil "Diğer" sekmesi altında toplanıyor
// (alt tab çubuğunun kalabalıklaşmasını önlemek için). Sekme içerikleri şu an
// placeholder - Sohbet M2'de, İlerleme M3'te, Antrenman+Beslenme M4'te,
// Diğer'in alt sayfaları M5'te dolduruluyor.
export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent }}>
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
        name="more"
        options={{
          title: t("Diğer", "More"),
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
