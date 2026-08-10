// api.ts (düz modül, React hook'u yok - useT() içinde çağrılamaz) hata
// mesajlarını doğru dilde fırlatabilmek için kullanıcının o anki dil
// tercihini SENKRON okuyabilmeli. language-context.tsx zaten api.ts'den
// fonksiyon import ediyor (getProfile/updateProfile), bu yüzden api.ts
// oradan DOĞRUDAN import edemez (döngüsel bağımlılık olurdu) - bu küçük,
// bağımsız modül ortak zemin: LanguageProvider her değiştiğinde burayı
// günceller, api.ts senkron okur (2026-08-10 pürüz taraması, Tema C).
export type PreferredLanguage = "tr" | "en";

export const LANGUAGE_STORAGE_KEY = "pulsecoach_language";

let currentLanguage: PreferredLanguage = "tr";

export function getCurrentLanguage(): PreferredLanguage {
  return currentLanguage;
}

export function setCurrentLanguage(lang: PreferredLanguage): void {
  currentLanguage = lang;
}
