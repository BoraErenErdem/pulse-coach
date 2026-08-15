import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
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
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
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
