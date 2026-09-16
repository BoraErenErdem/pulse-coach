import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, forgotPassword } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import {
  AuthBackground,
  AuthButton,
  AuthErrorBanner,
  AuthField,
  AuthSuccessBanner,
  AuthTextLink,
  AuthTopBar,
  AuthWordmark,
  useAuthColors,
} from "@/components/auth-ui";

const BG = require("@/assets/images/auth/login-bg.png");

// web/src/app/forgot-password/page.tsx'in mobil portu. NOT: reset-password
// ekranı mobilde BİLEREK yok - kullanıcı e-postadaki linki telefon
// tarayıcısında açıp mevcut web akışını kullanıyor (bkz. plan: Faz M1 kapsam
// kararı, Expo Go'nun exp:// şeması prod-benzeri deep-link'i zorlaştırıyor).
// 2026-09-16: login/register/karşılama ile GÖRSEL PARİTE için auth-ui.tsx'e
// taşındı (önceden eski tema-bağlı kartlı görünümde kalmıştı, kullanıcı
// bulgusu - login'in yeni koyu gradient stiliyle uyuşmuyordu). Kendi ayrı
// PNG mockup'ı gelmedi - giriş ekranının arkaplanı (login-bg.png) burada da
// kullanılıyor, aynı "oturum" içindeki ikincil bir ekran olduğu için.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useT();
  const router = useRouter();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      // Backend kullanıcı var/yok her durumda aynı yanıtı dönüyor
      // (enumeration koruması) - burada da aynı jenerik mesaj gösteriliyor.
      setIsSubmitted(true);
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
            <AuthWordmark size={26} withMark markSize={50} />
            <Text style={s.title}>{t("Şifremi Unuttum", "Forgot Password")}</Text>
            <Text style={s.subtitle}>
              {t("E-posta adresini gir, sıfırlama linkini gönderelim.", "Enter your email address and we'll send you a reset link.")}
            </Text>
          </View>

          {isSubmitted ? (
            <View style={s.successBlock}>
              <AuthSuccessBanner
                message={t(
                  "Bu e-posta sistemde kayıtlıysa, birazdan bir şifre sıfırlama linki alacaksın.",
                  "If this email is registered, you'll receive a password reset link shortly."
                )}
              />
              <AuthTextLink onPress={() => router.replace("/login")} align="center">
                {t("← Giriş sayfasına dön", "← Back to login")}
              </AuthTextLink>
            </View>
          ) : (
            <>
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
              <AuthButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
                {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Sıfırlama Linki Gönder", "Send Reset Link")}
              </AuthButton>
              <AuthTextLink onPress={() => router.replace("/login")} align="center">
                {t("← Giriş sayfasına dön", "← Back to login")}
              </AuthTextLink>
            </>
          )}
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
      textAlign: "center",
      ...authFont("regular"),
    },
    successBlock: {
      alignItems: "center",
      gap: 16,
    },
  });
}
