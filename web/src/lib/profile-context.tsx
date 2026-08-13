"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getProfile, updateProfile as apiUpdateProfile, type Profile, type ProfileUpdatePayload } from "@/lib/api";

// ProfileProvider, LanguageProvider'ın DIŞINDA render ediliyor (bkz.
// app/layout.tsx - LanguageProvider kendisi useProfile() kullandığı için
// bağımlılık ProfileProvider→Language yönünde OLMAK ZORUNDA, tersi
// mümkün değil). Bu yüzden burada useT()/useLanguage() ÇAĞRILAMAZ (SSR/
// prerender'da "must be used within a LanguageProvider" hatasıyla çöker -
// 2026-08-13'te bulundu). Jenerik (ApiError olmayan) hata durumunda gerçek
// metin yerine bu işaretçi saklanır, çeviri LanguageProvider'ın İÇİNDEKİ
// tüketici (profile/page.tsx) tarafından yapılır.
export const PROFILE_LOAD_FAILED_SENTINEL = "__profile_load_failed__";

// getProfile önceden 5 ayrı sayfada (chat/goals/progress/profile/
// language-context) bağımsız olarak fetch ediliyordu - kullanıcı Goals
// sekmesine girdiğinde profil en az 2 kez istekle çekiliyordu. Tek bir
// paylaşımlı context'te tutulup `updateProfile()` sonrası tüm tüketiciler
// yeni bir fetch beklemeden aynı anda güncel veriyi görüyor (2026-08-10
// mimari borç raporu, bulgu #7 - en yüksek etkili öneri).
interface ProfileContextValue {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<Profile>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProfile(token);
      setProfile(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : PROFILE_LOAD_FAILED_SENTINEL);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    function load() {
      refresh();
    }
    load();
  }, [refresh]);

  const updateProfile = useCallback(
    async (payload: ProfileUpdatePayload) => {
      if (!token) throw new Error("updateProfile called without a token");
      const updated = await apiUpdateProfile(token, payload);
      setProfile(updated);
      return updated;
    },
    [token]
  );

  return (
    <ProfileContext.Provider value={{ profile, isLoading, error, refresh, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
