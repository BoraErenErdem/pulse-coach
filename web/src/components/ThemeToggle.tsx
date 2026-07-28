"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Açık temaya geç" : "Koyu temaya geç"}
      title={isDark ? "Açık temaya geç" : "Koyu temaya geç"}
      className="group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-zinc-50 hover:shadow-md active:translate-y-0 active:scale-90 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-12" />
      )}
    </button>
  );
}
