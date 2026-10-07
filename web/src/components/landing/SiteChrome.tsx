"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

// Herkese açık sayfaların ortak üst çubuğu ve alt bilgisi (2026-10-07): tanıtım sayfasından
// ayrıldı ki Gizlilik/KVKK ve Kullanım Koşulları da aynı görünsün. Renkler landing.module.css
// `.root` tokenlarından (--l-*): çağıran o sınıfın içinde olmalı.

export const REGISTER_HREF = "/login?mode=register";
export const CONTACT_EMAIL = "destek@pulsecoachapp.com";

/** `anchorBase`: tanıtım sayfasında "" (aynı sayfadaki bölümler), diğer sayfalarda "/". */
export function SiteHeader({ anchorBase = "" }: { anchorBase?: "" | "/" }) {
  const t = useT();
  const { token } = useAuth();
  const startHref = token ? "/chat" : REGISTER_HREF;
  const navLinks = [
    { href: `${anchorBase}#ozellikler`, label: t("Özellikler", "Features") },
    { href: `${anchorBase}#nasil`, label: t("Nasıl çalışır", "How it works") },
    { href: `${anchorBase}#gizlilik`, label: t("Gizlilik", "Privacy") },
    { href: `${anchorBase}#sss`, label: t("SSS", "FAQ") },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--l-line)] bg-[var(--l-bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="PulseCoach">
          <BrandLogo height={28} markClassName="text-[var(--l-accent)]" />
        </Link>
        <nav className="ml-6 hidden items-center gap-6 text-sm text-[var(--l-muted)] lg:flex" aria-label={t("Sayfa bölümleri", "Page sections")}>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[var(--l-ink)]">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          {/* Telefonda tek düğmeye yer var: geri dönen kullanıcı için "Giriş yap"
              (yeni kullanıcıyı hero'daki büyük düğme kayda götürür). */}
          {!token ? (
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full border border-[var(--l-line)] px-4 text-sm font-semibold sm:border-0 sm:px-3">
              {t("Giriş yap", "Log in")}
            </Link>
          ) : null}
          <Link
            href={startHref}
            className={`${token ? "inline-flex" : "hidden sm:inline-flex"} min-h-11 items-center rounded-full bg-[var(--l-ink)] px-4 text-sm font-semibold text-[var(--l-bg)] transition-opacity hover:opacity-90`}
          >
            {token ? t("Uygulamaya git", "Go to the app") : t("Web'de başla", "Start on the web")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-[var(--l-line)] bg-[var(--l-card)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-sm">
          <BrandLogo height={24} markClassName="text-[var(--l-accent)]" />
          <p className="mt-3 text-sm leading-relaxed text-[var(--l-muted)]">
            {t(
              "Yapay zekâ destekli sağlık ve fitness koçu. PulseCoach tıbbi tavsiye yerine geçmez.",
              "An AI-powered health and fitness coach. PulseCoach does not replace medical advice."
            )}
          </p>
        </div>
        <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-8" aria-label={t("Alt bilgi", "Footer")}>
          <Link href="/kvkk" className="min-h-11 content-center hover:underline">
            {t("Gizlilik ve KVKK", "Privacy and KVKK")}
          </Link>
          <Link href="/terms" className="min-h-11 content-center hover:underline">
            {t("Kullanım Koşulları", "Terms of Service")}
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="min-h-11 content-center hover:underline">
            {CONTACT_EMAIL}
          </a>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-[var(--l-muted)] sm:px-6">© 2026 PulseCoach</p>
      <div className="flex justify-center gap-2 pb-8 sm:hidden">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </footer>
  );
}
