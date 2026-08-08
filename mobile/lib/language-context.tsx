import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "./auth-context";
import { getProfile, updateProfile, type PreferredLanguage } from "./api";

// web/src/lib/language-context.tsx'in mobil portu - aynı desen, localStorage
// yerine expo-secure-store, navigator.language yerine expo-localization.
//
// Faz 1 (2026-08-08): SADECE egzersiz/beslenme katalog kutucuklarının
// gösterim dilini etkiler (bkz. catalogDisplayName). Sohbet/RAG/arayüz
// metinleri bu context'ten ETKİLENMEZ - ayrı bir fazın kapsamında.
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
  const [language, setLanguageState] = useState<PreferredLanguage>("tr");
  const [isLoading, setIsLoading] = useState(true);
  // web/src/lib/language-context.tsx'teki aynı düzeltme - canlı testte
  // bulundu (2026-08-08): profil senkronizasyonu tamamlanmadan kullanıcı
  // elle dil değiştirirse, gecikmeli cevap seçimi sessizce eziyordu.
  const hasUserOverriddenRef = useRef(false);

  useEffect(() => {
    if (token) return;
    let cancelled = false;
    async function restoreLocalDefault() {
      // Giriş yapılmamışken (login ekranı) sadece cihaz dilinden/daha önce
      // bu cihazda seçilmiş yerel bir tercihten bir varsayılan gösterilir -
      // backend'e hiçbir şey yazılmaz.
      const stored = (await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY)) as PreferredLanguage | null;
      if (!cancelled) {
        setLanguageState(stored ?? detectDeviceLanguage());
        setIsLoading(false);
      }
    }
    restoreLocalDefault();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function syncFromProfile() {
      setIsLoading(true);
      try {
        // Giriş yapılınca profildeki KALICI tercih (varsa, cihazlar arası
        // senkron) yerel/cihaz varsayılanının önüne geçer.
        const profile = await getProfile(token as string);
        if (!cancelled && !hasUserOverriddenRef.current) setLanguageState(profile.preferred_language);
      } catch {
        // Profil çekilemedi (ör. ağ hatası) - yerel/cihaz varsayılanında kal.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    syncFromProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setLanguage = useCallback(
    (lang: PreferredLanguage) => {
      hasUserOverriddenRef.current = true;
      setLanguageState(lang);
      SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
      if (token) {
        updateProfile(token, { preferred_language: lang }).catch(() => {
          // Sunucuya yazma başarısız olsa da yerel state güncel kalır - UX
          // bloklanmaz, sonraki bir profil çekişinde eski değer geri
          // gelebilir (nadir, ağ hatası durumu).
        });
      }
    },
    [token]
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

/** Katalog satırının (egzersiz/besin, ikisi de name_tr+name_en taşıyor)
 * kullanıcının dil tercihine göre gösterilecek ismini döner. */
export function catalogDisplayName(
  item: { name_tr: string; name_en: string },
  language: PreferredLanguage
): string {
  return language === "en" ? item.name_en : item.name_tr;
}
