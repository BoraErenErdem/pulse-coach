"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Mail } from "lucide-react";
import { ApiError, forgotPassword } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { Card, ErrorBanner, Label, PrimaryButton, Spinner, SuccessBanner, TextInput } from "@/components/ui";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      // Backend kullanıcı var/yok her durumda aynı yanıtı dönüyor
      // (enumeration koruması) - frontend de aynı jenerik mesajı gösteriyor.
      setIsSubmitted(true);
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Şifremi Unuttum", "Forgot Password")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("E-posta adresini gir, sıfırlama linkini gönderelim.", "Enter your email address and we'll send you a reset link.")}
          </p>
        </div>

        <Card>
          {isSubmitted ? (
            <div className="space-y-4 text-center">
              <SuccessBanner
                message={t(
                  "Bu e-posta sistemde kayıtlıysa, birazdan bir şifre sıfırlama linki alacaksın.",
                  "If this email is registered, you'll receive a password reset link shortly."
                )}
              />
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("Giriş sayfasına dön", "Back to login")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <PrimaryButton type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Spinner className="h-4 w-4" /> : null}
                {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Sıfırlama Linki Gönder", "Send Reset Link")}
              </PrimaryButton>

              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("Giriş sayfasına dön", "Back to login")}
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
