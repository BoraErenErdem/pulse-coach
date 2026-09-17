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

// Google/Apple ile giriş (2026-09-16) butonları eklendiğinde CSP
// GÜNCELLENMEMİŞTİ - script-src/connect-src/frame-src'de accounts.google.com
// ve appleid.cdn-apple.com olmadığı için Google Identity Services script'i
// (ve varsa Apple JS SDK'sı) tarayıcı tarafından SESSİZCE engelleniyordu,
// buton için ayrılan yer boş kalıyordu (kod hatasız ama görünmez - canlı
// testte bulundu). GSI hem bir <script> hem kendi widget'ı için bir <iframe>
// yüklüyor, bu yüzden hem script-src hem frame-src gerekiyor; connect-src
// GIS'in arka planda attığı fetch/XHR çağrıları için. GIS ayrıca kendi
// stylesheet'ini (accounts.google.com/gsi/style) enjekte ediyor - style-src'e
// eklenmezse buton script'i yüklenip render de dener ama CSP ihlali console'a
// düşer (e2e/security.spec.ts'teki "CSP ihlali yok" regresyon testi bunu
// yakaladı). Apple'ın appleid.auth.js SDK'sı script-src'de
// appleid.cdn-apple.com'a, giriş popup'ı için ise appleid.apple.com'a
// (frame-src) ihtiyaç duyuyor.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com https://appleid.cdn-apple.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data:",
  `connect-src 'self' https://accounts.google.com${apiBaseUrl ? ` ${apiBaseUrl}` : ""}`,
  "font-src 'self'",
  "frame-src https://accounts.google.com https://appleid.apple.com",
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
