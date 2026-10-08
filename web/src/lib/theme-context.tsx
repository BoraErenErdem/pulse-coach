"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
/** Mobil theme-context ThemePreference (2026-10-08): "system" = işletim sisteminin ayarını izle. */
export type ThemePreference = "system" | Theme;

const THEME_STORAGE_KEY = "pulsecoach_theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

const systemTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Saklı tercih yoksa (= sistem) <head>'deki betik zaten sistem temasını uyguladı; burada durum
  // eşitlenir ve sistem teması değişince (ör. akşam otomatik koyu) izlenir.
  useEffect(() => {
    function restore() {
      const pref = readStored();
      const initial = pref === "system" ? systemTheme() : pref;
      setPreferenceState(pref);
      setTheme(initial);
      applyThemeClass(initial);
    }
    restore();
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = systemTheme();
      setTheme(next);
      applyThemeClass(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  function setPreference(next: ThemePreference) {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // gizli pencere vb.: yalnız bu oturumda geçerli
    }
    const applied = next === "system" ? systemTheme() : next;
    setPreferenceState(next);
    setTheme(applied);
    applyThemeClass(applied);
  }

  function toggleTheme() {
    setPreference(theme === "dark" ? "light" : "dark");
  }

  return <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
