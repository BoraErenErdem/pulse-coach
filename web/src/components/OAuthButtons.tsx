"use client";

import { useCallback, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { ApiError, appleAuth, googleAuth, type OAuthResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { ErrorBanner } from "@/components/ui";

// Google Cloud Console'da (bkz. mobile/lib/api.ts::OAuthResult'taki AYNI
// not) platform başına ayrı client ID oluşturuluyor - web tarafı için TEK
// bir değer yeterli, ama o değer BURADA değil layout.tsx'teki
// GoogleOAuthProvider'da okunuyor (bu bileşen sadece Provider'ın altında
// yaşıyor, kendi clientId kopyasını tutmuyor).
// Apple'da web akışı uygulamanın Bundle ID'sini DEĞİL, ayrı bir "Service ID"
// kullanıyor ve SADECE HTTPS + Apple Developer'da doğrulanmış bir domain'e
// (bkz. proje belleği - pulsecoachapp.com henüz canlı değil) yönlendirebiliyor.
// localhost'ta TEST EDİLEMEZ - bu yüzden buton aşağıda `appleConfigured`
// false olduğunda (env boşken) render edilmiyor, domain canlıya çıkıp Apple
// tarafında Service ID/domain doğrulaması tamamlanınca env doldurulacak.
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<{ authorization: { id_token: string } }>;
      };
    };
  }
}

/** Giriş/Kayıt sayfasına eklenen Google/Apple butonları (2026-09-16) -
 * mobile/components/oauth-buttons.tsx'in web karşılığı, AYNI backend
 * uç noktalarını (googleAuth/appleAuth/completeOAuth) kullanıyor. Backend
 * "logged_in" dönerse applyTokens ile doğrudan oturum açılıyor;
 * "consent_required" dönerse (Google/Apple ile İLK KEZ giriş) /oauth-consent
 * sayfasına yönlendirilip KVKK/sağlık verisi/Kullanım Koşulları onayı
 * alınıyor - register formunun üç onay checkbox'ı ATLANMIYOR. */
export function OAuthButtons() {
  const { applyTokens } = useAuth();
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const appleConfigured = Boolean(APPLE_CLIENT_ID && APPLE_REDIRECT_URI);

  const handleResult = useCallback(
    async (result: OAuthResult) => {
      if (result.status === "logged_in" && result.access_token && result.refresh_token) {
        await applyTokens(result.access_token, result.refresh_token);
        router.push("/chat");
      } else if (result.status === "consent_required" && result.pending_token) {
        router.push(
          `/oauth-consent?pendingToken=${encodeURIComponent(result.pending_token)}&email=${encodeURIComponent(result.email ?? "")}`
        );
      }
    },
    [applyTokens, router]
  );

  async function handleGoogleSuccess(credentialResponse: CredentialResponse) {
    setError(null);
    if (!credentialResponse.credential) return;
    try {
      const result = await googleAuth(credentialResponse.credential);
      await handleResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    }
  }

  async function handleApplePress() {
    setError(null);
    try {
      if (!window.AppleID) throw new Error("Apple SDK not loaded");
      window.AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "email",
        redirectURI: APPLE_REDIRECT_URI,
        usePopup: true,
      });
      const response = await window.AppleID.auth.signIn();
      const result = await appleAuth(response.authorization.id_token);
      await handleResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Beklenmeyen bir hata oluştu.", "An unexpected error occurred."));
    }
  }

  return (
    <div className="space-y-3">
      {appleConfigured ? (
        <>
          <Script
            src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
            strategy="lazyOnload"
            onReady={() => setAppleReady(true)}
          />
          <button
            type="button"
            onClick={handleApplePress}
            disabled={!appleReady}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200"
          >
            <span aria-hidden>{""}</span>
            {t("Apple ile devam et", "Continue with Apple")}
          </button>
        </>
      ) : null}

      {/* GOOGLE_WEB_CLIENT_ID boşken de BİLİNÇLİ olarak render ediliyor
          (mobile/components/oauth-buttons.tsx ile AYNI "görünür ama pasif"
          tutarlılığı) - GoogleOAuthProvider boş clientId ile çökmüyor,
          sadece Google'ın kendi script'i kimlik doğrulayamıyor.
          theme="outline" BİLİNÇLİ olarak açık/koyu modda AYNI (beyaz zemin) -
          kullanıcı kararı (2026-09-17): koyu moda özel "filled_black" teması
          denendi ama Google'ın resmi butonu "G" logosunu HER temada sabit
          beyaz bir kare üzerinde gösteriyor (marka kuralı, cross-origin
          iframe olduğu için CSS'le değiştirilemez) - yarı-uyumlu görünüm
          yerine ikisinde de tutarlı beyaz buton tercih edildi. */}
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() =>
            setError(t("Google ile giriş başarısız oldu, tekrar dener misin?", "Google sign-in failed, please try again"))
          }
          theme="outline"
          size="large"
          shape="rectangular"
          text="continue_with"
          width={320}
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="text-xs text-zinc-500">{t("veya", "or")}</span>
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>
    </div>
  );
}
