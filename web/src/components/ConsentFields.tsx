"use client";

import Link from "next/link";
import { useT } from "@/lib/language-context";
import { Checkbox } from "@/components/ui";

/** Üç zorunlu onay: aydınlatma teyidi (rıza DEĞİL - Kurul 2018/90: aydınlatma ile
 * açık rıza aynı kutuda alınamaz), sağlık verisi açık rızası, Kullanım Koşulları -  - login/page.tsx
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
        {t("'ni okudum ve bilgilendirildim.", " — I have read it and been informed.")}
      </Checkbox>
      <Checkbox id="healthDataConsent" checked={healthDataConsent} onChange={onHealthDataConsentChange}>
        {t(
          "Sağlık verilerimin (antrenman, beslenme, vücut ölçümleri, ruh hâli vb.) ",
          "I give my explicit consent to the processing of my health data (workouts, nutrition, body measurements, mood, etc.) as described in the "
        )}
        <Link href="/kvkk#saglik-verisi" target="_blank" className="text-accent hover:underline">
          {t("Açık Rıza Metni", "Explicit Consent Text")}
        </Link>
        {t("'nde belirtildiği şekilde işlenmesine açık rıza veriyorum.", ".")}
      </Checkbox>
      <Checkbox id="termsConsent" checked={termsConsent} onChange={onTermsConsentChange}>
        {t("18 yaşından büyüğüm; ", "I am 18 or older and I accept the ")}
        <Link href="/terms" target="_blank" className="text-accent hover:underline">
          {t("Kullanım Koşulları", "Terms of Service")}
        </Link>
        {t(
          "'nı (yapay zekâ koçun tıbbi tavsiye yerine geçmediği dahil) okudum ve kabul ediyorum.",
          ", including that the AI coach does not replace medical advice."
        )}
      </Checkbox>
    </div>
  );
}
