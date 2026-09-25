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

export function formatDate(
  isoDate: string,
  language: PreferredLanguage,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(isoDate).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", options);
}
