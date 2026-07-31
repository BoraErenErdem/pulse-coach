"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, Lock } from "lucide-react";
import { ApiError, resetPassword } from "@/lib/api";
import { Card, ErrorBanner, Label, LoadingState, PrimaryButton, Spinner, SuccessBanner, TextInput } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

function ResetPasswordForm() {
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

    if (newPassword !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4 text-center">
        <SuccessBanner message="Şifren değiştirildi. Artık yeni şifrenle giriş yapabilirsin." />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Giriş sayfasına dön
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Bu link geçersiz. Sıfırlama linkini tam olarak e-postandan aldığın haliyle açtığından emin ol." />
        <Link
          href="/forgot-password"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Yeni bir sıfırlama linki iste
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}

      <div>
        <Label htmlFor="newPassword">Yeni Şifre</Label>
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
        <Label htmlFor="confirmPassword">Yeni Şifre (tekrar)</Label>
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
        {isSubmitting ? "Lütfen bekleyin..." : "Şifreyi Değiştir"}
      </PrimaryButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="flex flex-1 items-center justify-center px-4 py-12"
      style={{
        backgroundImage:
          "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent)",
      }}
    >
      <div className="animate-fade-in-up w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="logo-mark mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
            <Activity className="logo-mark-icon h-6 w-6 text-accent" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Şifreyi Sıfırla</h1>
          <p className="mt-1 text-sm text-zinc-500">Yeni bir şifre belirle.</p>
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
