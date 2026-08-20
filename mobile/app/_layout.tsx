import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts as useInterFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  useFonts as useFrauncesFonts,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { ProfileProvider } from "@/lib/profile-context";
import { QuickAddProvider } from "@/lib/quick-add-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PulseMark } from "@/components/pulse-mark";
import { useThemeColors } from "@/components/ui";

// Redesign (2026-08-15): mobilde daha önce hiç özel font yüklenmiyordu (RN
// sistem fontuna düşüyordu) - web/src/app/layout.tsx'teki Fraunces+Inter
// çiftinin RN karşılığı burada @expo-google-fonts paketleriyle yükleniyor.
// Fontlar yüklenene kadar native splash ekranı açık tutuluyor (web'deki
// THEME_INIT_SCRIPT'in senkron <head> script'iyle önlediği "önce sistem
// fontu sonra Fraunces/Inter" yanıp sönmesiyle aynı amaç).
SplashScreen.preventAutoHideAsync().catch(() => {});

// RN'de CSS'teki `body { font-family: ... }` kademeli mirasının bir karşılığı
// yok - bu yüzden Text/TextInput'un `defaultProps.style`'ı BİR KERE, kök
// seviyede Inter'e ayarlanıyor. Bu, ui.tsx'teki paylaşımlı bileşenler dahil
// UYGULAMA GENELİNDEKİ (Faz 1 kapsamı dışındaki ekranlar dahil) TÜM Text/
// TextInput'ları tek satırda yeni gövde fontuna geçiriyor - web'deki zinc->
// stone token takma adı ile AYNI düşük riskli "tek yerden kaskad" ilkesi.
// Bileşenlerin KENDİ `fontFamily` stilleri (ör. ui.tsx'teki Inter_600SemiBold
// varyantları, StatTile'ın Fraunces'i) bu varsayılanın ÜZERİNE yazar.
function applyDefaultFontFamily() {
  const TextAny = Text as unknown as { defaultProps?: { style?: unknown } };
  const TextInputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
  TextAny.defaultProps = TextAny.defaultProps ?? {};
  TextAny.defaultProps.style = [{ fontFamily: "Inter_400Regular" }, TextAny.defaultProps.style];
  TextInputAny.defaultProps = TextInputAny.defaultProps ?? {};
  TextInputAny.defaultProps.style = [
    { fontFamily: "Inter_400Regular" },
    TextInputAny.defaultProps.style,
  ];
}

function RootNavigator() {
  const { token, isLoading } = useAuth();
  const c = useThemeColors();

  // Oturum SecureStore'dan geri yüklenirken (kısa bir an) hiçbir gruba karar
  // vermeden bekletiyoruz - aksi halde önce (auth) sonra (tabs) gibi bir
  // yanlış-yönlendirme/flash oluşabilirdi. Native splash ekranı (fontlar
  // hazır olur olmaz kapanıyor, bkz. RootLayout) burayı kapatmıyor - yani bu
  // gerçekten görünür bir an, çıplak spinner yerine marka logosu
  // (2026-08-20 animasyon turu, chat geçmişi yüklemesiyle aynı desen).
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <PulseMark size={48} color={c.accent} animated loop />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [interLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [frauncesLoaded] = useFrauncesFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });
  const fontsReady = interLoaded && frauncesLoaded;

  useEffect(() => {
    if (!fontsReady) return;
    applyDefaultFontFamily();
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    // react-native-gesture-handler'ın (Swipeable dahil) çalışması için kök
    // seviyede zorunlu - Bildirimler ekranındaki kaydırarak silme jesti
    // için eklendi (2026-08-13). Sadece bir View sarmalayıcısı, navigasyon/
    // provider sırasını ETKİLEMEZ.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationsProvider>
            <ProfileProvider>
              <LanguageProvider>
                <QuickAddProvider>
                  <RootNavigator />
                </QuickAddProvider>
              </LanguageProvider>
            </ProfileProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
