import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Activity } from "lucide-react-native";
import { ApiError, forgotPassword } from "@/lib/api";
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

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      // Backend kullanıcı var/yok her durumda aynı yanıtı dönüyor
      // (enumeration koruması) - burada da aynı jenerik mesaj gösteriliyor.
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Beklenmeyen bir hata oluştu.");
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
          <Text style={styles.title}>Şifremi Unuttum</Text>
          <Text style={styles.subtitle}>E-posta adresini gir, sıfırlama linkini gönderelim.</Text>
        </View>

        <Card>
          {isSubmitted ? (
            <View style={{ alignItems: "center", gap: 12 }}>
              <SuccessBanner message="Bu e-posta sistemde kayıtlıysa, birazdan bir şifre sıfırlama linki alacaksın." />
              <BackToLoginLink />
            </View>
          ) : (
            <>
              {error ? <ErrorBanner message={error} /> : null}
              <View>
                <FormLabel>E-posta</FormLabel>
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
                {isSubmitting ? "Lütfen bekleyin..." : "Sıfırlama Linki Gönder"}
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
  return (
    <Link href="/login" style={styles.backLink}>
      ← Giriş sayfasına dön
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
