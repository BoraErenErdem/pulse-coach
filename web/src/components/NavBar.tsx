"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Apple, Bell, Dumbbell, Heart, LogOut, MessageCircle, Target, TrendingUp, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SecondaryButton } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/chat", label: "Sohbet", icon: MessageCircle },
  { href: "/progress", label: "İlerleme", icon: TrendingUp },
  { href: "/workouts", label: "Antrenman", icon: Dumbbell },
  { href: "/nutrition", label: "Beslenme", icon: Apple },
  { href: "/mood", label: "Ruh Hali", icon: Heart },
  { href: "/profile", label: "Profil", icon: User },
  { href: "/goals", label: "Hedefler", icon: Target },
  { href: "/checkins", label: "Check-in'ler", icon: Bell },
];

export function NavBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface)]/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="logo-mark flex items-center gap-1.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            <Activity className="logo-mark-icon h-5 w-5 text-accent" strokeWidth={2.5} />
            PulseCoach
          </span>
          <nav className="flex gap-1">
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
        <div className="flex items-center gap-3">
          {user ? <span className="text-sm text-zinc-500">{user.email}</span> : null}
          <ThemeToggle />
          <SecondaryButton onClick={logout}>
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </SecondaryButton>
        </div>
      </div>
    </header>
  );
}
