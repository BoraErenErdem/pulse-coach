import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { ApiError, forgotPassword } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { Card, ErrorBanner, FormInput, FormLabel, PrimaryButton, PulseMark, SuccessBanner, type ThemeColors, useThemeColors } from "@/components/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

// web/src/app/forgot-password/page.tsx'in mobil portu. NOT: reset-password
// ekranı mobilde BİLEREK yok - kullanıcı e-postadaki linki telefon
// tarayıcısında açıp mevcut web akışını kullanıyor (bkz. plan: Faz M1 kapsam
// kararı, Expo Go'nun exp:// şeması prod-benzeri deep-link'i zorlaştırıyor).
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`,
// login.tsx'teki AYNI tema/dil değiştirici satırı + logoMark deseni eklendi
// - bu ekran o zamana kadar unutulmuştu, koyu modda kırık kalıyordu VE
// login'in aksine tema değiştirme imkanı hiç yoktu.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useT();
  const c = useThemeColors();
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.toggleRow}>
          <ThemeToggle />
          <LanguageToggle />
        </View>
        <View style={s.header}>
          <View style={s.logoMark}>
            <PulseMark size={38} color={c.accent} animated pulseEveryMs={2000} />
          </View>
          <Text style={s.title}>{t("Şifremi Unuttum", "Forgot Password")}</Text>
          <Text style={s.subtitle}>
            {t("E-posta adresini gir, sıfırlama linkini gönderelim.", "Enter your email address and we'll send you a reset link.")}
          </Text>
        </View>

        <Card>
          {isSubmitted ? (
            <View style={{ alignItems: "center", gap: 12 }}>
              <SuccessBanner
                message={t(
                  "Bu e-posta sistemde kayıtlıysa, birazdan bir şifre sıfırlama linki alacaksın.",
                  "If this email is registered, you'll receive a password reset link shortly."
                )}
              />
              <BackToLoginLink />
            </View>
          ) : (
            <>
              {error ? <ErrorBanner message={error} /> : null}
              <View>
                <FormLabel>{t("E-posta", "Email")}</FormLabel>
                <FormInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@eposta.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              </View>
              <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
                {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Sıfırlama Linki Gönder", "Send Reset Link")}
              </PrimaryButton>
              <BackToLoginLink />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackToLoginLink() {
  const t = useT();
  const c = useThemeColors();
  return (
    <Link href="/login" style={{ textAlign: "center", fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.muted }}>
      {t("← Giriş sayfasına dön", "← Back to login")}
    </Link>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
      gap: 24,
    },
    toggleRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
    header: {
      alignItems: "center",
      gap: 4,
    },
    logoMark: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: `${c.accent}1F`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: c.text,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
    },
  });
}
