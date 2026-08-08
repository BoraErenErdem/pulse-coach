import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Activity } from "lucide-react-native";
import { ApiError, forgotPassword } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { Card, ErrorBanner, FormInput, FormLabel, PrimaryButton, SuccessBanner, colors } from "@/components/ui";

// web/src/app/forgot-password/page.tsx'in mobil portu. NOT: reset-password
// ekranı mobilde BİLEREK yok - kullanıcı e-postadaki linki telefon
// tarayıcısında açıp mevcut web akışını kullanıyor (bkz. plan: Faz M1 kapsam
// kararı, Expo Go'nun exp:// şeması prod-benzeri deep-link'i zorlaştırıyor).
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useT();

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Activity size={26} color={colors.accent} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>{t("Şifremi Unuttum", "Forgot Password")}</Text>
          <Text style={styles.subtitle}>
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
  return (
    <Link href="/login" style={styles.backLink}>
      {t("← Giriş sayfasına dön", "← Back to login")}
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  header: {
    alignItems: "center",
    gap: 4,
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#e8f2fd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  backLink: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
});
