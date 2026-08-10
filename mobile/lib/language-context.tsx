import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "./auth-context";
import type { PreferredLanguage } from "./api";
import { setCurrentLanguage } from "./language-storage";
import { useProfile } from "./profile-context";

// web/src/lib/language-context.tsx'in mobil portu - aynı desen, localStorage
// yerine expo-secure-store, navigator.language yerine expo-localization.
//
// Faz 1 (2026-08-08): egzersiz/beslenme katalog kutucuklarının gösterim
// dilini etkiliyordu (bkz. catalogDisplayName). Faz 2 (2026-08-08): AYNI
// tercih artık TÜM arayüz metinlerini de kapsıyor (bkz. useT). Sohbetteki
// AI koç bundan HÂLÂ etkilenmiyor (Faz 3'ün kapsamı, henüz yapılmadı).
const LANGUAGE_STORAGE_KEY = "pulsecoach_language";

interface LanguageContextValue {
  language: PreferredLanguage;
  setLanguage: (lang: PreferredLanguage) => void;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectDeviceLanguage(): PreferredLanguage {
  const locales = Localization.getLocales();
  return locales[0]?.languageCode === "en" ? "en" : "tr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  // ProfileProvider (bkz. _layout.tsx - bu provider'ın DIŞINDA sarılı) zaten
  // profili token değişince fetch ediyor - burada AYRICA fetch etmiyoruz,
  // sadece onun sonucunu dinliyoruz (2026-08-10 mimari borç raporu, bulgu
  // #7 - önceden bu context KENDİ getProfile çağrısını yapıyordu).
  const { profile, isLoading: isProfileLoading, updateProfile } = useProfile();
  const [language, setLanguageState] = useState<PreferredLanguage>("tr");
  const [isLoading, setIsLoading] = useState(true);
  // web/src/lib/language-context.tsx'teki aynı düzeltme - canlı testte
  // bulundu (2026-08-08): profil senkronizasyonu tamamlanmadan kullanıcı
  // elle dil değiştirirse, gecikmeli cevap seçimi sessizce eziyordu.
  const hasUserOverriddenRef = useRef(false);

  // api.ts (düz modül, hook kullanamıyor) hata mesajlarını doğru dilde
  // fırlatabilmek için senkron bir aynaya ihtiyaç duyuyor - bkz.
  // language-storage.ts (2026-08-10 pürüz taraması, Tema C). Bu context
  // dili her değiştirdiğinde aynayı da güncelliyoruz.
  function applyLanguage(lang: PreferredLanguage) {
    setLanguageState(lang);
    setCurrentLanguage(lang);
  }

  useEffect(() => {
    if (token) return;
    let cancelled = false;
    async function restoreLocalDefault() {
      // Giriş yapılmamışken (login ekranı) sadece cihaz dilinden/daha önce
      // bu cihazda seçilmiş yerel bir tercihten bir varsayılan gösterilir -
      // backend'e hiçbir şey yazılmaz.
      const stored = (await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY)) as PreferredLanguage | null;
      if (!cancelled) {
        applyLanguage(stored ?? detectDeviceLanguage());
        setIsLoading(false);
      }
    }
    restoreLocalDefault();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    function syncFromSharedProfile() {
      if (!token) return;
      // Giriş yapılınca profildeki KALICI tercih (varsa, cihazlar arası
      // senkron) yerel/cihaz varsayılanının önüne geçer - ProfileProvider
      // henüz yüklüyorsa bekleriz, profil çekilemediyse (ör. ağ hatası)
      // yerel/cihaz varsayılanında kalınır.
      if (isProfileLoading) {
        setIsLoading(true);
        return;
      }
      if (profile && !hasUserOverriddenRef.current) {
        applyLanguage(profile.preferred_language);
      }
      setIsLoading(false);
    }
    syncFromSharedProfile();
  }, [token, profile, isProfileLoading]);

  const setLanguage = useCallback(
    (lang: PreferredLanguage) => {
      hasUserOverriddenRef.current = true;
      applyLanguage(lang);
      SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
      if (token) {
        updateProfile({ preferred_language: lang }).catch(() => {
          // Sunucuya yazma başarısız olsa da yerel state güncel kalır - UX
          // bloklanmaz, sonraki bir profil çekişinde eski değer geri
          // gelebilir (nadir, ağ hatası durumu).
        });
      }
    },
    [token, updateProfile]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

/** web/src/lib/language-context.tsx::useT'nin mobil portu - aynı
 * `t("Kaydet", "Save")` deseni, ayrı bir anahtar/sözlük dosyası yok. */
export function useT(): (tr: string, en: string) => string {
  const { language } = useLanguage();
  return useCallback((tr: string, en: string) => (language === "en" ? en : tr), [language]);
}

/** Katalog satırının (egzersiz/besin, ikisi de name_tr+name_en taşıyor)
 * kullanıcının dil tercihine göre gösterilecek ismini döner. */
export function catalogDisplayName(
  item: { name_tr: string; name_en: string },
  language: PreferredLanguage
): string {
  return language === "en" ? item.name_en : item.name_tr;
}
