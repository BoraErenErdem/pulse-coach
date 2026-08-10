"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { getProfile, updateProfile, type PreferredLanguage } from "@/lib/api";
import { setCurrentLanguage } from "@/lib/language-storage";

// Faz 1 (2026-08-08): egzersiz/beslenme katalog kutucuklarının gösterim
// dilini etkiliyordu (bkz. catalogDisplayName). Faz 2 (2026-08-08): AYNI
// tercih artık TÜM arayüz metinlerini de kapsıyor (bkz. useT). Sohbetteki
// AI koç bundan HÂLÂ etkilenmiyor (Faz 3'ün kapsamı, henüz yapılmadı) -
// bkz. project_health_coach_status.md.
const LANGUAGE_STORAGE_KEY = "pulsecoach_language";

interface LanguageContextValue {
  language: PreferredLanguage;
  setLanguage: (lang: PreferredLanguage) => void;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectBrowserLanguage(): PreferredLanguage {
  if (typeof navigator === "undefined") return "tr";
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "tr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [language, setLanguageState] = useState<PreferredLanguage>("tr");
  const [isLoading, setIsLoading] = useState(true);
  // Canlı testte bulundu (2026-08-08): sayfa yeni açıldığında kullanıcı
  // dil butonuna arka plandaki GET /profile isteği tamamlanmadan tıklarsa,
  // isteğin cevabı GERİYE geç gelip kullanıcının seçimini sessizce
  // eziyordu (race condition). Kullanıcı elle bir seçim yaptıysa artık
  // profil senkronizasyonu bunu bir daha ezmiyor.
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
    function restoreLocalDefault() {
      // Giriş yapılmamışken (login/register sayfaları) sadece tarayıcı
      // dilinden/daha önce bu cihazda seçilmiş yerel bir tercihten bir
      // varsayılan gösterilir - backend'e hiçbir şey yazılmaz.
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as PreferredLanguage | null;
      applyLanguage(stored ?? detectBrowserLanguage());
      setIsLoading(false);
    }
    if (!token) restoreLocalDefault();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function syncFromProfile() {
      setIsLoading(true);
      try {
        // Giriş yapılınca profildeki KALICI tercih (varsa, cihazlar arası
        // senkron) yerel/tarayıcı varsayılanının önüne geçer.
        const profile = await getProfile(token as string);
        if (!cancelled && !hasUserOverriddenRef.current) applyLanguage(profile.preferred_language);
      } catch {
        // Profil çekilemedi (ör. ağ hatası) - yerel/tarayıcı varsayılanında kal.
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
      applyLanguage(lang);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
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

/** Faz 2 arayüz çevirisi için tek satırlık yardımcı: `t("Kaydet", "Save")`.
 * Ayrı bir anahtar/sözlük dosyası yerine (proje zaten GOAL_LABELS gibi
 * küçük yerel sözlükler kullanıyor, aynı düşük-seremoni desen) her metin
 * kullanıldığı yerde iki dilde birden yazılıyor - 2 dilli, çekim/çoğul
 * karmaşıklığı olmayan bir arayüz için ekstra bir soyutlama katmanı
 * gerektirmiyor. İnterpolasyon gerektiren metinler için de aynı şekilde
 * `t(\`${n} sonuç\`, \`${n} results\`)` kullanılır. */
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
