"use client";

import Link from "next/link";
import { useT } from "@/lib/language-context";
import { Checkbox } from "@/components/ui";

/** Üç zorunlu KVKK/sağlık verisi/Kullanım Koşulları onayı - login/page.tsx
 * (register modu) ve oauth-consent/page.tsx (Google/Apple ile YENİ kayıt)
 * arasında BİREBİR aynı metin/link gerekiyordu (2026-09-16, ikinci
 * kopyalama noktası eklenirken tek yere çıkarıldı - mobile/components/
 * auth-ui.tsx::AuthConsentGroup ile AYNI gerekçe/desen). */
export function ConsentFields({
  kvkkConsent,
  onKvkkConsentChange,
  healthDataConsent,
  onHealthDataConsentChange,
  termsConsent,
  onTermsConsentChange,
}: {
  kvkkConsent: boolean;
  onKvkkConsentChange: (next: boolean) => void;
  healthDataConsent: boolean;
  onHealthDataConsentChange: (next: boolean) => void;
  termsConsent: boolean;
  onTermsConsentChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
      <Checkbox id="kvkkConsent" checked={kvkkConsent} onChange={onKvkkConsentChange}>
        <Link href="/kvkk#aydinlatma" target="_blank" className="text-accent hover:underline">
          {t("Aydınlatma Metni", "Privacy Notice")}
        </Link>
        {t(
          "'ni okudum, anladım ve kişisel verilerimin KVKK kapsamında işlenmesine ",
          " — I've read and understood it, and I consent to my personal data being processed under KVKK as described "
        )}
        <Link href="/kvkk#acik-riza" target="_blank" className="text-accent hover:underline">
          {t("açık rıza", "here")}
        </Link>
        {t(" veriyorum.", ".")}
      </Checkbox>
      <Checkbox id="healthDataConsent" checked={healthDataConsent} onChange={onHealthDataConsentChange}>
        {t(
          "Sağlık verilerimin (antrenman, beslenme, ruh hâli, vücut ölçümleri vb.) PulseCoach tarafından işlenmesine ",
          "I consent to my health data (workouts, nutrition, mood, body measurements, etc.) being processed by PulseCoach as described in the "
        )}
        <Link href="/kvkk#saglik-verisi" target="_blank" className="text-accent hover:underline">
          {t("açık rıza metninde belirtildiği şekilde", "health data consent text")}
        </Link>
        {t(" veriyorum.", ".")}
      </Checkbox>
      <Checkbox id="termsConsent" checked={termsConsent} onChange={onTermsConsentChange}>
        <Link href="/terms" target="_blank" className="text-accent hover:underline">
          {t("Kullanım Koşulları", "Terms of Service")}
        </Link>
        {t(
          "'nı okudum, anladım ve kabul ediyorum; bu, yapay zekâ koçun tıbbi tavsiye yerine geçmediğini de kapsar.",
          " — I've read, understood, and agree to it, including that the AI coach does not replace medical advice."
        )}
      </Checkbox>
    </div>
  );
}
