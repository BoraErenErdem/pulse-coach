import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, register as apiRegister } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import {
  AuthBackground,
  AuthBottomLink,
  AuthButton,
  AuthConsentGroup,
  AuthErrorBanner,
  AuthField,
  AuthTopBar,
  AuthWordmark,
  useAuthColors,
} from "@/components/auth-ui";
import { OAuthButtons } from "@/components/oauth-buttons";

const BG = require("@/assets/images/auth/register-bg.png");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// login.tsx'in eski tab'lı "register" modunun ayrıştırılmış hali - tasarımcı
// arkadaşımızın PNG mockup'ı (Kaydol ekranı) artık kendi ayrı rotası
// (bkz. login.tsx'teki AYNI ayrım). Doğrulama kuralları/rıza metinleri AYNI
// (web/src/app/login/page.tsx ile paritesi bozulmadı), sadece görsel katman
// bu üç kişisel-marka ekranına özgü auth-ui.tsx bileşenlerine geçti.
export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [healthDataConsent, setHealthDataConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useT();
  const router = useRouter();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);

  function validate(): string | null {
    if (!EMAIL_PATTERN.test(email)) {
      return t("Geçerli bir e-posta adresi gir.", "Enter a valid email address.");
    }
    if (password.length < 8) {
      return t("Şifre en az 8 karakter olmalı.", "Password must be at least 8 characters.");
    }
    if (password !== passwordConfirm) {
      return t("Şifreler eşleşmiyor.", "Passwords don't match.");
    }
    if (!kvkkConsent) {
      return t(
        "Devam etmek için Aydınlatma Metni'ni ve KVKK açık rızasını onaylamalısın.",
        "You must accept the Privacy Notice and KVKK consent to continue."
      );
    }
    if (!healthDataConsent) {
      return t(
        "Devam etmek için sağlık verilerinin işlenmesine açık rıza vermelisin.",
        "You must consent to the processing of your health data to continue."
      );
    }
    if (!termsConsent) {
      return t(
        "Devam etmek için Kullanım Koşulları'nı kabul etmelisin.",
        "You must accept the Terms of Service to continue."
      );
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRegister(email, password, kvkkConsent, healthDataConsent, termsConsent);
      router.replace({ pathname: "/login", params: { registered: "1" } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthBackground source={BG}>
      <AuthTopBar />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <AuthWordmark size={26} />
            <Text style={s.title}>{t("Kaydol", "Sign Up")}</Text>
            <Text style={s.subtitle}>{t("Başlamaya hazırsan hesabını oluşturalım", "Let's create your account")}</Text>
          </View>

          {error ? <AuthErrorBanner message={error} /> : null}

          <OAuthButtons />

          <AuthField
            label={t("E-posta", "Email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <AuthField
            label={t("Şifre", "Password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <AuthField
            label={t("Şifre (tekrar)", "Password (confirm)")}
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />

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
            {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Kaydol", "Sign Up")}
          </AuthButton>

          <AuthBottomLink
            prefix={t("Zaten bir hesabın var mı?", "Already have an account?")}
            linkText={t("Giriş yap", "Log in")}
            onPress={() => router.replace("/login")}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthBackground>
  );
}

function makeStyles(c: ReturnType<typeof useAuthColors>) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
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
      ...authFont("regular"),
    },
    consentGroup: {
      gap: 16,
      paddingTop: 4,
    },
  });
}
