import type { NextConfig } from "next";

// 2026-08-26 güvenlik denetimi: önceden hiçbir güvenlik header'ı set
// edilmiyordu. script-src için ÖNCE sha256 hash tabanlı bir yaklaşım
// denendi (layout.tsx'teki THEME_INIT_SCRIPT'in içeriğine göre) ama Next.js
// (Turbopack) hydration için KENDİ ürettiği birden fazla inline script daha
// enjekte ediyor (RSC payload/self.__next_f.push chunk'ları, her build/sayfada
// FARKLI hash) - tek bir script'i hash'lemek yeterli olmadı, sonuç: TÜM
// client-side hydration bloke oldu (canlı Playwright testinde yakalandı -
// /chat gibi korumalı sayfalarda /login'e client-side yönlendirme hiç
// çalışmadı). Nonce tabanlı CSP (Next'in resmi önerdiği asıl "sıkı" çözüm)
// TÜM sayfaları dynamic rendering'e zorluyor (statik üretim/CDN cache'i
// kaybedilir) - bu uygulamanın ölçeğinde bu maliyete değmiyor. Bunun yerine
// Next'in kendi "nonce'suz" resmi CSP kalıbı kullanılıyor (bkz.
// node_modules/next/dist/docs/.../content-security-policy.md, "Without
// Nonces" bölümü): script/style için 'unsafe-inline', ama connect-src/
// img-src/frame-ancestors/base-uri/form-action YİNE DE gerçek kısıtlamalar -
// dış script kaynağı enjeksiyonu, clickjacking (frame-ancestors) ve
// backend'den başka bir yere veri sızıntısı (connect-src) hâlâ engelleniyor.
// React geliştirme modunda hata call-stack'lerini yeniden oluşturmak için
// eval() kullanıyor (Next'in kendi dokümantasyonundaki AYNI not) - prod'da
// hiç kullanılmıyor, bu yüzden 'unsafe-eval' SADECE dev'de ekleniyor.
// Regresyon: bu satır olmadan `next dev`'de "eval() is not supported"
// konsol hatası + React debug özellikleri bozuluyordu (canlı testte
// yakalandı).
const isDev = process.env.NODE_ENV === "development";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self'${apiBaseUrl ? ` ${apiBaseUrl}` : ""}`,
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
