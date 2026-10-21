"use client";

import Link from "next/link";
import { useT } from "@/lib/language-context";

/** Kişisel bilgi toplanan giriş/kayıt ve şifre sıfırlama sayfalarının altındaki yasal
 * bağlantılar. Washington My Health My Data Act, tüketici sağlık verisi politikasına
 * bağlantıyı ana sayfanın yanında kişisel bilgi toplanan sayfalarda da istiyor
 * (RCW 19.373.010 "homepage", 2026-10-21 ABD yayını). */
export function LegalLinks() {
  const t = useT();
  const cls = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] hover:text-accent hover:underline";
  return (
    <nav
      aria-label={t("Yasal metinler", "Legal")}
      className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
    >
      <Link href="/kvkk" className={cls}>
        {t("Gizlilik ve KVKK", "Privacy & KVKK")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/terms" className={cls}>
        {t("Kullanım Koşulları", "Terms of Service")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/us-health-data" className={cls}>
        {t("ABD Sağlık Verisi Gizlilik Politikası", "Consumer Health Data Privacy Policy")}
      </Link>
    </nav>
  );
}
