"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, Save, Trash2, User } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  ApiError,
  COACH_TONES,
  deleteAccount,
  exportUserData,
  GOALS,
  type ActivityLevel,
  type CoachTone,
  type Goal,
  type PreferredLanguage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { PROFILE_LOAD_FAILED_SENTINEL, useProfile } from "@/lib/profile-context";
import { useFormSubmit } from "@/lib/use-form-submit";
import {
  Card,
  ErrorBanner,
  InfoBanner,
  Label,
  PrimaryButton,
  SecondaryButton,
  Select,
  Skeleton,
  SuccessBanner,
  TextInput,
} from "@/components/ui";

const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "Türkçe",
  en: "English",
};

export default function ProfilePage() {
  const { token, user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz, updateProfile de aynı context
  // üzerinden yazıyor ki diğer tüketiciler (chat/goals/progress) yeni bir
  // fetch beklemeden anında güncel veriyi görsün (2026-08-10 mimari borç
  // raporu, bulgu #7).
  const { profile, isLoading, error: loadError, updateProfile: updateProfileShared } = useProfile();
  const isFirstTimeSetup = profile?.goal === null;

  const GOAL_LABELS: Record<Goal, string> = {
    weight_loss: t("Kilo vermek", "Lose weight"),
    muscle_gain: t("Kas yapmak", "Build muscle"),
    general_health: t("Genel sağlık", "General health"),
  };

  const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
    sedentary: t("Hareketsiz", "Sedentary"),
    light: t("Hafif aktif", "Lightly active"),
    moderate: t("Orta aktif", "Moderately active"),
    active: t("Çok aktif", "Very active"),
  };

  const COACH_TONE_LABELS: Record<CoachTone, string> = {
    sicak: t("Sıcak/Nazik", "Warm/Gentle"),
    enerjik: t("Enerjik/Takılan", "Energetic/Playful"),
    notr: t("Nötr", "Neutral"),
  };

  const [goal, setGoal] = useState<Goal | "">("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [coachTone, setCoachTone] = useState<CoachTone>("notr");
  const {
    isSubmitting: isSaving,
    error: profileError,
    success: profileSuccess,
    setSuccess: setProfileSuccess,
    submit: submitProfile,
  } = useFormSubmit();

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form alanlarını paylaşımlı profile her değiştiğinde (ilk yükleme VEYA
  // bu formun kendi başarılı kaydından sonra) senkron tutar.
  useEffect(() => {
    function syncFromProfile() {
      if (!profile) return;
      setGoal(profile.goal ?? "");
      setActivityLevel(profile.activity_level ?? "");
      setDietaryRestrictions(profile.dietary_restrictions ?? "");
      setTargetWeight(profile.target_weight_kg?.toString() ?? "");
      setCoachTone(profile.coach_tone ?? "notr");
    }
    syncFromProfile();
  }, [profile]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await submitProfile(async () => {
      // `undefined` DEĞİL `null` gönderiyoruz: `undefined` JSON.stringify'da
      // silinip alan PATCH gövdesinden hiç çıkmıyor, backend de "gönderilmedi"
      // sayıp dokunmuyor - "Belirtilmemiş" seçilip kaydedilince değişiklik
      // sessizce yok sayılıyordu (kullanıcı bulgusu). `null` gövdede kalıyor,
      // backend bunu gerçek bir temizleme isteği olarak uyguluyor.
      await updateProfileShared({
        goal: goal || null,
        activity_level: activityLevel || null,
        dietary_restrictions: dietaryRestrictions || null,
        target_weight_kg: targetWeight ? Number(targetWeight) : null,
      });
      setProfileSuccess(t("Profil kaydedildi!", "Profile saved!"));
    });
  }

  async function handleExport() {
    if (!token) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const data = await exportUserData(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("Profil", "Profile")}</h1>

      {loadError ? (
        <ErrorBanner
          message={
            loadError === PROFILE_LOAD_FAILED_SENTINEL
              ? t("Profil yüklenemedi.", "Profile could not be loaded.")
              : loadError
          }
        />
      ) : null}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {isFirstTimeSetup ? (
            <InfoBanner
              message={t(
                "Hoş geldin! Koçunun sana özel öneriler sunabilmesi için önce hedefini ve birkaç temel bilgini öğrenelim — aşağıdaki formu doldurup kaydettiğinde sohbete başlayabilirsin.",
                "Welcome! Let's learn your goal and a few basics first so your coach can give you personalized suggestions — once you fill out and save the form below, you can start chatting."
              )}
            />
          ) : null}

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Hesap", "Account")}
            </h2>
            {user ? <p className="text-sm text-zinc-500">{user.email}</p> : null}
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Dil Tercihi", "Language Preference")}
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              {t(
                "Antrenman ve beslenme kutucuklarında egzersiz/besin isimlerinin hangi dilde gösterileceğini/kaydedileceğini belirler, AYRICA sohbetteki koçun sana verdiği yanıtların dilini de belirler (bilgi tabanı içeriği İngilizce'de bile Türkçe kaynaktan çevrilerek aktarılır).",
                "Determines which language exercise/food names are shown/saved in on the workout and nutrition boxes, AND also determines the language your coach replies in during chat (knowledge-base content is translated from its Turkish source even in English)."
              )}
            </p>
            <div className="inline-flex rounded-lg border border-[var(--border-strong)] p-1">
              {(Object.keys(LANGUAGE_LABELS) as PreferredLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  aria-pressed={language === lang}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    language === lang
                      ? "bg-[var(--accent)] text-white"
                      : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
                  }`}
                >
                  {LANGUAGE_LABELS[lang]}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Koç Tonu", "Coach Tone")}
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              {t(
                "Push bildirimlerinin ve haftalık/günlük hatırlatma mesajlarının tonunu belirler.",
                "Determines the tone of your push notifications and weekly/daily reminder messages."
              )}
            </p>
            <div className="inline-flex rounded-lg border border-[var(--border-strong)] p-1">
              {COACH_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => {
                    // Dil Tercihi ile AYNI desen: tıklanınca anında
                    // kaydedilir, ayrı bir "Kaydet" butonu beklenmez -
                    // aksi halde bu ayrı kartta duran chip'ler, kullanıcı
                    // Genel Bilgiler formundaki Kaydet'e basana kadar
                    // kaydedilmemiş gibi yanıltıcı bir izlenim verirdi.
                    setCoachTone(tone);
                    if (token) {
                      updateProfileShared({ coach_tone: tone }).catch(() => {});
                    }
                  }}
                  aria-pressed={coachTone === tone}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    coachTone === tone
                      ? "bg-[var(--accent)] text-white"
                      : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"
                  }`}
                >
                  {COACH_TONE_LABELS[tone]}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Genel Bilgiler", "General Info")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {profileSuccess ? <SuccessBanner message={profileSuccess} /> : null}
              {profileError ? <ErrorBanner message={profileError} /> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="goal">{t("Genel Hedef", "General Goal")}</Label>
                  <Select id="goal" value={goal} onChange={(e) => setGoal(e.target.value as Goal | "")}>
                    <option value="">{t("Belirtilmemiş", "Not specified")}</option>
                    {GOALS.map((g) => (
                      <option key={g} value={g}>
                        {GOAL_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="activityLevel">{t("Aktivite Seviyesi", "Activity Level")}</Label>
                  <Select
                    id="activityLevel"
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value as ActivityLevel | "")}
                  >
                    <option value="">{t("Belirtilmemiş", "Not specified")}</option>
                    {ACTIVITY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {ACTIVITY_LABELS[level]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="dietaryRestrictions">{t("Kısıtlamalar (alerji, vejetaryen vb.)", "Restrictions (allergies, vegetarian, etc.)")}</Label>
                <TextInput
                  id="dietaryRestrictions"
                  value={dietaryRestrictions}
                  onChange={(e) => setDietaryRestrictions(e.target.value)}
                  placeholder={t("opsiyonel", "optional")}
                />
              </div>

              <div>
                <Label htmlFor="targetWeight">{t("Hedef Kilo (kg)", "Target Weight (kg)")}</Label>
                <TextInput
                  id="targetWeight"
                  type="number"
                  min={0}
                  step={0.1}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="max-w-[10rem]"
                  placeholder={t("opsiyonel", "optional")}
                />
              </div>

              <PrimaryButton type="submit" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </form>
          </Card>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <User className="h-3.5 w-3.5" />
            {t(
              'Bunu sohbet üzerinden de belirleyebilirsin (ör. "kilo vermek istiyorum, vejetaryenim", "85 kiloya inmek istiyorum"). Günlük beslenme ve egzersiz hedefleri için Hedefler sayfasına bak.',
              'You can also set this via chat (e.g. "I want to lose weight, I\'m vegetarian", "I want to get down to 85kg"). See the Goals page for daily nutrition and exercise goals.'
            )}
          </div>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("Verilerim", "My Data")}
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              {t(
                "Sohbet, beslenme, egzersiz, ilerleme ve ruh hali kayıtların dahil, sistemde tuttuğumuz tüm verini JSON dosyası olarak indirebilirsin.",
                "You can download all the data we hold about you — including chat, nutrition, exercise, progress, and mood records — as a JSON file."
              )}
            </p>
            {exportError ? <ErrorBanner message={exportError} /> : null}
            <SecondaryButton onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4" />
              {isExporting ? t("Hazırlanıyor...", "Preparing...") : t("Verilerimi İndir", "Download My Data")}
            </SecondaryButton>
          </Card>

          <Card className="border-red-200 dark:border-red-900/50">
            <h2 className="mb-1 text-base font-semibold text-red-700 dark:text-red-400">
              {t("Tehlikeli Bölge", "Danger Zone")}
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              {t(
                "Hesabını silmek kalıcıdır ve geri alınamaz — profilin, sohbet geçmişin, beslenme/egzersiz/ilerleme/ruh hali kayıtların dahil tüm verin kalıcı olarak silinir.",
                "Deleting your account is permanent and cannot be undone — all your data, including your profile, chat history, and nutrition/exercise/progress/mood records, will be permanently deleted."
              )}
            </p>

            {!isDeleteFormOpen ? (
              <SecondaryButton
                onClick={() => setIsDeleteFormOpen(true)}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
                {t("Hesabımı Sil", "Delete My Account")}
              </SecondaryButton>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-3">
                {deleteError ? <ErrorBanner message={deleteError} /> : null}
                <div>
                  <Label htmlFor="deletePassword">{t("Onaylamak için şifreni gir", "Enter your password to confirm")}</Label>
                  <TextInput
                    id="deletePassword"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <PrimaryButton
                    type="submit"
                    disabled={isDeleting || !deletePassword}
                    className="bg-red-600 hover:bg-red-700 hover:shadow-red-600/25"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? t("Siliniyor...", "Deleting...") : t("Kalıcı Olarak Sil", "Delete Permanently")}
                  </PrimaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setIsDeleteFormOpen(false);
                      setDeletePassword("");
                      setDeleteError(null);
                    }}
                  >
                    {t("Vazgeç", "Cancel")}
                  </SecondaryButton>
                </div>
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
