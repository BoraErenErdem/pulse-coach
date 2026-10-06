"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/language-context";

// KVKK/Koşullar'a tanıtım sayfasından, kayıt formundan ya da Profil'den gelinir (2026-10-06):
// sabit /login yerine geldiği yere döner. Yeni sekmede açıldıysa (geçmiş yok) ana sayfaya gider.
export function BackLink() {
  const router = useRouter();
  const t = useT();
  return (
    <Link
      href="/"
      onClick={(event) => {
        if (window.history.length > 1) {
          event.preventDefault();
          router.back();
        }
      }}
      className="flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 hover:text-accent"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("Geri", "Back")}
    </Link>
  );
}
