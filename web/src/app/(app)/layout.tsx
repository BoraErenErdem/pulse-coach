"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BottomTabBar, NavBar } from "@/components/NavBar";
import { toneForPath } from "@/lib/identity";
import { LoadingState } from "@/components/ui";

// Masaüstünde iki sütunlu sayfalar geniş (2026-10-07); tek sütunlu sayfalar (sohbet, ayarlar,
// bildirimler...) okunur genişlikte kalır.
const WIDE_PATHS = new Set(["/progress", "/workouts", "/nutrition", "/profile", "/mood", "/goals"]);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!token) router.replace("/login");
  }, [isLoading, token, router]);

  if (isLoading || !token) {
    return <LoadingState />;
  }

  // Mobil tasarım dili (2026-10-07): sayfa tonu rotadan (koyu modda üst parıltı, panel
  // rampası, koç kartı ve birincil düğme rengi - bkz. globals.css [data-tone]). Açık tema düz
  // krem. Telefonda alt sekme çubuğu içeriğin üstüne biniyor: altta 7rem boşluk.
  return (
    <div data-tone={toneForPath(pathname)} className="relative flex flex-1 flex-col">
      <div className="pc-glow" aria-hidden="true" />
      <NavBar />
      <main className={`relative mx-auto flex w-full ${WIDE_PATHS.has(pathname) ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl"} flex-1 flex-col px-4 pb-28 pt-6 lg:pb-12 lg:pt-8`}>
        <div key={pathname} className="animate-fade-in-up flex flex-1 flex-col">
          {children}
        </div>
      </main>
      <BottomTabBar />
    </div>
  );
}
