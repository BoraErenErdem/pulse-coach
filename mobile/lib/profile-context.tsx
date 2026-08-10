import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getProfile, updateProfile as apiUpdateProfile, type Profile, type ProfileUpdatePayload } from "@/lib/api";

// web/src/lib/profile-context.tsx'in mobil portu - getProfile önceden 4
// ayrı ekranda (index/progress/profile/goals) bağımsız olarak fetch
// ediliyordu, LanguageProvider de AYRICA kendi kopyasını çekiyordu. Tek bir
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
      setError(err instanceof ApiError ? err.message : "Profile could not be loaded.");
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
