"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, Lock } from "lucide-react";
import { ApiError, resetPassword } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { Card, ErrorBanner, Label, LoadingState, PrimaryButton, Spinner, SuccessBanner, TextInput } from "@/components/ui";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

function ResetPasswordForm() {
  const t = useT();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t("Şifre en az 8 karakter olmalı.", "Password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("Şifreler eşleşmiyor.", "Passwords don't match."));
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4 text-center">
        <SuccessBanner
          message={t(
            "Şifren değiştirildi. Artık yeni şifrenle giriş yapabilirsin.",
            "Your password has been changed. You can now log in with your new password."
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
    );
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <ErrorBanner
          message={t(
            "Bu link geçersiz. Sıfırlama linkini tam olarak e-postandan aldığın haliyle açtığından emin ol.",
            "This link is invalid. Make sure you opened the reset link exactly as you received it in your email."
          )}
        />
        <Link
          href="/forgot-password"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("Yeni bir sıfırlama linki iste", "Request a new reset link")}
        </Link>
      </div>
    );
  }

  return (
    // noValidate: native minLength constraint validation, JS validate()'e
    // hiç ulaşmadan submit'i sessizce engelliyordu - login sayfasındaki
    // AYNI regresyon (bkz. app/login/page.tsx).
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <div>
        <Label htmlFor="newPassword">{t("Yeni Şifre", "New Password")}</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <TextInput
            id="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="confirmPassword">{t("Yeni Şifre (tekrar)", "New Password (confirm)")}</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <TextInput
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <PrimaryButton type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner className="h-4 w-4 text-white" /> : null}
        {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Şifreyi Değiştir", "Change Password")}
      </PrimaryButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
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
            {t("Şifreyi Sıfırla", "Reset Password")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{t("Yeni bir şifre belirle.", "Set a new password.")}</p>
        </div>

        <Card>
          <Suspense fallback={<LoadingState />}>
            <ResetPasswordForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
