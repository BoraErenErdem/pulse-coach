import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Activity } from "lucide-react-native";
import { ApiError, register as apiRegister } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, ErrorBanner, FormInput, FormLabel, PrimaryButton, SuccessBanner, colors } from "@/components/ui";

// web/src/app/login/page.tsx'in mobil portu - aynı doğrulama kuralları/
// davranış (tek ekranda login/register tab toggle). Native TextInput zaten
// web'deki `noValidate` sorununa denk bir şey yaşamıyor (form submit event'i
// yok), ama aynı görünür validate() kontrolü tutarlılık için korunuyor.
type Mode = "login" | "register";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setPasswordConfirm("");
  }

  function validate(): string | null {
    if (!EMAIL_PATTERN.test(email)) {
      return "Geçerli bir e-posta adresi gir.";
    }
    if (mode === "register") {
      if (password.length < 8) {
        return "Şifre en az 8 karakter olmalı.";
      }
      if (password !== passwordConfirm) {
        return "Şifreler eşleşmiyor.";
      }
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
      if (mode === "login") {
        await login(email, password);
        // Navigasyon gerekmiyor: token değişince root layout'taki
        // Stack.Protected otomatik olarak (tabs) grubuna geçiyor.
      } else {
        await apiRegister(email, password);
        switchMode("login");
        setSuccessMessage("Kayıt başarılı! Şimdi giriş yapabilirsin.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Activity size={26} color={colors.accent} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>PulseCoach</Text>
          <Text style={styles.subtitle}>Sağlık ve fitness koçun</Text>
        </View>

        <Card>
          <View style={styles.tabRow}>
            <TabButton label="Giriş Yap" active={mode === "login"} onPress={() => switchMode("login")} />
            <TabButton label="Kayıt Ol" active={mode === "register"} onPress={() => switchMode("register")} />
          </View>

          {successMessage ? <SuccessBanner message={successMessage} /> : null}
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

          <View>
            <View style={styles.passwordLabelRow}>
              <FormLabel>Şifre</FormLabel>
              {mode === "login" ? (
                <Link href="/forgot-password" style={styles.forgotLink}>
                  Şifremi unuttum
                </Link>
              ) : null}
            </View>
            <FormInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              textContentType={mode === "login" ? "password" : "newPassword"}
            />
          </View>

          {mode === "register" ? (
            <View>
              <FormLabel>Şifre (tekrar)</FormLabel>
              <FormInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
            </View>
          ) : null}

          <PrimaryButton onPress={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Lütfen bekleyin..." : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}
          </PrimaryButton>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text
        onPress={onPress}
        style={[styles.tabButtonText, active && styles.tabButtonTextActive]}
      >
        {label}
      </Text>
    </View>
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
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: "#fff",
  },
  tabButtonText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  tabButtonTextActive: {
    color: colors.text,
  },
  passwordLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },
});
