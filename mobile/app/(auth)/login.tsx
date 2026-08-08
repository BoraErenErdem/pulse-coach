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
import { useT } from "@/lib/language-context";
import { LanguageToggle } from "@/components/language-toggle";
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
  const t = useT();

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setPasswordConfirm("");
  }

  function validate(): string | null {
    if (!EMAIL_PATTERN.test(email)) {
      return t("Geçerli bir e-posta adresi gir.", "Enter a valid email address.");
    }
    if (mode === "register") {
      if (password.length < 8) {
        return t("Şifre en az 8 karakter olmalı.", "Password must be at least 8 characters.");
      }
      if (password !== passwordConfirm) {
        return t("Şifreler eşleşmiyor.", "Passwords don't match.");
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
        setSuccessMessage(t("Kayıt başarılı! Şimdi giriş yapabilirsin.", "Registration successful! You can log in now."));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
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
        <View style={styles.toggleRow}>
          <LanguageToggle />
        </View>
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Activity size={26} color={colors.accent} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>PulseCoach</Text>
          <Text style={styles.subtitle}>{t("Sağlık ve fitness koçun", "Your health and fitness coach")}</Text>
        </View>

        <Card>
          <View style={styles.tabRow}>
            <TabButton label={t("Giriş Yap", "Log In")} active={mode === "login"} onPress={() => switchMode("login")} />
            <TabButton label={t("Kayıt Ol", "Sign Up")} active={mode === "register"} onPress={() => switchMode("register")} />
          </View>

          {successMessage ? <SuccessBanner message={successMessage} /> : null}
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

          <View>
            <View style={styles.passwordLabelRow}>
              <FormLabel>{t("Şifre", "Password")}</FormLabel>
              {mode === "login" ? (
                <Link href="/forgot-password" style={styles.forgotLink}>
                  {t("Şifremi unuttum", "Forgot password")}
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
              <FormLabel>{t("Şifre (tekrar)", "Password (confirm)")}</FormLabel>
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
            {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : mode === "login" ? t("Giriş Yap", "Log In") : t("Kayıt Ol", "Sign Up")}
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
  toggleRow: {
    alignItems: "flex-end",
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
