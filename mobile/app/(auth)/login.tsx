import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import {
  AuthBackground,
  AuthBottomLink,
  AuthButton,
  AuthErrorBanner,
  AuthField,
  AuthSuccessBanner,
  AuthTopBar,
  AuthWordmark,
  useAuthColors,
} from "@/components/auth-ui";

const BG = require("@/assets/images/auth/login-bg.png");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tasarımcı arkadaşımızın PNG mockup'ının mobil portu (Giriş Yap ekranı) -
// önceden bu dosya login+register'ı tek tab'lı ekranda birleştiriyordu,
// tasarımlar iki ayrı tam ekran olarak geldiği için register.tsx'e ayrıştırıldı
// (bkz. o dosya, aynı doğrulama/API kuralları). `registered` query param'ı
// register.tsx'in başarılı kayıt sonrası buraya yönlendirirken ilettiği
// başarı mesajını tetikliyor - önceki tek-ekran sürümünde bu state aynı
// componentte kalıyordu, artık ekranlar arası taşımak için router param
// gerekiyor.
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ registered?: string }>();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);

  async function handleSubmit() {
    setError(null);
    if (!EMAIL_PATTERN.test(email)) {
      setError(t("Geçerli bir e-posta adresi gir.", "Enter a valid email address."));
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
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
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <AuthWordmark size={26} withMark />
            <Text style={s.title}>{t("Giriş Yap", "Log In")}</Text>
            <Text style={s.subtitle}>{t("Devam etmek için giriş yap", "Log in to continue")}</Text>
          </View>

          {params.registered === "1" ? (
            <AuthSuccessBanner
              message={t("Kayıt başarılı! Şimdi giriş yapabilirsin.", "Registration successful! You can log in now.")}
            />
          ) : null}
          {error ? <AuthErrorBanner message={error} /> : null}

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
            autoComplete="current-password"
            textContentType="password"
          />

          <Link href="/forgot-password" style={s.forgotLink}>
            {t("Şifremi unuttum", "Forgot password")}
          </Link>

          <AuthButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Giriş Yap", "Log In")}
          </AuthButton>

          <AuthBottomLink
            prefix={t("Hesabın yok mu?", "Don't have an account?")}
            linkText={t("Kaydol", "Sign up")}
            onPress={() => router.replace("/register")}
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
      justifyContent: "center",
      padding: 24,
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
    forgotLink: {
      alignSelf: "center",
      fontSize: 13,
      color: c.bottomLinkAction,
      ...authFont("bold"),
    },
  });
}
