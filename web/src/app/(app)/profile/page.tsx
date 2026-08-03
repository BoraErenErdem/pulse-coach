"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Save, Trash2, User } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  ApiError,
  deleteAccount,
  exportUserData,
  GOALS,
  getProfile,
  updateProfile,
  type ActivityLevel,
  type Goal,
  type Profile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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

const GOAL_LABELS: Record<Goal, string> = {
  weight_loss: "Kilo vermek",
  muscle_gain: "Kas yapmak",
  general_health: "Genel sağlık",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Hareketsiz",
  light: "Hafif aktif",
  moderate: "Orta aktif",
  active: "Çok aktif",
};

export default function ProfilePage() {
  const { token, user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [goal, setGoal] = useState<Goal | "">("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const profileData: Profile = await getProfile(token);
      setIsFirstTimeSetup(profileData.goal === null);
      setGoal(profileData.goal ?? "");
      setActivityLevel(profileData.activity_level ?? "");
      setDietaryRestrictions(profileData.dietary_restrictions ?? "");
      setTargetWeight(profileData.target_weight_kg?.toString() ?? "");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function initialLoad() {
      await loadData();
    }
    initialLoad();
  }, [loadData]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setProfileError(null);
    setProfileSuccess(null);
    setIsSaving(true);
    try {
      await updateProfile(token, {
        goal: goal || undefined,
        activity_level: activityLevel || undefined,
        dietary_restrictions: dietaryRestrictions || undefined,
        target_weight_kg: targetWeight ? Number(targetWeight) : undefined,
      });
      setProfileSuccess("Profil kaydedildi!");
      setIsFirstTimeSetup(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Kaydedilemedi, tekrar dener misin?");
    } finally {
      setIsSaving(false);
    }
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
      link.download = `pulsecoach-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Veriler indirilemedi, tekrar dener misin?");
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
      setDeleteError(err instanceof ApiError ? err.message : "Hesap silinemedi, tekrar dener misin?");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Profil</h1>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {isFirstTimeSetup ? (
            <InfoBanner message="Hoş geldin! Koçunun sana özel öneriler sunabilmesi için önce hedefini ve birkaç temel bilgini öğrenelim — aşağıdaki formu doldurup kaydettiğinde sohbete başlayabilirsin." />
          ) : null}

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Hesap
            </h2>
            {user ? <p className="text-sm text-zinc-500">{user.email}</p> : null}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Genel Bilgiler
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {profileSuccess ? <SuccessBanner message={profileSuccess} /> : null}
              {profileError ? <ErrorBanner message={profileError} /> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="goal">Genel Hedef</Label>
                  <Select id="goal" value={goal} onChange={(e) => setGoal(e.target.value as Goal | "")}>
                    <option value="">Belirtilmemiş</option>
                    {GOALS.map((g) => (
                      <option key={g} value={g}>
                        {GOAL_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="activityLevel">Aktivite Seviyesi</Label>
                  <Select
                    id="activityLevel"
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value as ActivityLevel | "")}
                  >
                    <option value="">Belirtilmemiş</option>
                    {ACTIVITY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {ACTIVITY_LABELS[level]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="dietaryRestrictions">Kısıtlamalar (alerji, vejetaryen vb.)</Label>
                <TextInput
                  id="dietaryRestrictions"
                  value={dietaryRestrictions}
                  onChange={(e) => setDietaryRestrictions(e.target.value)}
                  placeholder="opsiyonel"
                />
              </div>

              <div>
                <Label htmlFor="targetWeight">Hedef Kilo (kg)</Label>
                <TextInput
                  id="targetWeight"
                  type="number"
                  min={0}
                  step={0.1}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="max-w-[10rem]"
                  placeholder="opsiyonel"
                />
              </div>

              <PrimaryButton type="submit" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? "Kaydediliyor..." : "Kaydet"}
              </PrimaryButton>
            </form>
          </Card>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <User className="h-3.5 w-3.5" />
            Bunu sohbet üzerinden de belirleyebilirsin (ör. &quot;kilo vermek istiyorum,
            vejetaryenim&quot;, &quot;85 kiloya inmek istiyorum&quot;). Günlük beslenme ve
            egzersiz hedefleri için Hedefler sayfasına bak.
          </div>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Verilerim
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              Sohbet, beslenme, egzersiz, ilerleme ve ruh hali kayıtların dahil, sistemde tuttuğumuz
              tüm verini JSON dosyası olarak indirebilirsin.
            </p>
            {exportError ? <ErrorBanner message={exportError} /> : null}
            <SecondaryButton onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4" />
              {isExporting ? "Hazırlanıyor..." : "Verilerimi İndir"}
            </SecondaryButton>
          </Card>

          <Card className="border-red-200 dark:border-red-900/50">
            <h2 className="mb-1 text-base font-semibold text-red-700 dark:text-red-400">
              Tehlikeli Bölge
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              Hesabını silmek kalıcıdır ve geri alınamaz — profilin, sohbet geçmişin, beslenme/
              egzersiz/ilerleme/ruh hali kayıtların dahil tüm verin kalıcı olarak silinir.
            </p>

            {!isDeleteFormOpen ? (
              <SecondaryButton
                onClick={() => setIsDeleteFormOpen(true)}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
                Hesabımı Sil
              </SecondaryButton>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-3">
                {deleteError ? <ErrorBanner message={deleteError} /> : null}
                <div>
                  <Label htmlFor="deletePassword">Onaylamak için şifreni gir</Label>
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
                    {isDeleting ? "Siliniyor..." : "Kalıcı Olarak Sil"}
                  </PrimaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setIsDeleteFormOpen(false);
                      setDeletePassword("");
                      setDeleteError(null);
                    }}
                  >
                    Vazgeç
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
