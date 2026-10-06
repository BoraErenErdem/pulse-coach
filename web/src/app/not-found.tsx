"use client";

import Link from "next/link";
import { PulseMark } from "@/components/PulseMark";
import { useT } from "@/lib/language-context";

// Eşleşmeyen her adres (ör. /register) için: önceden Next'in İngilizce, stilsiz
// varsayılan 404'ü çıkıyordu (canlı test 2026-10-06). "/" girişliyse sohbete,
// değilse giriş ekranına yönlendirir (bkz. app/page.tsx).
export default function NotFound() {
  const t = useT();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
          <PulseMark size={38} className="text-accent" />
        </div>
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
