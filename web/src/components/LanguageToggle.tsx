"use client";

import type { PreferredLanguage } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";

const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "TR",
  en: "EN",
};

/** Kompakt TR/EN geçişi - ThemeToggle'ın yanında (login/register ekranı gibi
 * giriş yapılmamış sayfalarda) veya başka bir yerde kullanılabilir. Profil
 * sayfasındaki tam-etiketli ("Türkçe"/"English") sürümden farklı olarak
 * burada yer kısıtlı olduğu için kısaltma (TR/EN) kullanılıyor - davranış
 * aynı: useLanguage().setLanguage, giriş yapılmamışsa sadece yerel/tarayıcı
 * varsayılanını değiştirir, backend'e bir şey yazmaz (bkz. language-context.tsx). */
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1">
      {(Object.keys(LANGUAGE_LABELS) as PreferredLanguage[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={language === lang}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            language === lang
              ? "bg-[var(--accent)] text-white"
              : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
          }`}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
