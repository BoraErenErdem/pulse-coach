import { Outfit } from "next/font/google";

// Tanıtım sayfası başlıkları (2026-10-07): Outfit 800 - arkadaşın logo yazısına (PulseCoach
// wordmark) en yakın ücretsiz font; 20 aday piksel örtüşmesiyle karşılaştırıldı, harf yapısı
// (yuvarlak C/o, iki katlı a) aynı aile. Önceki: Archivo Expanded. next/font derleme anında
// indirip kendi sunucumuzdan verir; ziyaretçinin tarayıcısı Google'a bağlanmaz (KVKK).
export const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
  variable: "--font-outfit",
  display: "swap",
});
