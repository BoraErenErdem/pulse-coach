import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/Landing";

// Kök adres artık tanıtım sayfası (2026-10-06, Framer sitesinin yerine). Önceden
// /chat ya da /login'e yönlendiriyordu; giriş yapmış kullanıcı şimdi üstteki
// "Uygulamaya git" ile devam eder. Metadata sunucuda kalsın diye sayfa sunucu
// bileşeni, etkileşimli kısım (dil/tema/oturum) Landing'de.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulsecoachapp.com";
const TITLE = "PulseCoach - Yapay zekâ destekli sağlık ve fitness koçu";
const DESCRIPTION =
  "Antrenmanını, öğünlerini, kilonu ve ruh halini tek yerde kaydet. Yapay zekâ koçun verilerine bakar ve sana uygun bir sonraki adımı söyler.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "PulseCoach",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "PulseCoach" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/og.jpg"] },
};

// Telefon tarayıcısının adres çubuğu sayfanın zeminiyle aynı renkte (landing.module.css).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ed" },
    { media: "(prefers-color-scheme: dark)", color: "#10161a" },
  ],
};

// Arama motorları için yapılandırılmış veri. Yalnız doğrulanmış bilgiler: puan/yorum
// gibi alanlar YOK (uydurma olur), iOS uygulaması yayınlanınca operatingSystem'e eklenir.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "PulseCoach",
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      inLanguage: ["tr", "en"],
      image: `${SITE_URL}/landing/og.jpg`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "PulseCoach",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
      email: "destek@pulsecoachapp.com",
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Sabit içerik; yine de Next'in önerdiği gibi "<" kaçırılıyor.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <Landing />
    </>
  );
}
