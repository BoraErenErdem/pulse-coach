"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from "@react-oauth/google";
import { ApiError, googleAuth, type OAuthResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { ErrorBanner } from "@/components/ui";

// Google Cloud Console'da (bkz. mobile/lib/api.ts::OAuthResult'taki AYNI
// not) platform başına ayrı client ID oluşturuluyor - web tarafı için TEK
// bir değer yeterli. GoogleOAuthProvider yalnız bu bileşeni sarıyor (önceden
// layout.tsx'teydi): GSI script'i yalnız giriş düğmesinin olduğu sayfada yüklenir.
// Client ID henüz yoksa boş string geçiliyor - GoogleLogin çökmüyor, sadece
// Google'ın script'i kimlik doğrulayamıyor.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

/** Giriş/Kayıt sayfasındaki Google düğmesi (2026-09-16) -
 * mobile/components/oauth-buttons.tsx'in web karşılığı, AYNI backend
 * uç noktalarını (googleAuth/completeOAuth) kullanıyor. Backend
 * "logged_in" dönerse applyTokens ile doğrudan oturum açılıyor;
 * "consent_required" dönerse (Google ile İLK KEZ giriş) /oauth-consent
 * sayfasına yönlendirilip KVKK/sağlık verisi/Kullanım Koşulları onayı
 * alınıyor - register formunun üç onay checkbox'ı ATLANMIYOR.
 * Web'de Apple ile giriş YOK (kullanıcı kararı 2026-10-12): ayrı bir Service ID
 * ve alan adı doğrulaması gerektiriyordu; Apple ile giriş yalnız iOS uygulamasında.
 * Apple ile açılmış bir hesap web'e "Şifremi unuttum" ile şifre belirleyerek girer. */
export function OAuthButtons() {
  const { applyTokens } = useAuth();
  const router = useRouter();
  const t = useT();
  const { language } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  // Google düğmesinin genişliği piksel olarak verilmek zorunda (iframe, 200-400). Sabit 320
  // telefonda kartın iç kenarından taşıyordu (2026-10-20): kutunun kendi genişliği kullanılır.
  const buttonBoxRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState(320);
  useEffect(() => {
    const el = buttonBoxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const next = Math.max(200, Math.min(400, Math.floor(el.clientWidth)));
      setButtonWidth((current) => (current === next ? current : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  return (
    <div className="space-y-3">
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
      <div ref={buttonBoxRef} className="flex justify-center">
        {/* locale: düğme metni tarayıcı diline göre geliyordu; sağlayıcı bunu düğmenin
            renderButton çağrısına iletir. key: dil değişince düğme yeni dille yeniden çizilir. */}
        <GoogleOAuthProvider key={language} clientId={GOOGLE_CLIENT_ID} locale={language}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() =>
              setError(t("Google ile giriş başarısız oldu, tekrar dener misin?", "Google sign-in failed, please try again"))
            }
            theme="outline"
            size="large"
            shape="rectangular"
            text="continue_with"
            width={buttonWidth}
          />
        </GoogleOAuthProvider>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="h-px bg-[var(--border-subtle)]" />
    </div>
  );
}
