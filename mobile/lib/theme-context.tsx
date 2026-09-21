import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import * as SecureStore from "@/lib/storage";

// web/src/lib/theme-context.tsx'in mobil portu - aynı desen (ikili tema,
// ilk açılışta OS tercihi, sonrasında kullanıcının elle seçimi kalıcı) -
// localStorage yerine expo-secure-store, matchMedia yerine Appearance API.
// Redesign turu (2026-08-15): mobilde daha önce HİÇ tema sistemi yoktu -
// components/ui.tsx'in bilinçli olarak minimal bırakılmış hali buna işaret
// ediyordu (bkz. proje belleği).
export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "pulsecoach_theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  /** Provider henüz kayıtlı tercihi/OS varsayılanını yüklerken kısa bir an
   * true - ana _layout.tsx splash ekranını bu süre boyunca açık tutuyor ki
   * "önce açık sonra koyu" yanıp sönmesi olmasın (web'deki THEME_INIT_SCRIPT
   * ile aynı amaç, RN'de senkron bir <head> script'i yok). */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restoreTheme() {
      const stored = (await SecureStore.getItemAsync(THEME_STORAGE_KEY)) as Theme | null;
      const initial: Theme = stored ?? (Appearance.getColorScheme() === "dark" ? "dark" : "light");
      if (!cancelled) {
        setTheme(initial);
        setIsLoading(false);
      }
    }
    restoreTheme();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  // Perf bulgusu (2026-09-21) - bkz. auth-context.tsx'teki AYNI not. Bu
  // Provider EN kritik olanı çünkü `useThemeColors`/`useTheme` neredeyse
  // HER bileşende kullanılıyor - memoize edilmemiş değer, teoride tema HİÇ
  // değişmese bile ThemeProvider'ın kendi başka bir nedenle re-render
  // olduğu her an tüm ağacı gereksiz yeniden render edebilirdi.
  const value = useMemo(() => ({ theme, toggleTheme, isLoading }), [theme, toggleTheme, isLoading]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
