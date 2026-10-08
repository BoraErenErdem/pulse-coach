"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  Download,
  FileText,
  Info,
  Lock,
  LogOut,
  Mail,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  Ruler,
  Shield,
  SlidersHorizontal,
  Sun,
  Target,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  ACTIVITY_LEVELS,
  AGE_LIMITS,
  ApiError,
  COACH_TONES,
  deleteAccount,
  exportUserData,
  GOALS,
  HEIGHT_LIMITS_CM,
  MAX_DIETARY_RESTRICTIONS_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  SEXES,
  type ActivityLevel,
  type CoachTone,
  type Goal,
  type ProfileUpdatePayload,
  type Sex,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { PROFILE_LOAD_FAILED_SENTINEL, useProfile } from "@/lib/profile-context";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { toLocaleUpper } from "@/lib/format";
import { BackToProfile } from "@/components/BackToProfile";
import { ErrorBanner, InfoBanner, Skeleton, SuccessBanner } from "@/components/ui";

// Mobil app/profile-settings.tsx karşılığı (2026-10-08, web = mobil eşitleme): aynı bölümler ve
// aynı sıra - Hakkında -> Vücut Bilgilerin -> Hedef ve Koç -> Görünüm -> Bildirimler -> Gizlilik ->
// Verilerim -> Uygulama -> Tehlikeli Bölge. Metin alanları değişince "Vazgeç / Kaydet" çıkar; çip,
// anahtar ve dil/tema seçimleri anında kaydedilir. Hedef kilo artık Hedef Merkezi'nde (mobil gibi).
// Masaüstünde iki sütun (CSS columns): okuma sırası yukarıdan aşağı, sonra sağ sütun.

const CONTACT_EMAIL = "destek@pulsecoachapp.com";
const DEFAULT_REMINDER_HOUR = 18;

function Panel({ icon, title, tag, id, children }: { icon: ReactNode; title: string; tag?: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="pc-panel mb-4 flex break-inside-avoid flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tone-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--tone-accent)_15%,transparent)] text-[var(--tone-accent)]">
          {icon}
        </span>
        <h2 className="flex-1 text-lg font-semibold text-zinc-900 dark:text-white">{title}</h2>
        {tag ? <span className="text-[11px] font-bold tracking-wide text-[var(--tone-accent)]">{tag}</span> : null}
      </div>
      {children}
    </section>
  );
}

function SubLabel({ children, hint, htmlFor }: { children: string; hint?: string; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-zinc-900 dark:text-white">
          {children}
        </label>
      ) : (
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{children}</p>
      )}
      {hint ? <p className="text-xs text-zinc-500 dark:text-white/75">{hint}</p> : null}
    </div>
  );
}

/** Sarılan seçim çipleri - seçili olan ametist dolgu (mobil ChoiceChips). */
function ChoiceChips<K extends string>({
  options,
  value,
  onChange,
  labels,
  label,
}: {
  options: readonly K[];
  value: K;
  onChange: (next: K) => void;
  labels: Record<K, string>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && onChange(option)}
            className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
              on
                ? "border-[var(--tone-fill)] bg-[var(--tone-fill)] text-[var(--tone-on-fill)] dark:border-[var(--tone-accent)] dark:bg-[color-mix(in_srgb,var(--tone-accent)_25%,transparent)] dark:text-white"
                : "border-black/10 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

/** Hap içinde hap seçici (mobil SegmentToggle): dil ve tema. */
function Segment<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string; icon?: ReactNode }[];
  value: K;
  onChange: (next: K) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-[3px] rounded-2xl bg-[var(--pc-tabs)] p-[3px]">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[13px] border text-sm font-semibold transition-colors ${
              on
                ? "border-[var(--tone-accent)] bg-[color-mix(in_srgb,var(--tone-accent)_18%,transparent)] text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-white/75 dark:hover:text-white"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900 dark:text-white">{label}</span>
        {hint ? <span className="block text-xs text-zinc-500 dark:text-white/75">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-[26px] w-[46px] shrink-0 rounded-full bg-[#d6cfc2] transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[var(--tone-accent)] peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--tone-accent)] dark:bg-white/20"
      />
    </label>
  );
}

function LinkRow({ href, icon, label, hint, external }: { href: string; icon: ReactNode; label: string; hint?: string; external?: boolean }) {
  const body = (
    <>
      <span className="text-[var(--tone-accent)]">{icon}</span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900 dark:text-white">{label}</span>
        {hint ? <span className="block text-xs text-zinc-500 dark:text-white/75">{hint}</span> : null}
      </span>
      <ChevronRight className="h-[18px] w-[18px] text-zinc-400 transition-transform group-hover:translate-x-0.5 dark:text-white/60" aria-hidden="true" />
    </>
  );
  const cls = "group -mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]";
  return external ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** Yerel düzenlenebilir değer; kaynak (profildeki alan) değişince ona sıfırlanır - yalnız O alan
 * (render sırasında eşitleme, efekt yok). */
function useSyncedState(source: string): [string, (next: string) => void] {
  const [value, setValue] = useState(source);
  const [synced, setSynced] = useState(source);
  if (synced !== source) {
    setSynced(source);
    setValue(source);
  }
  return [value, setValue];
}

const Divider = () => <div className="h-px bg-black/[0.08] dark:bg-white/10" />;

const INPUT =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-input)] px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition-colors focus:border-[var(--tone-accent)] focus:ring-1 focus:ring-[var(--tone-accent)] dark:text-white";

function SaveRow({ onDiscard, onSave, isSaving }: { onDiscard: () => void; onSave: () => void; isSaving: boolean }) {
  const t = useT();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onDiscard}
        className="min-h-11 flex-1 rounded-[14px] border border-black/10 text-sm font-semibold text-zinc-800 hover:bg-black/[0.03] dark:border-white/20 dark:text-white dark:hover:bg-white/[0.06]"
      >
        {t("Vazgeç", "Discard")}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="min-h-11 flex-1 rounded-[14px] bg-[var(--tone-fill)] text-sm font-semibold text-[var(--tone-on-fill)] transition-opacity disabled:opacity-70"
      >
        {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
      </button>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { token, user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  // Profil ProfileProvider'ın paylaşımlı cache'inden; updateProfile aynı context'e yazar.
  const { profile, isLoading, error: loadError, updateProfile } = useProfile();
  const isFirstTimeSetup = profile?.goal === null;

  const GOAL_OPTIONS = ["", ...GOALS] as const;
  const GOAL_LABELS: Record<Goal | "", string> = {
    "": t("Belirtilmemiş", "Not specified"),
    weight_loss: t("Kilo vermek", "Lose weight"),
    muscle_gain: t("Kas yapmak", "Build muscle"),
    general_health: t("Genel sağlık", "General health"),
  };
  const ACTIVITY_OPTIONS = ["", ...ACTIVITY_LEVELS] as const;
  const ACTIVITY_LABELS: Record<ActivityLevel | "", string> = {
    "": t("Belirtilmemiş", "Not specified"),
    sedentary: t("Hareketsiz", "Sedentary"),
    light: t("Hafif aktif", "Lightly active"),
    moderate: t("Orta aktif", "Moderately active"),
    active: t("Çok aktif", "Very active"),
  };
  const SEX_OPTIONS = ["", ...SEXES] as const;
  const SEX_LABELS: Record<Sex | "", string> = {
    "": t("Belirtmek istemiyorum", "Prefer not to say"),
    female: t("Kadın", "Female"),
    male: t("Erkek", "Male"),
  };
  const COACH_TONE_LABELS: Record<CoachTone, string> = {
    sicak: t("Samimi", "Warm"),
    enerjik: t("Enerjik", "Energetic"),
    notr: t("Nötr", "Neutral"),
  };

  // ---- Hakkında: metin alanları tek Kaydet. Alan bazında senkron - yalnız profildeki O alan
  // değişince (kaydedilmemiş not, bir çipe dokununca silinmesin; mobil canlı test bulgusu).
  const profileName = profile?.display_name ?? "";
  const profileRestrictions = profile?.dietary_restrictions ?? "";
  const [displayName, setDisplayName] = useSyncedState(profileName);
  const [restrictions, setRestrictions] = useSyncedState(profileRestrictions);
  const [textSaved, setTextSaved] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [isSavingText, setIsSavingText] = useState(false);
  const isTextDirty = !!profile && (displayName.trim() !== profileName || restrictions.trim() !== profileRestrictions);

  async function saveText() {
    setTextError(null);
    setTextSaved(null);
    setIsSavingText(true);
    try {
      await updateProfile({ display_name: displayName.trim() || null, dietary_restrictions: restrictions.trim() || null });
      setTextSaved(t("Kaydedildi!", "Saved!"));
    } catch (err) {
      setTextError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingText(false);
    }
  }

  // ---- Vücut bilgileri: boy/doğum yılı tek Kaydet, cinsiyet çipi anında.
  const profileHeight = profile?.height_cm != null ? String(profile.height_cm) : "";
  const profileBirthYear = profile?.birth_year != null ? String(profile.birth_year) : "";
  const [heightText, setHeightText] = useSyncedState(profileHeight);
  const [birthYearText, setBirthYearText] = useSyncedState(profileBirthYear);
  const [bodySaved, setBodySaved] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [isSavingBody, setIsSavingBody] = useState(false);
  const isBodyDirty = !!profile && (heightText.trim() !== profileHeight || birthYearText.trim() !== profileBirthYear);
  const currentYear = new Date().getFullYear();
  const birthYearRange = { min: currentYear - AGE_LIMITS.max, max: currentYear - AGE_LIMITS.min };

  async function saveBody() {
    setBodyError(null);
    setBodySaved(null);
    const height = heightText.trim() === "" ? null : Number(heightText.replace(",", "."));
    const birthYear = birthYearText.trim() === "" ? null : Number(birthYearText.trim());
    if (height !== null && (Number.isNaN(height) || height < HEIGHT_LIMITS_CM.min || height > HEIGHT_LIMITS_CM.max)) {
      setBodyError(
        t(`Boy ${HEIGHT_LIMITS_CM.min} ile ${HEIGHT_LIMITS_CM.max} cm arasında olmalı.`, `Height must be between ${HEIGHT_LIMITS_CM.min} and ${HEIGHT_LIMITS_CM.max} cm.`)
      );
      return;
    }
    if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < birthYearRange.min || birthYear > birthYearRange.max)) {
      setBodyError(
        t(
          `Doğum yılı ${birthYearRange.min} ile ${birthYearRange.max} arasında olmalı (uygulama 18 yaş ve üstü içindir).`,
          `Birth year must be between ${birthYearRange.min} and ${birthYearRange.max} (the app is for ages 18 and up).`
        )
      );
      return;
    }
    setIsSavingBody(true);
    try {
      await updateProfile({ height_cm: height, birth_year: birthYear });
      setBodySaved(t("Kaydedildi!", "Saved!"));
    } catch (err) {
      setBodyError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingBody(false);
    }
  }

  // ---- Anında kaydedilen seçimler
  const [prefError, setPrefError] = useState<string | null>(null);
  async function savePreference(payload: ProfileUpdatePayload) {
    setPrefError(null);
    try {
      await updateProfile(payload);
    } catch (err) {
      setPrefError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    }
  }

  // ---- Hatırlatma saati: hızlı art arda -/+ tek istekte birleşir; bekleyen değişiklik varken
  // profil senkronu atlanır (yoldaki eski yanıt yeni seçimi ezmesin - mobil canlı test bulgusu).
  const [nudgeHour, setNudgeHour] = useState<number | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNudge = useRef(0);
  const profileNudgeHour = profile?.daily_nudge_hour ?? null;
  useEffect(() => {
    if (pendingNudge.current > 0) return;
    setNudgeHour(profileNudgeHour);
  }, [profileNudgeHour]);
  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    []
  );
  function changeNudgeHour(next: number) {
    setNudgeHour(next);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    else pendingNudge.current += 1;
    nudgeTimer.current = setTimeout(async () => {
      nudgeTimer.current = null;
      try {
        await savePreference({ daily_nudge_hour: next });
      } finally {
        pendingNudge.current -= 1;
      }
    }, 600);
  }
  const shownHour = nudgeHour ?? DEFAULT_REMINDER_HOUR;

  // ---- Verilerim
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function handleExport() {
    if (!token) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const data = await exportUserData(token);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${t("pulsecoach-verilerim", "pulsecoach-my-data")}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : t("Veriler indirilemedi, tekrar dener misin?", "Couldn't download data, want to try again?"));
    } finally {
      setIsExporting(false);
    }
  }

  // ---- Hesap silme (iki adımlı, şifre onaylı)
  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteAccount(token, deletePassword);
      logout();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("Hesap silinemedi, tekrar dener misin?", "Couldn't delete account, want to try again?"));
      setIsDeleting(false);
    }
  }

  const instantTag = toLocaleUpper(t("anında kaydedilir", "saved instantly"), language);
  const filledCount = [profile?.goal, profile?.activity_level, profile?.dietary_restrictions].filter(Boolean).length;
  const themeOptions: { key: ThemePreference; label: string; icon: ReactNode }[] = [
    { key: "system", label: t("Sistem", "System"), icon: <Monitor className="h-[15px] w-[15px]" aria-hidden="true" /> },
    { key: "light", label: t("Açık", "Light"), icon: <Sun className="h-[15px] w-[15px]" aria-hidden="true" /> },
    { key: "dark", label: t("Koyu", "Dark"), icon: <Moon className="h-[15px] w-[15px]" aria-hidden="true" /> },
  ];
  const iconCls = "h-[17px] w-[17px]";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <BackToProfile />
        <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Hesap ve Ayarlar", "Account & Settings")}</h1>
        {user ? <p className="mt-0.5 text-sm text-zinc-500">{user.email}</p> : null}
      </div>

      {loadError ? (
        <ErrorBanner message={loadError === PROFILE_LOAD_FAILED_SENTINEL ? t("Profil yüklenemedi.", "Profile could not be loaded.") : loadError} />
      ) : null}

      {isLoading || !profile ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-[22px]" />
          <Skeleton className="h-64 w-full rounded-[22px]" />
        </div>
      ) : (
        <>
          {isFirstTimeSetup ? (
            <InfoBanner
              message={t(
                "Hoş geldin! Koçunun sana özel öneriler sunabilmesi için önce hedefini ve birkaç temel bilgini öğrenelim.",
                "Welcome! Let's learn your goal and a few basics first so your coach can give you personalized suggestions."
              )}
            />
          ) : null}

          <div className="gap-4 lg:columns-2">
            <Panel icon={<UserRound className={iconCls} />} title={t("Hakkında", "About You")}>
              {textSaved ? <SuccessBanner message={textSaved} /> : null}
              {textError ? <ErrorBanner message={textError} /> : null}
              <div className="flex flex-col gap-1.5">
                <SubLabel htmlFor="displayName" hint={t("Karşılamada e-postan yerine bu ad görünür.", "Shown in greetings instead of your email.")}>
                  {t("Görünen Ad", "Display Name")}
                </SubLabel>
                <input
                  id="displayName"
                  className={INPUT}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setTextSaved(null);
                  }}
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  placeholder={t("opsiyonel", "optional")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <SubLabel
                  htmlFor="restrictions"
                  hint={t(
                    "Alerjiler, hassasiyetler, beslenme tercihleri - koçun önerilerinde dikkate alır.",
                    "Allergies, sensitivities, diet preferences - your coach takes them into account."
                  )}
                >
                  {t("Hassasiyetler ve Kısıtlamalar", "Sensitivities & Restrictions")}
                </SubLabel>
                <textarea
                  id="restrictions"
                  className={`${INPUT} min-h-[88px] resize-y`}
                  value={restrictions}
                  onChange={(e) => {
                    setRestrictions(e.target.value);
                    setTextSaved(null);
                  }}
                  maxLength={MAX_DIETARY_RESTRICTIONS_LENGTH}
                  placeholder={t("ör. fıstık alerjisi, laktozsuz, vejetaryen", "e.g. peanut allergy, lactose-free, vegetarian")}
                />
                <p className="self-end text-xs text-zinc-500 dark:text-white/70">
                  {restrictions.length}/{MAX_DIETARY_RESTRICTIONS_LENGTH}
                </p>
              </div>
              {isTextDirty ? (
                <SaveRow
                  onDiscard={() => {
                    setDisplayName(profileName);
                    setRestrictions(profileRestrictions);
                  }}
                  onSave={saveText}
                  isSaving={isSavingText}
                />
              ) : null}
            </Panel>

            <Panel icon={<Ruler className={iconCls} />} title={t("Vücut Bilgilerin", "Body Details")}>
              <p className="-mt-1 text-xs text-zinc-500 dark:text-white/75">
                {t(
                  "İsteğe bağlı. Güncel kilonla birlikte yalnızca günlük kalori ve makro önerini hesaplamak için kullanılır.",
                  "Optional. Used only, together with your latest weight, to calculate your suggested daily calories and macros."
                )}
              </p>
              {bodySaved ? <SuccessBanner message={bodySaved} /> : null}
              {bodyError ? <ErrorBanner message={bodyError} /> : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <SubLabel htmlFor="heightCm">{t("Boy (cm)", "Height (cm)")}</SubLabel>
                  <input
                    id="heightCm"
                    className={INPUT}
                    inputMode="decimal"
                    maxLength={5}
                    value={heightText}
                    onChange={(e) => {
                      setHeightText(e.target.value);
                      setBodySaved(null);
                      setBodyError(null);
                    }}
                    placeholder={t("ör. 175", "e.g. 175")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <SubLabel htmlFor="birthYear">{t("Doğum Yılı", "Birth Year")}</SubLabel>
                  <input
                    id="birthYear"
                    className={INPUT}
                    inputMode="numeric"
                    maxLength={4}
                    value={birthYearText}
                    onChange={(e) => {
                      setBirthYearText(e.target.value.replace(/[^0-9]/g, ""));
                      setBodySaved(null);
                      setBodyError(null);
                    }}
                    placeholder={t(`ör. ${currentYear - 30}`, `e.g. ${currentYear - 30}`)}
                  />
                </div>
              </div>
              {isBodyDirty ? (
                <SaveRow
                  onDiscard={() => {
                    setHeightText(profileHeight);
                    setBirthYearText(profileBirthYear);
                    setBodyError(null);
                  }}
                  onSave={saveBody}
                  isSaving={isSavingBody}
                />
              ) : null}
              <div className="flex flex-col gap-2">
                <SubLabel hint={t("Formül kadın ve erkek için farklı bir sabit kullanır. Anında kaydedilir.", "The formula uses a different constant for women and men. Saved instantly.")}>
                  {t("Cinsiyet", "Sex")}
                </SubLabel>
                <ChoiceChips
                  label={t("Cinsiyet", "Sex")}
                  options={SEX_OPTIONS}
                  value={profile.sex ?? ""}
                  onChange={(next) => void savePreference({ sex: next || null })}
                  labels={SEX_LABELS}
                />
              </div>
              <Divider />
              <LinkRow
                href="/goals"
                icon={<Target className="h-[18px] w-[18px]" aria-hidden="true" />}
                label={t("Kalori önerini gör", "See your calorie suggestion")}
                hint={t("Beslenme hedeflerinde, tek tıkla doldur", "In your nutrition goals, fill in with one click")}
              />
            </Panel>

            <Panel icon={<SlidersHorizontal className={iconCls} />} title={t("Hedef ve Koç", "Goal & Coach")} tag={instantTag}>
              {prefError ? <ErrorBanner message={prefError} /> : null}
              {isFirstTimeSetup ? (
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div className="h-full rounded-full bg-[var(--tone-accent)]" style={{ width: `${(filledCount / 3) * 100}%` }} />
                  </div>
                  <p className="text-xs text-zinc-500">{t(`Profilin ${filledCount}/3 tamam`, `${filledCount}/3 fields done`)}</p>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <SubLabel>{t("Genel Hedef", "General Goal")}</SubLabel>
                <ChoiceChips
                  label={t("Genel Hedef", "General Goal")}
                  options={GOAL_OPTIONS}
                  value={profile.goal ?? ""}
                  onChange={(next) => void savePreference({ goal: next || null })}
                  labels={GOAL_LABELS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <SubLabel>{t("Aktivite Seviyesi", "Activity Level")}</SubLabel>
                <ChoiceChips
                  label={t("Aktivite Seviyesi", "Activity Level")}
                  options={ACTIVITY_OPTIONS}
                  value={profile.activity_level ?? ""}
                  onChange={(next) => void savePreference({ activity_level: next || null })}
                  labels={ACTIVITY_LABELS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <SubLabel hint={t("Sohbette ve bildirimlerde kullandığı üslup.", "The tone used in chat and notifications.")}>{t("Koç Tonu", "Coach Tone")}</SubLabel>
                <ChoiceChips
                  label={t("Koç Tonu", "Coach Tone")}
                  options={COACH_TONES}
                  value={profile.coach_tone ?? "notr"}
                  onChange={(next) => void savePreference({ coach_tone: next })}
                  labels={COACH_TONE_LABELS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <SubLabel hint={t("Arayüz, egzersiz/besin adları ve koç yanıtları.", "Interface, exercise/food names and coach replies.")}>{t("Dil", "Language")}</SubLabel>
                <Segment
                  label={t("Dil", "Language")}
                  options={[
                    { key: "tr", label: "Türkçe" },
                    { key: "en", label: "English" },
                  ]}
                  value={language}
                  onChange={setLanguage}
                />
              </div>
              <Divider />
              <LinkRow
                href="/goals"
                icon={<Target className="h-[18px] w-[18px]" aria-hidden="true" />}
                label={t("Hedef Merkezi", "Goal Center")}
                hint={t("Kilo, antrenman ve beslenme hedeflerin", "Your body, workout and nutrition goals")}
              />
            </Panel>

            <Panel icon={<Palette className={iconCls} />} title={t("Görünüm", "Appearance")} tag={instantTag}>
              <Segment label={t("Tema", "Theme")} options={themeOptions} value={themePreference} onChange={setThemePreference} />
              <p className="-mt-1 text-xs text-zinc-500 dark:text-white/75">
                {themePreference === "system"
                  ? t("Cihazının açık/koyu ayarını izler.", "Follows your device's light/dark setting.")
                  : t("Uygulama her zaman bu temada açılır.", "The app always opens in this theme.")}
              </p>
            </Panel>

            <Panel id="bildirimler" icon={<Bell className={iconCls} />} title={t("Bildirimler", "Notifications")} tag={instantTag}>
              <p className="-mt-1 text-xs text-zinc-500 dark:text-white/75">
                {t(
                  "Koçunun Bildirimler'e bıraktığı mesajlar. Telefon bildirimleri mobil uygulamada, cihazında zamanlanır.",
                  "Messages your coach leaves in Notifications. Phone notifications are scheduled on your device in the mobile app."
                )}
              </p>
              <SwitchRow
                label={t("Haftalık ilerleme özeti", "Weekly progress summary")}
                hint={t("Pazar akşamı koçundan haftanın özeti.", "Your coach's weekly recap on Sunday evening.")}
                checked={profile.weekly_summary_enabled}
                onChange={(next) => void savePreference({ weekly_summary_enabled: next })}
              />
              <Divider />
              <SwitchRow
                label={t("Günlük hatırlatma", "Daily reminder")}
                hint={t("Uygulamayı açmadığın günlerde, en fazla 3 günde bir.", "On days you haven't opened the app, at most every 3 days.")}
                checked={profile.daily_nudge_enabled}
                onChange={(next) => void savePreference({ daily_nudge_enabled: next })}
              />
              {profile.daily_nudge_enabled ? (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-xs text-zinc-500 dark:text-white/75">{t("Hatırlatma saati", "Reminder time")}</span>
                  <button
                    type="button"
                    onClick={() => changeNudgeHour((shownHour + 23) % 24)}
                    aria-label={t("Bir saat erken", "One hour earlier")}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tone-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--tone-accent)_13%,transparent)] text-[var(--tone-accent)] dark:text-white"
                  >
                    <Minus className="h-[18px] w-[18px]" />
                  </button>
                  <span aria-live="polite" className="w-16 text-center text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">
                    {`${String(shownHour).padStart(2, "0")}:00`}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeNudgeHour((shownHour + 1) % 24)}
                    aria-label={t("Bir saat geç", "One hour later")}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tone-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--tone-accent)_13%,transparent)] text-[var(--tone-accent)] dark:text-white"
                  >
                    <Plus className="h-[18px] w-[18px]" />
                  </button>
                </div>
              ) : null}
            </Panel>

            <Panel icon={<Shield className={iconCls} />} title={t("Gizlilik", "Privacy")}>
              <div className="-my-1 flex flex-col">
                <LinkRow href="/kvkk" icon={<Lock className="h-[18px] w-[18px]" aria-hidden="true" />} label={t("Gizlilik ve KVKK", "Privacy & KVKK")} />
                <Divider />
                <LinkRow href="/terms" icon={<FileText className="h-[18px] w-[18px]" aria-hidden="true" />} label={t("Kullanım Koşulları", "Terms of Service")} />
              </div>
            </Panel>

            <Panel icon={<Download className={iconCls} />} title={t("Verilerim", "My Data")}>
              <p className="-mt-1 text-xs text-zinc-500 dark:text-white/75">
                {t(
                  "Tüm verini (profil, sohbet, beslenme, egzersiz, ilerleme, ruh hali) JSON olarak indir.",
                  "Download all your data (profile, chat, nutrition, exercise, progress, mood) as JSON."
                )}
              </p>
              {exportError ? <ErrorBanner message={exportError} /> : null}
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[color-mix(in_srgb,var(--tone-accent)_60%,transparent)] text-sm font-semibold text-[var(--tone-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--tone-accent)_10%,transparent)] disabled:opacity-70 dark:text-white"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {isExporting ? t("Hazırlanıyor...", "Preparing...") : t("Verilerimi İndir", "Download My Data")}
              </button>
            </Panel>

            <Panel icon={<Info className={iconCls} />} title={t("Uygulama", "App")}>
              <div className="-my-1 flex flex-col">
                <LinkRow
                  external
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`PulseCoach web - ${t("Geri bildirim", "Feedback")}`)}`}
                  icon={<Mail className="h-[18px] w-[18px]" aria-hidden="true" />}
                  label={t("Geri bildirim gönder", "Send feedback")}
                  hint={CONTACT_EMAIL}
                />
                <Divider />
                <button
                  type="button"
                  onClick={logout}
                  className="group -mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <LogOut className="h-[18px] w-[18px] text-[var(--tone-accent)]" aria-hidden="true" />
                  <span className="flex-1 text-[15px] font-semibold text-zinc-900 dark:text-white">{t("Çıkış Yap", "Log Out")}</span>
                </button>
              </div>
            </Panel>

            <section className="mb-4 flex break-inside-avoid flex-col gap-3 rounded-[22px] border border-red-600/30 bg-red-600/[0.05] p-5 dark:border-red-400/30 dark:bg-red-500/[0.08] sm:p-6">
              <h2 className="text-base font-semibold text-red-700 dark:text-red-400">{t("Tehlikeli Bölge", "Danger Zone")}</h2>
              <p className="text-xs text-zinc-500 dark:text-white/75">
                {t(
                  "Hesabını silmek kalıcıdır ve geri alınamaz — tüm verin kalıcı olarak silinir.",
                  "Deleting your account is permanent and cannot be undone — all your data will be permanently deleted."
                )}
              </p>
              {!isDeleteFormOpen ? (
                <button
                  type="button"
                  onClick={() => setIsDeleteFormOpen(true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-red-600/50 text-sm font-semibold text-red-700 transition-colors hover:bg-red-600/10 dark:border-red-400/50 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("Hesabımı Sil", "Delete My Account")}
                </button>
              ) : (
                <form onSubmit={handleDeleteAccount} className="flex flex-col gap-2.5">
                  {deleteError ? <ErrorBanner message={deleteError} /> : null}
                  <label htmlFor="deletePassword" className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {t("Onaylamak için şifreni gir", "Enter your password to confirm")}
                  </label>
                  <input id="deletePassword" type="password" className={INPUT} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeleteFormOpen(false);
                        setDeletePassword("");
                        setDeleteError(null);
                      }}
                      className="min-h-11 flex-1 rounded-[14px] border border-black/10 text-sm font-semibold text-zinc-800 dark:border-white/20 dark:text-white"
                    >
                      {t("Vazgeç", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={isDeleting || !deletePassword}
                      className="min-h-11 flex-1 rounded-[14px] bg-red-600 text-sm font-semibold text-white transition-opacity hover:bg-red-700 disabled:opacity-55"
                    >
                      {isDeleting ? t("Siliniyor...", "Deleting...") : t("Kalıcı Olarak Sil", "Delete Permanently")}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
