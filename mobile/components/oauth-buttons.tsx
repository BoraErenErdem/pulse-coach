import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { ApiError, appleAuth, googleAuth, type OAuthResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import { AuthErrorBanner, useAuthColors } from "@/components/auth-ui";

// expo-auth-session'ın kendi web boilerplate'i - tarayıcı sekmesi/popup'ının
// başarılı girişten sonra kendini kapatabilmesi için gerekiyor, bu modülün
// import edildiği HER yerde bir kez çağrılmış olması yeterli.
WebBrowser.maybeCompleteAuthSession();

// Google Cloud Console'da platform başına AYRI client ID oluşturulur (bkz.
// backend .env.example'daki aynı not) - üçü de boşsa (henüz kurulmadıysa)
// `request` null kalır, buton devre dışı görünür (çökme YOK).
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

type Provider = "google" | "apple";

/** Giriş/Kaydol ekranlarına eklenen Google/Apple butonları (2026-09-16).
 * Apple butonu SADECE iOS'ta ve cihazda gerçekten kullanılabilirse gösterilir
 * (bkz. isAvailableAsync) - Apple'ın kendi kuralı gereği Google'dan ÖNCE/
 * ÜSTTE render ediliyor. `expo-apple-authentication` native bir modül
 * olduğu için (bkz. feedback_expo_native_module_static_import_crash.md
 * kalıcı dersi - dev-client yeniden derilmeden üst seviye statik import TÜM
 * uygulamayı çökertir) BİLİNÇLİ olarak dinamik import ediliyor; Google
 * tarafı (`expo-auth-session`) saf JS olduğu için statik import güvenli. */
export function OAuthButtons() {
  const { applyTokens } = useAuth();
  const t = useT();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Google Cloud kimlik bilgileri henüz .env'e girilmediyse (bkz. o dosyadaki
  // not) platforma göre gereken alan (webClientId web'de, iosClientId iOS'ta,
  // androidClientId Android'de) undefined kalır - expo-auth-session bunu
  // GÖRMEZDEN GELMİYOR, hook'un İÇİNDE senkron olarak throw ediyor (tüm
  // ekranı çökertir). `clientId` bir yedek/fallback alanı olarak HER ZAMAN
  // dolu bir şey (üçünden biri, hiçbiri yoksa placeholder) geçerek bu throw'u
  // önlüyoruz - gerçek "yapılandırılmamış" durumu `hasGoogleConfig` ile ayrı
  // takip edilip buton devre dışı bırakılıyor.
  const hasGoogleConfig = Boolean(GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    clientId: GOOGLE_WEB_CLIENT_ID ?? GOOGLE_ANDROID_CLIENT_ID ?? GOOGLE_IOS_CLIENT_ID ?? "not-configured",
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    import("expo-apple-authentication")
      .then((mod) => mod.isAvailableAsync())
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    handleOAuthResult("google", googleAuth(idToken));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function handleOAuthResult(provider: Provider, pending: Promise<OAuthResult>) {
    setError(null);
    setBusyProvider(provider);
    try {
      const result = await pending;
      if (result.status === "logged_in" && result.access_token && result.refresh_token) {
        await applyTokens(result.access_token, result.refresh_token);
      } else if (result.status === "consent_required" && result.pending_token) {
        router.push({
          pathname: "/oauth-consent",
          params: { pendingToken: result.pending_token, email: result.email ?? "" },
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleApplePress() {
    setError(null);
    setBusyProvider("apple");
    try {
      const AppleAuthentication = await import("expo-apple-authentication");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple sign-in returned no identity token");
      }
      const result = await appleAuth(credential.identityToken);
      if (result.status === "logged_in" && result.access_token && result.refresh_token) {
        await applyTokens(result.access_token, result.refresh_token);
      } else if (result.status === "consent_required" && result.pending_token) {
        router.push({
          pathname: "/oauth-consent",
          params: { pendingToken: result.pending_token, email: result.email ?? credential.email ?? "" },
        });
      }
    } catch (err) {
      // Kullanıcı Apple'ın kendi ekranında "İptal"e bastıysa sessizce
      // çık - bu bir hata değil, bir tercih.
      if ((err as { code?: string } | null)?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <View style={s.wrap}>
      {error ? <AuthErrorBanner message={error} /> : null}
      {Platform.OS === "ios" && appleAvailable ? (
        <Pressable
          onPress={handleApplePress}
          disabled={busyProvider !== null}
          style={({ pressed }) => [s.button, (pressed || busyProvider !== null) && s.buttonPressed]}
        >
          {busyProvider === "apple" ? (
            <ActivityIndicator color={c.fieldText} />
          ) : (
            <>
              <Text style={s.icon}>{""}</Text>
              <Text style={s.buttonText}>{t("Apple ile devam et", "Continue with Apple")}</Text>
            </>
          )}
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => promptAsync()}
        disabled={!request || !hasGoogleConfig || busyProvider !== null}
        style={({ pressed }) => [s.button, (pressed || !request || !hasGoogleConfig || busyProvider !== null) && s.buttonPressed]}
      >
        {busyProvider === "google" ? (
          <ActivityIndicator color={c.fieldText} />
        ) : (
          <>
            <Text style={[s.icon, s.googleIcon]}>G</Text>
            <Text style={s.buttonText}>{t("Google ile devam et", "Continue with Google")}</Text>
          </>
        )}
      </Pressable>
      <View style={s.dividerRow}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>{t("veya", "or")}</Text>
        <View style={s.dividerLine} />
      </View>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useAuthColors>) {
  return StyleSheet.create({
    wrap: {
      gap: 10,
    },
    button: {
      height: 50,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: c.fieldBg,
      borderWidth: 1,
      borderColor: c.fieldBorder,
    },
    buttonPressed: {
      opacity: 0.7,
    },
    icon: {
      fontSize: 17,
      color: c.fieldText,
      ...authFont("bold"),
    },
    googleIcon: {
      color: "#EA4335",
    },
    buttonText: {
      fontSize: 15,
      color: c.fieldText,
      ...authFont("semibold"),
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 2,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: c.fieldBorder,
    },
    dividerText: {
      fontSize: 12,
      color: c.subtitle,
      ...authFont("regular"),
    },
  });
}
