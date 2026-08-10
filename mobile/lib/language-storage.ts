// web/src/lib/language-storage.ts'in mobil portu - aynı gerekçe: api.ts
// (düz modül, hook yok) hata mesajlarını doğru dilde fırlatabilmek için
// kullanıcının o anki dil tercihini SENKRON okuyabilmeli. expo-secure-store
// SADECE async API sunuyor (getItemAsync), bu yüzden gerçek kalıcı depolama
// hâlâ language-context.tsx'te SecureStore ile yapılıyor - bu modül sadece
// senkron okunabilen bir bellek-içi ayna tutuyor (2026-08-10 pürüz
// taraması, Tema C).
export type PreferredLanguage = "tr" | "en";

export const LANGUAGE_STORAGE_KEY = "pulsecoach_language";

let currentLanguage: PreferredLanguage = "tr";

export function getCurrentLanguage(): PreferredLanguage {
  return currentLanguage;
}

export function setCurrentLanguage(lang: PreferredLanguage): void {
  currentLanguage = lang;
}
