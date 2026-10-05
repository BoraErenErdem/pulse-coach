import type { PreferredLanguage } from "./api";

// weight/exerciseTarget/quantity gibi ondalık girişli TÜM sayısal form
// alanlarında AYNI "," -> "." dönüştürme kopyası tekrarlanıyordu
// (2026-08-10 mimari borç raporu, bulgu #13) - RN'in bazı klavye/yerel
// kombinasyonlarında (ör. tr-TR) ondalık ayırıcı olarak "," gösterebiliyor
// ama Number() SADECE "." ile ayrıştırabiliyor (canlı testte bulundu,
// bkz. progress.tsx).
export function parseLocaleNumber(text: string): number {
  return Number(text.replace(",", "."));
}

// Grafik eksenleri + fotoğraf/ruh hali geçmişi gibi ekranlarda tarih
// gösterimi HER YERDE aynı "language === 'en' ? 'en-US' : 'tr-TR'" locale
// seçimini kendi kopyasıyla tekrarlıyordu - biçim (day/month/year) çağırana
// özgü kalır, sadece locale seçimi tek yerden.
// RN `textTransform: "uppercase"` yerel ayar bilmiyor: web'de ve iOS'ta
// "Pazartesi" -> "PAZARTESI" (Türkçe İ kaybı, bkz. CLAUDE.md "Turkish
// casing"). Büyük harfli etiketler bununla JS'te büyütülür.
export function toLocaleUpper(text: string, language: PreferredLanguage): string {
  return text.toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR");
}

/** Tam sayı, binlik ayırıcıyla: TR "2.900", EN "2,900". Kalori/gram metinleri
 * her dilde "tr-TR" ile biçimleniyordu - EN'de "2.900 kcal" 2,9 kcal gibi
 * okunuyordu (2026-10-05). Dil AÇIK parametre: global aynadan okuyan ilk sürüm
 * React Compiler'ın önbelleğinde dil değişince eski biçimde kalıyordu. */
export function formatInt(n: number, language: PreferredLanguage): string {
  return Math.round(n).toLocaleString(language === "en" ? "en-US" : "tr-TR");
}

/** En fazla 1 ondalık (84,5 kg / 84.5 kg). */
export function formatDecimal(n: number, language: PreferredLanguage): string {
  return n.toLocaleString(language === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 });
}

/** Yüzde: Türkçede işaret önde ("%68"), İngilizcede sonda ("68%"). EN arayüzde
 * elle yazılmış "%${x}" kalıpları "%0" gösteriyordu (2026-10-05 canlı test). */
export function formatPercent(value: number | string, language: PreferredLanguage): string {
  return language === "en" ? `${value}%` : `%${value}`;
}

export function formatDate(
  isoDate: string,
  language: PreferredLanguage,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(isoDate).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", options);
}
