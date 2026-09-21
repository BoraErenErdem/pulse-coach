import { useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { AppLockProvider, useAppLock } from "@/lib/app-lock-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { ProfileProvider } from "@/lib/profile-context";
import { QuickAddProvider } from "@/lib/quick-add-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PulseMark } from "@/components/pulse-mark";
import { ErrorBanner, useThemeColors } from "@/components/ui";
import { AuthBackground, AuthButton, AuthErrorBanner, AuthPulseBadge, useAuthColors } from "@/components/auth-ui";

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

// 2026-08-26 güvenlik denetimi: cihaz root/jailbreak yapılmışsa (JailMonkey
// tespiti - sync, native only) tam engelleme yerine BİLGİLENDİRİCİ bir
// banner - kullanıcı meşru nedenlerle rootlu cihaz kullanıyor olabilir,
// hard-block yanlış-pozitiflerde uygulamayı kullanılmaz hale getirirdi.
// Sadece token varken (yani gerçek sağlık verisine erişilen ekranlarda)
// gösterilir, login ekranında gösterilmez.
function RootCompromiseBanner({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onDismiss}
      style={{ position: "absolute", top: insets.top + 4, left: 12, right: 12, zIndex: 50 }}
    >
      <ErrorBanner
        message="Bu cihaz root/jailbreak yapılmış görünüyor - sağlık verilerinin güvenliği garanti edilemez. Kapatmak için dokun."
      />
    </Pressable>
  );
}

const AUTH_WELCOME_BG = require("@/assets/images/auth/welcome-bg.png");

// Biyometri/PIN kilidi AÇIKKEN soğuk açılışta gösterilen tam ekran - bkz.
// lib/app-lock-context.tsx. LocalAuthentication.authenticateAsync() OS'un
// kendi Face ID/parmak izi/PIN arayüzünü açar, burada sadece tetikleme
// butonu ve hata mesajı var.
//
// Tasarım turu (2026-09-21, 3. revizyon): İlk turda her tema kendi ayrı
// tasarımını taşıyordu (koyu: kart+statik kilit ikonu, sonra Karşılama
// ekranına çevrildi; açık: hâlâ eski kart+ikon). Kullanıcı koyu modu
// onaylayınca "açık temayı da AYNI şekilde revize et" dedi - `AuthBackground`/
// `AuthPulseBadge`/`AuthButton`/`AuthErrorBanner` (app/(auth)/index.tsx'teki
// Karşılama ekranıyla birebir aynı bileşenler) zaten HER İKİ temayı da kendi
// içinde çözüyor (`useAuthPalette` - koyu: sıcak kahve-siyah + welcome-bg.png
// dokusu, açık: uygulamanın kendi kırık-beyaz zemini, DÜZ - turuncu gradyan
// [[feedback-auth-light-bg-rejected]] gerekçesiyle reddedilmişti) - artık iki
// ayrı dal yerine TEK bir uygulama, iki temada da otomatik doğru çıkıyor. Bu
// ekran biyometri/PIN donanımı gerektirdiği için web önizlemesinde HİÇ
// tetiklenmiyor (bkz. app-lock-context.tsx::isSupported) - canlı doğrulama
// gerçek cihazda yapılmalı.
function AppLockScreen() {
  const authPalette = useAuthColors();
  const { unlock } = useAppLock();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    setError(null);
    setIsAuthenticating(true);
    try {
      const success = await unlock();
      if (!success) setError("Doğrulama başarısız oldu, tekrar dener misin?");
    } finally {
      setIsAuthenticating(false);
    }
  }

  // Ekran açılır açılmaz doğrulamayı otomatik tetikle - kullanıcı ayrıca
  // butona basmak zorunda kalmasın (buton sadece ilk deneme reddedilirse/
  // iptal edilirse tekrar denemek için kalıyor).
  useEffect(() => {
    handleUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthBackground source={AUTH_WELCOME_BG}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
        <AuthPulseBadge size={96} strokeWidth={3} />
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ color: authPalette.wordmark, fontFamily: "Inter_700Bold", fontSize: 18 }}>
            Uygulama Kilitli
          </Text>
          <Text
            style={{
              color: authPalette.subtitle,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              textAlign: "center",
              lineHeight: 18,
              maxWidth: 280,
            }}
          >
            PulseCoach&apos;a devam etmek için kimliğini doğrula
          </Text>
        </View>
        {error ? <AuthErrorBanner message={error} /> : null}
        <View style={{ width: "100%", maxWidth: 320 }}>
          <AuthButton onPress={handleUnlock} disabled={isAuthenticating} loading={isAuthenticating}>
            Kilidi Aç
          </AuthButton>
        </View>
      </View>
    </AuthBackground>
  );
}

function RootNavigator() {
  const { token, isLoading } = useAuth();
  const { isEnabled, isResolving, isLocked } = useAppLock();
  const c = useThemeColors();
  const [isCompromised, setIsCompromised] = useState(false);
  const [dismissedCompromiseWarning, setDismissedCompromiseWarning] = useState(false);

  useEffect(() => {
    // JailMonkey web'de tanımsız - Expo web önizlemesinde çökmesin diye.
    if (Platform.OS === "web") return;
    // STATİK import değil - jail-monkey de native bir modül, dev-client
    // yeniden derlenmeden (bkz. lib/app-lock-context.tsx'teki AYNI not)
    // üst seviyede import edilirse TÜM uygulamayı çökertir. Dinamik import,
    // hata varsa Promise reddi olarak gelir - try/catch güvenle yakalar.
    import("jail-monkey")
      .then((module) => {
        const JailMonkey = module.default;
        setIsCompromised(JailMonkey.isJailBroken());
      })
      .catch(() => {
        // Native modül henüz mevcut değil (rebuild bekleniyor) veya tespit
        // başarısız oldu - sessizce yoksay, engelleyici olmayan bir uyarı
        // özelliği için bu, uygulamayı bozmaktan daha iyi bir varsayılan.
      });
  }, []);

  // Oturum SecureStore'dan geri yüklenirken VE uygulama kilidi tercihi
  // henüz okunurken (ikisi de kısa birer an) hiçbir gruba karar vermeden
  // bekletiyoruz - aksi halde önce (auth) sonra (tabs) gibi bir
  // yanlış-yönlendirme/flash oluşabilirdi. Native splash ekranı (fontlar
  // hazır olur olmaz kapanıyor, bkz. RootLayout) burayı kapatmıyor - yani bu
  // gerçekten görünür bir an, çıplak spinner yerine marka logosu
  // (2026-08-20 animasyon turu, chat geçmişi yüklemesiyle aynı desen).
  if (isLoading || isResolving) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <PulseMark size={48} color={c.accent} animated loop />
      </View>
    );
  }

  if (token && isEnabled && isLocked) {
    return <AppLockScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      {token && isCompromised && !dismissedCompromiseWarning ? (
        <RootCompromiseBanner onDismiss={() => setDismissedCompromiseWarning(true)} />
      ) : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!token}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </View>
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
          <AppLockProvider>
            <NotificationsProvider>
              <ProfileProvider>
                <LanguageProvider>
                  <QuickAddProvider>
                    <RootNavigator />
                  </QuickAddProvider>
                </LanguageProvider>
              </ProfileProvider>
            </NotificationsProvider>
          </AppLockProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
