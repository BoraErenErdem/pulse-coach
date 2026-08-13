import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { ProfileProvider } from "@/lib/profile-context";

function RootNavigator() {
  const { token, isLoading } = useAuth();

  // Oturum SecureStore'dan geri yüklenirken (kısa bir an) hiçbir gruba karar
  // vermeden bekletiyoruz - aksi halde önce (auth) sonra (tabs) gibi bir
  // yanlış-yönlendirme/flash oluşabilirdi.
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
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
  return (
    // react-native-gesture-handler'ın (Swipeable dahil) çalışması için kök
    // seviyede zorunlu - Bildirimler ekranındaki kaydırarak silme jesti
    // için eklendi (2026-08-13). Sadece bir View sarmalayıcısı, navigasyon/
    // provider sırasını ETKİLEMEZ.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationsProvider>
          <ProfileProvider>
            <LanguageProvider>
              <RootNavigator />
            </LanguageProvider>
          </ProfileProvider>
        </NotificationsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
