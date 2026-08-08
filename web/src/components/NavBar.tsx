"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Apple,
  Bell,
  Dumbbell,
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  Target,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { SecondaryButton } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export function NavBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useT();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const NAV_ITEMS = [
    { href: "/chat", label: t("Sohbet", "Chat"), icon: MessageCircle },
    { href: "/progress", label: t("İlerleme", "Progress"), icon: TrendingUp },
    { href: "/workouts", label: t("Antrenman", "Workouts"), icon: Dumbbell },
    { href: "/nutrition", label: t("Beslenme", "Nutrition"), icon: Apple },
    { href: "/mood", label: t("Ruh Hali", "Mood"), icon: Heart },
    { href: "/profile", label: t("Profil", "Profile"), icon: User },
    { href: "/goals", label: t("Hedefler", "Goals"), icon: Target },
    { href: "/checkins", label: t("Check-in'ler", "Check-ins"), icon: Bell },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--surface)]/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="logo-mark flex shrink-0 items-center gap-1.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            <Activity className="logo-mark-icon h-5 w-5 text-accent" strokeWidth={2.5} />
            PulseCoach
          </span>
          {/* Masaüstü nav — md ve üzeri genişlikte görünür */}
          <nav className="hidden gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                    active
                      ? "bg-accent text-white"
                      : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
                  }`}
                >
                  <Icon className="h-4 w-4 transition-transform duration-200 ease-out group-hover:scale-110" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {user ? <span className="text-sm text-zinc-500">{user.email}</span> : null}
          <ThemeToggle />
          <SecondaryButton onClick={logout}>
            <LogOut className="h-4 w-4" />
            {t("Çıkış Yap", "Log Out")}
          </SecondaryButton>
        </div>
        {/* Mobil: hamburger düğmesi — md altında görünür */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? t("Menüyü kapat", "Close menu") : t("Menüyü aç", "Open menu")}
            aria-expanded={isMenuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-zinc-600 transition-colors hover:bg-[var(--surface-muted)] dark:text-zinc-300"
          >
            {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobil açılır menü */}
      {isMenuOpen ? (
        <div className="animate-fade-in-up border-t border-[var(--border-subtle)] px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
            {user ? <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{user.email}</span> : null}
            <SecondaryButton
              onClick={() => {
                setIsMenuOpen(false);
                logout();
              }}
              className="shrink-0"
            >
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </SecondaryButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
