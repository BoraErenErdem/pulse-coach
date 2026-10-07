import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { ProfileProvider } from "@/lib/profile-context";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('pulsecoach_theme');var isDark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.toggle('dark',isDark);c.toggle('light',!isDark);}catch(e){}})();`;

// Redesign (2026-08-15): gövde/arayüz metni Inter (TR karakter desteği tam,
// veri-yoğun UI için yüksek okunabilirlik) - Fraunces SADECE büyük punto
// (karşılama başlığı + StatTile rakamları, bkz. globals.css .font-display) -
// `opsz` ekseni sayesinde küçük boyutta kullanılmadığı sürece performans/
// okunabilirlik kaygısı yok. `latin-ext` alt kümesi TR karakterleri (ğ, ş, ı,
// İ, ö, ü, ç) kapsıyor - canlı testte ayrıca doğrulanacak.
// preload: false (2026-10-07, Lighthouse): kök layout'taki her font HER sayfada
// yüksek öncelikle önyükleniyordu; tanıtım sayfası Fraunces/Geist Mono'yu hiç
// kullanmadığı halde ~250 KB font hero görselinin önüne geçiyordu (mobil LCP 5,7 s).
// Önyüklenmeyen font yine de kullanıldığı ilk sayfada iner. SOFT/WONK eksenleri
// hiç kullanılmıyordu (yalnız .font-display'in opsz'i), dosyayı büyütüyordu.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

// Yalnız sohbetteki kod blokları (Tailwind font-mono) için.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "PulseCoach",
  description: "Sağlık ve fitness koçluk asistanı",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Tema sınıfı ilk boyamadan ÖNCE (2026-10-07): next/script beforeInteractive bunu
            self.__next_s kuyruğuna koyuyordu, Next çalışma zamanı yüklenince çalışıyordu -
            koyu tercihli kullanıcı sayfayı bir an açık temada görüyordu (ve tanıtım sayfası
            açık tema ekran görüntülerini de indiriyordu). Engelleyici satır içi script. */}
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {/* GoogleOAuthProvider burada DEĞİL, OAuthButtons içinde (2026-10-07):
              sağlayıcı Google'ın GSI script'ini bağlandığı her sayfada yüklüyor,
              kökte olunca tanıtım sayfası dahil her ziyaretçinin tarayıcısı
              accounts.google.com'a gidiyordu (Lighthouse'ta 80 KB kullanılmayan JS). */}
          <AuthProvider>
            <ProfileProvider>
              <LanguageProvider>{children}</LanguageProvider>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
