import type { Metadata } from "next";
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

export default function Home() {
  return <Landing />;
}
