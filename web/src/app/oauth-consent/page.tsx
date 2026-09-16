"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, completeOAuth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { Card, ErrorBanner, PrimaryButton, Spinner } from "@/components/ui";
import { ConsentFields } from "@/components/ConsentFields";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PulseMark } from "@/components/PulseMark";

// Google/Apple ile İLK KEZ giriş yapan (henüz PulseCoach hesabı olmayan) bir
// kullanıcının indiği ara sayfa - bkz. components/OAuthButtons.tsx (buraya
// router.push ile pendingToken/email query param'larıyla geliyor) ve
// backend/app/auth/router.py (/auth/oauth/complete). KVKK/sağlık verisi/
// Kullanım Koşulları rızası Google/Apple ile kayıt olsa bile ATLANAMAZ
// (login/page.tsx'teki register modunun AYNI zorunluluğu) - bu yüzden e-posta/
// şifre form alanları YOK (kimlik zaten sağlayıcı tarafından doğrulandı),
// sadece üç onay + tek bir buton var. mobile/app/(auth)/oauth-consent.tsx
// ile AYNI akış.
function OAuthConsentForm() {
  const searchParams = useSearchParams();
  const pendingToken = searchParams.get("pendingToken") ?? "";
  const email = searchParams.get("email") ?? "";

  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [healthDataConsent, setHealthDataConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useT();
  const router = useRouter();
  const { applyTokens } = useAuth();

  async function handleSubmit() {
    setError(null);
    if (!kvkkConsent || !healthDataConsent || !termsConsent) {
      setError(t("Devam etmek için üç onayı da vermelisin.", "You must accept all three consents to continue."));
      return;
    }
    setIsSubmitting(true);
    try {
      const { access_token, refresh_token } = await completeOAuth(
        pendingToken,
        kvkkConsent,
        healthDataConsent,
        termsConsent
      );
      await applyTokens(access_token, refresh_token);
      router.push("/chat");
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
            <PulseMark size={38} animated pulseEveryMs={2000} className="logo-mark-icon text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Son bir adım", "One last step")}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {email
              ? t(`${email} olarak devam ediyorsun`, `Continuing as ${email}`)
              : t("Devam etmeden önce onayını almamız gerekiyor", "We need your consent before continuing")}
          </p>
        </div>

        <Card className="space-y-4">
          {error ? <ErrorBanner message={error} /> : null}

          <ConsentFields
            kvkkConsent={kvkkConsent}
            onKvkkConsentChange={setKvkkConsent}
            healthDataConsent={healthDataConsent}
            onHealthDataConsentChange={setHealthDataConsent}
            termsConsent={termsConsent}
            onTermsConsentChange={setTermsConsent}
          />

          <PrimaryButton
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !kvkkConsent || !healthDataConsent || !termsConsent}
          >
            {isSubmitting ? <Spinner className="h-4 w-4" /> : null}
            {isSubmitting ? t("Lütfen bekleyin...", "Please wait...") : t("Kaydı tamamla", "Finish sign up")}
          </PrimaryButton>
        </Card>
      </div>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={null}>
      <OAuthConsentForm />
    </Suspense>
  );
}
