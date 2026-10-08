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
