import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { ApiError, register as apiRegister } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  ErrorBanner,
  FormInput,
  FormLabel,
  PrimaryButton,
  PulseMark,
  SuccessBanner,
  type ThemeColors,
  useThemeColors,
} from "@/components/ui";

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
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);

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
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.toggleRow}>
          <ThemeToggle />
          <LanguageToggle />
        </View>
        <View style={s.header}>
          <View style={s.logoMark}>
            <PulseMark size={38} color={c.accent} animated pulseEveryMs={2000} />
          </View>
          <Text style={s.title}>PulseCoach</Text>
          <Text style={s.subtitle}>{t("Sağlık ve fitness koçun", "Your health and fitness coach")}</Text>
        </View>

        <Card>
          <View style={s.tabRow}>
            <TabButton
              label={t("Giriş Yap", "Log In")}
              active={mode === "login"}
              onPress={() => switchMode("login")}
              c={c}
            />
            <TabButton
              label={t("Kayıt Ol", "Sign Up")}
              active={mode === "register"}
              onPress={() => switchMode("register")}
              c={c}
            />
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
            <View style={s.passwordLabelRow}>
              <FormLabel>{t("Şifre", "Password")}</FormLabel>
              {mode === "login" ? (
                <Link href="/forgot-password" style={s.forgotLink}>
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

function TabButton({
  label,
  active,
  onPress,
  c,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  c: ThemeColors;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.tabButton, active && s.tabButtonActive]}>
      <Text onPress={onPress} style={[s.tabButtonText, active && s.tabButtonTextActive]}>
        {label}
      </Text>
    </View>
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
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    subtitle: {
      fontSize: 13,
      color: c.muted,
    },
    tabRow: {
      flexDirection: "row",
      backgroundColor: c.surfaceMuted,
      borderRadius: 10,
      padding: 4,
    },
    tabButton: {
      flex: 1,
      borderRadius: 8,
      paddingVertical: 8,
    },
    tabButtonActive: {
      backgroundColor: c.surface,
    },
    tabButtonText: {
      textAlign: "center",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
    },
    tabButtonTextActive: {
      color: c.text,
    },
    passwordLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    forgotLink: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.accent,
    },
  });
}
