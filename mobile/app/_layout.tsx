import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";

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
    <AuthProvider>
      <LanguageProvider>
        <RootNavigator />
      </LanguageProvider>
    </AuthProvider>
  );
}
