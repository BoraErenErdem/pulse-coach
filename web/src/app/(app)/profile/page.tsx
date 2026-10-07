"use client";

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { useT } from "@/lib/language-context";
import { PROFILE_LOAD_FAILED_SENTINEL, useProfile } from "@/lib/profile-context";
import { ProfileOverview } from "@/components/ProfileOverview";
import { ErrorBanner, Skeleton } from "@/components/ui";

// Profil sekmesi - mobil (tabs)/profile.tsx ile aynı düzen (2026-10-07): kimlik kartı, özet
// kutuları, Hedeflerin, koç notu, başarılar ve menü. Bilgiler/tercihler/veri ayrı ekranda
// (/profile/settings, mobil profile-settings.tsx).
export default function ProfilePage() {
  const t = useT();
  const { profile, isLoading, error: loadError } = useProfile();
  const isFirstTimeSetup = profile?.goal === null;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Profil", "Profile")}</h1>

      {loadError ? (
        <ErrorBanner message={loadError === PROFILE_LOAD_FAILED_SENTINEL ? t("Profil yüklenemedi.", "Profile could not be loaded.") : loadError} />
      ) : null}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {isFirstTimeSetup ? (
            <Link href="/profile/settings" className="pc-insight flex items-center gap-3 p-[18px] transition-transform hover:-translate-y-0.5">
              <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm">
                <span className="block text-[15px] font-semibold">{t("Hoş geldin!", "Welcome!")}</span>
                {t(
                  "Koçunun sana özel öneriler sunabilmesi için hedefini ve birkaç temel bilgini gir.",
                  "Add your goal and a few basics so your coach can give you personalized suggestions."
                )}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
            </Link>
          ) : null}
          <ProfileOverview profile={profile} />
        </>
      )}
    </div>
  );
}
