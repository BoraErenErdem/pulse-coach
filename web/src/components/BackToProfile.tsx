"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/language-context";

/** Profil alt sayfalarının (Ayarlar, Ruh Hali, Bildirimler, Hedef Merkezi) üstündeki geri bağlantısı -
 * mobilde bu ekranlar Profil'in üstüne açılıyor (2026-10-07). */
export function BackToProfile() {
  const t = useT();
  return (
    <Link
      href="/profile"
      className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-[var(--tone-accent)] dark:text-zinc-300"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {t("Profil", "Profile")}
    </Link>
  );
}
