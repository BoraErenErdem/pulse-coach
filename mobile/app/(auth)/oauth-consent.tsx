import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, completeOAuth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import {
  AuthBackground,
  AuthButton,
  AuthConsentGroup,
  AuthErrorBanner,
  AuthTopBar,
  AuthWordmark,
  useAuthColors,
} from "@/components/auth-ui";

const BG = require("@/assets/images/auth/register-bg.png");

// Google/Apple ile İLK KEZ giriş yapan (henüz PulseCoach hesabı olmayan) bir
// kullanıcının indiği ara ekran - bkz. oauth-buttons.tsx (buraya router.push
// ile pendingToken/email param'larıyla geliyor) ve backend/app/auth/router.py
// (/auth/oauth/complete). KVKK/sağlık verisi/Kullanım Koşulları rızası
// Google/Apple ile kayıt olsa bile ATLANAMAZ (register.tsx'teki AYNI
// zorunluluk) - bu yüzden e-posta/şifre form alanları YOK (kimlik zaten
// sağlayıcı tarafından doğrulandı), sadece üç onay + tek bir buton var.
export default function OAuthConsentScreen() {
  const params = useLocalSearchParams<{ pendingToken: string; email?: string }>();
  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [healthDataConsent, setHealthDataConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useT();
  const router = useRouter();
  const { applyTokens } = useAuth();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);

  async function handleSubmit() {
    setError(null);
    if (!kvkkConsent || !healthDataConsent || !termsConsent) {
      setError(
        t(
          "Devam etmek için üç onayı da vermelisin.",
          "You must accept all three consents to continue."
        )
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const { access_token, refresh_token } = await completeOAuth(
        params.pendingToken,
        kvkkConsent,
        healthDataConsent,
        termsConsent
      );
      await applyTokens(access_token, refresh_token);
      // Navigasyon gerekmiyor: token değişince root layout'taki
      // Stack.Protected otomatik olarak (tabs) grubuna geçiyor.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthBackground source={BG}>
      <AuthTopBar />
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <AuthWordmark size={26} />
          <Text style={s.title}>{t("Son bir adım", "One last step")}</Text>
          <Text style={s.subtitle}>
            {params.email
              ? t(`${params.email} olarak devam ediyorsun`, `Continuing as ${params.email}`)
              : t("Devam etmeden önce onayını almamız gerekiyor", "We need your consent before continuing")}
          </Text>
        </View>

        {error ? <AuthErrorBanner message={error} /> : null}

        <View style={s.consentGroup}>
          <AuthConsentGroup
            kvkkConsent={kvkkConsent}
            onKvkkConsentChange={setKvkkConsent}
            healthDataConsent={healthDataConsent}
            onHealthDataConsentChange={setHealthDataConsent}
            termsConsent={termsConsent}
            onTermsConsentChange={setTermsConsent}
            onNavigate={(href) => router.push(href)}
          />
        </View>

        <AuthButton
          onPress={handleSubmit}
          disabled={isSubmitting || !kvkkConsent || !healthDataConsent || !termsConsent}
          loading={isSubmitting}
        >
          {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Kaydı tamamla", "Finish sign up")}
        </AuthButton>
      </ScrollView>
    </AuthBackground>
  );
}

function makeStyles(c: ReturnType<typeof useAuthColors>) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: 24,
      paddingTop: 72,
      gap: 20,
    },
    header: {
      alignItems: "center",
      gap: 4,
      marginBottom: 8,
    },
    title: {
      fontSize: 24,
      color: c.wordmark,
      marginTop: 16,
      ...authFont("bold"),
    },
    subtitle: {
      fontSize: 14,
      color: c.subtitle,
      textAlign: "center",
      ...authFont("regular"),
    },
    consentGroup: {
      gap: 16,
      paddingTop: 4,
    },
  });
}
