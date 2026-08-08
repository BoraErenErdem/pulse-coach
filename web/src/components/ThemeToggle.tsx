"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const t = useT();
  const isDark = theme === "dark";
  const label = isDark ? t("Açık temaya geç", "Switch to light theme") : t("Koyu temaya geç", "Switch to dark theme");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-zinc-600 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] hover:shadow-md active:translate-y-0 active:scale-90 dark:text-zinc-300"
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-12" />
      )}
    </button>
  );
}
