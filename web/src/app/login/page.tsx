"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Lock, Mail } from "lucide-react";
import { ApiError, register as apiRegister } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import {
  Card,
  ErrorBanner,
  Label,
  PrimaryButton,
  Spinner,
  SuccessBanner,
  TextInput,
} from "@/components/ui";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const t = useT();

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setPasswordConfirm("");
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Tarayıcının native (type="email"/minLength) doğrulamasına ek olarak
    // açık, görünür bir kontrol: bazı ortamlarda (ör. otomasyon, autofill)
    // native doğrulama tetiklenmeden form submit edilebiliyor ve kullanıcı
    // hiçbir hata görmeden "hiçbir şey olmuyormuş" gibi bir izlenime kapılıyordu.
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        router.push("/chat");
      } else {
        await apiRegister(email, password);
        // switchMode kendi içinde setSuccessMessage(null) çağırıyor - bu
        // yüzden asıl mesaj switchMode'dan SONRA set edilmeli, yoksa hemen
        // temizlenip hiç görünmüyor.
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
    <div
      className="flex flex-1 items-center justify-center px-4 py-12"
      style={{
        backgroundImage:
          "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent)",
      }}
    >
      <div className="animate-fade-in-up w-full max-w-sm">
        <div className="mb-4 flex justify-end gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="logo-mark mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
            <Activity className="logo-mark-icon h-6 w-6 text-accent" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">PulseCoach</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("Sağlık ve fitness koçun", "Your health and fitness coach")}</p>
        </div>

        <Card>
          <div className="mb-6 flex rounded-lg bg-[var(--surface-muted)] p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-[var(--surface)] text-zinc-900 shadow-sm dark:text-zinc-50"
                  : "text-zinc-500"
              }`}
            >
              {t("Giriş Yap", "Log In")}
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-[var(--surface)] text-zinc-900 shadow-sm dark:text-zinc-50"
                  : "text-zinc-500"
              }`}
            >
              {t("Kayıt Ol", "Sign Up")}
            </button>
          </div>

          {/* noValidate: native constraint validation (minLength/type=email)
              submit event'ini JS validate()'e hiç ulaşmadan sessizce
              engelliyordu (zayıf şifrede ne native tooltip ne ErrorBanner
              görünüyordu) - canlı testte bulunan regresyon. Doğrulama
              tamamen validate()'e devredildi, input'lardaki required/
              type/minLength sadece ekran okuyucu/a11y ipucu olarak kalıyor. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {successMessage ? <SuccessBanner message={successMessage} /> : null}
            {error ? <ErrorBanner message={error} /> : null}

            <div>
              <Label htmlFor="email">{t("E-posta", "Email")}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <TextInput
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="password" className="mb-0">
                  {t("Şifre", "Password")}
                </Label>
                {mode === "login" ? (
                  <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
                    {t("Şifremi unuttum", "Forgot password")}
                  </Link>
                ) : null}
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <TextInput
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {mode === "register" ? (
              <div>
                <Label htmlFor="passwordConfirm">{t("Şifre (tekrar)", "Password (confirm)")}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <TextInput
                    id="passwordConfirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            ) : null}

            <PrimaryButton type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner className="h-4 w-4" /> : null}
              {isSubmitting
                ? t("Lütfen bekleyin...", "Please wait...")
                : mode === "login"
                  ? t("Giriş Yap", "Log In")
                  : t("Kayıt Ol", "Sign Up")}
            </PrimaryButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
