"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { useUnreadCheckins } from "@/lib/use-unread-checkins";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { NavIcon, type NavIconName } from "@/components/NavIcons";

// Gezinme mobil uygulamayla aynı (2026-10-07): 5 ana sekme (Sohbet, İlerleme, Antrenman,
// Beslenme, Profil), her biri kendi kimlik renginde. Ruh Hali, Hedefler ve Bildirimler
// mobildeki gibi Profil'in altında (Profil menüsü + üstteki zil). Telefonda alt sekme çubuğu
// (BottomTabBar), lg ve üstünde üst menü. Önceki hamburger menü kaldırıldı.

interface Tab {
  href: string;
  icon: NavIconName;
  label: [string, string];
  /** Etkin sekme rengi: açık / koyu (mobil (tabs)/_layout.tsx::useTabActiveColors). */
  activeClass: string;
  /** Bu sekmenin altındaki diğer rotalar. */
  also?: string[];
}

const TABS: Tab[] = [
  { href: "/chat", icon: "chat", label: ["Sohbet", "Chat"], activeClass: "text-[#0077B6] dark:text-[#38BDF8]" },
  { href: "/progress", icon: "progress", label: ["İlerleme", "Progress"], activeClass: "text-[#E8630A] dark:text-[#FF8A3D]" },
  { href: "/workouts", icon: "workouts", label: ["Antrenman", "Workouts"], activeClass: "text-[#D9251C] dark:text-[#FF453A]" },
  { href: "/nutrition", icon: "nutrition", label: ["Beslenme", "Nutrition"], activeClass: "text-[#646B00] dark:text-[#CCD638]" },
  {
    href: "/profile",
    icon: "profile",
    label: ["Profil", "Profile"],
    activeClass: "text-[#7A3FC4] dark:text-[#C4A0FF]",
    also: ["/goals", "/mood", "/checkins"],
  },
];

function isActive(tab: Tab, pathname: string): boolean {
  return [tab.href, ...(tab.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const t = useT();
  const unread = useUnreadCheckins();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--background)]/75 backdrop-blur-md dark:border-white/10 dark:bg-[#10161a]/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/chat" className="shrink-0" aria-label="PulseCoach">
          <BrandLogo height={26} className="text-zinc-900 dark:text-zinc-50" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label={t("Ana menü", "Main menu")}>
          {TABS.map((tab) => {
            const active = isActive(tab, pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? `${tab.activeClass} border-current/40 bg-current/10`
                    : "border-transparent text-zinc-600 hover:bg-[var(--surface-muted)] hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-zinc-50"
                }`}
              >
                <NavIcon name={tab.icon} size={20} />
                {t(...tab.label)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/checkins"
            aria-label={t("Bildirimler", "Notifications")}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-[var(--surface-muted)] dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Bell className="h-5 w-5" />
            <UnreadBadge count={unread} />
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            aria-label={t("Çıkış Yap", "Log Out")}
            title={t("Çıkış Yap", "Log Out")}
            className="hidden h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-[var(--surface-muted)] lg:inline-flex dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Telefonda yüzen alt sekme çubuğu - mobil (tabs)/_layout.tsx: hap biçimi, 60px, etkin
 * sekmede kimlik renginde 46px halka. lg ve üstünde gizli (üst menü var). */
export function BottomTabBar() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav
      aria-label={t("Ana menü", "Main menu")}
      className="fixed inset-x-5 bottom-3 z-30 mx-auto flex h-[60px] max-w-md items-center justify-around rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[0_4px_16px_rgba(0,0,0,0.15)] lg:hidden dark:border-white/10 dark:bg-[#1e1b19]"
    >
      {TABS.map((tab) => {
        const active = isActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={t(...tab.label)}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-full border transition-colors ${
              active ? `${tab.activeClass} border-current/45 bg-current/15` : "border-transparent text-zinc-500 dark:text-white/60"
            }`}
          >
            <NavIcon name={tab.icon} size={24} />
          </Link>
        );
      })}
    </nav>
  );
}
