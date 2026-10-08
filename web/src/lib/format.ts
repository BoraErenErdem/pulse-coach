import type { PreferredLanguage } from "./api";

// mobile/lib/format.ts'in karşılığı (2026-10-08): sayı/yüzde biçimi dil parametresiyle.

/** Tam sayı, binlik ayırıcıyla: TR "2.900", EN "2,900". */
export function formatInt(n: number, language: PreferredLanguage): string {
  return Math.round(n).toLocaleString(language === "en" ? "en-US" : "tr-TR");
}

/** En fazla 1 ondalık (84,5 kg / 84.5 kg). */
export function formatDecimal(n: number, language: PreferredLanguage): string {
  return n.toLocaleString(language === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 });
}

/** Yüzde: Türkçede işaret önde ("%68"), İngilizcede sonda ("68%"). */
export function formatPercent(value: number | string, language: PreferredLanguage): string {
  return language === "en" ? `${value}%` : `%${value}`;
}

/** Yerel ayarlı büyük harf (CSS uppercase Türkçe "i"yi "I" yapar). */
export function toLocaleUpper(text: string, language: PreferredLanguage): string {
  return text.toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR");
}

/** Göreli gün (mobil profile-cards.tsx::relativeDay): "Bugün 19:00", "Dün 18:02", "3 gün önce", "29 Eylül". */
export function relativeDay(iso: string, language: PreferredLanguage, t: (tr: string, en: string) => string): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const date = new Date(iso);
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  const loc = language === "en" ? "en-US" : "tr-TR";
  const time = date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return t(`Bugün ${time}`, `Today ${time}`);
  if (days === 1) return t(`Dün ${time}`, `Yesterday ${time}`);
  if (days < 7) return t(`${days} gün önce`, `${days} days ago`);
  return date.toLocaleDateString(loc, { day: "numeric", month: "long" });
}
