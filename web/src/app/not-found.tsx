"use client";

import Link from "next/link";
import { BrandBadge } from "@/components/BrandLogo";
import { useT } from "@/lib/language-context";

// Eşleşmeyen her adres (ör. /register) için: önceden Next'in İngilizce, stilsiz
// varsayılan 404'ü çıkıyordu (canlı test 2026-10-06). "/" tanıtım sayfası; girişli
// kullanıcı oradan "Uygulamaya git" ile devam eder (bkz. app/page.tsx).
export default function NotFound() {
  const t = useT();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <BrandBadge className="mb-4" />
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t("Sayfa bulunamadı", "Page not found")}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {t("Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.", "The page you're looking for may have moved or never existed.")}
        </p>
        <Link
          href="/"
          className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("Ana sayfaya dön", "Back to home")}
        </Link>
      </div>
    </div>
  );
}
