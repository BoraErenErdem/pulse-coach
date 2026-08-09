import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Download, Trash2, User } from "lucide-react-native";
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
  type PreferredLanguage,
  type Profile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import {
  Card,
  ChipSelect,
  DetailScreen,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  colors,
} from "@/components/ui";

// web/src/app/(app)/profile/page.tsx'in mobil portu - Faz M5.
const LANGUAGE_OPTIONS = ["tr", "en"] as const;
const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "Türkçe",
  en: "English",
};

export default function ProfileScreen() {
  const { token, user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleSubmit() {
    if (!token) return;
    setProfileError(null);
    setProfileSuccess(null);
    setIsSaving(true);
    try {
      await updateProfile(token, {
        goal: goal || undefined,
        activity_level: activityLevel || undefined,
        dietary_restrictions: dietaryRestrictions || undefined,
        target_weight_kg: targetWeight ? Number(targetWeight.replace(",", ".")) : undefined,
      });
      setProfileSuccess(t("Profil kaydedildi!", "Profile saved!"));
      setIsFirstTimeSetup(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
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
      // Web'de <a download> ile tarayıcıya indiriliyordu, RN'de bu API yok -
      // JSON önce yerel bir dosyaya yazılıp expo-sharing'in native paylaşım
      // sayfası (kaydet/gönder) açılıyor.
      const { File, Paths } = await import("expo-file-system");
      const Sharing = await import("expo-sharing");
      const filename = `${t("pulsecoach-verilerim", "pulsecoach-my-data")}-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          dialogTitle: t("Verilerimi Paylaş/Kaydet", "Share/Save My Data"),
        });
      } else {
        setExportError(t(`Dosya oluşturuldu ama paylaşım desteklenmiyor: ${file.uri}`, `File created but sharing isn't supported: ${file.uri}`));
      }
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : t("Veriler indirilemedi, tekrar dener misin?", "Couldn't download data, want to try again?"));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount() {
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
    <DetailScreen title={t("Profil", "Profile")}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <Skeleton height={320} />
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

            <Card>
              <Text style={styles.cardTitle}>{t("Hesap", "Account")}</Text>
              {user ? <Text style={styles.emailText}>{user.email}</Text> : null}
            </Card>

            <Card>
              <Text style={styles.cardTitle}>{t("Dil Tercihi", "Language Preference")}</Text>
              <Text style={styles.hintTextInline}>
                {t(
                  "Antrenman ve beslenme kutucuklarında egzersiz/besin isimlerinin hangi dilde gösterileceğini/kaydedileceğini belirler, AYRICA sohbetteki koçun sana verdiği yanıtların dilini de belirler (bilgi tabanı içeriği İngilizce'de bile Türkçe kaynaktan çevrilerek aktarılır).",
                  "Determines which language exercise/food names are shown/saved in on the workout and nutrition boxes, AND also determines the language your coach replies in during chat (knowledge-base content is translated from its Turkish source even in English)."
                )}
              </Text>
              <ChipSelect
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={setLanguage}
                labels={LANGUAGE_LABELS}
              />
            </Card>

            <Card>
              <Text style={styles.cardTitle}>{t("Genel Bilgiler", "General Info")}</Text>
              {profileSuccess ? <SuccessBanner message={profileSuccess} /> : null}
              {profileError ? <ErrorBanner message={profileError} /> : null}

              <View>
                <FormLabel>{t("Genel Hedef", "General Goal")}</FormLabel>
                <ChipSelect options={GOAL_OPTIONS} value={goal} onChange={setGoal} labels={GOAL_LABELS} />
              </View>

              <View>
                <FormLabel>{t("Aktivite Seviyesi", "Activity Level")}</FormLabel>
                <ChipSelect
                  options={ACTIVITY_OPTIONS}
                  value={activityLevel}
                  onChange={setActivityLevel}
                  labels={ACTIVITY_LABELS}
                />
              </View>

              <View>
                <FormLabel>{t("Kısıtlamalar (alerji, vejetaryen vb.)", "Restrictions (allergies, vegetarian, etc.)")}</FormLabel>
                <FormInput value={dietaryRestrictions} onChangeText={setDietaryRestrictions} placeholder={t("opsiyonel", "optional")} />
              </View>

              <View>
                <FormLabel>{t("Hedef Kilo (kg)", "Target Weight (kg)")}</FormLabel>
                <FormInput
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  keyboardType="number-pad"
                  placeholder={t("opsiyonel", "optional")}
                  style={{ maxWidth: 140 }}
                />
              </View>

              <PrimaryButton onPress={handleSubmit} disabled={isSaving} loading={isSaving}>
                {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </Card>

            <View style={styles.hintRow}>
              <User size={13} color={colors.muted} />
              <Text style={styles.hintText}>
                {t(
                  'Bunu sohbet üzerinden de belirleyebilirsin (ör. "kilo vermek istiyorum, vejetaryenim"). Günlük beslenme ve egzersiz hedefleri için Hedefler sekmesine bak.',
                  'You can also set this via chat (e.g. "I want to lose weight, I\'m vegetarian"). See the Goals tab for daily nutrition and exercise goals.'
                )}
              </Text>
            </View>

            <Card>
              <Text style={styles.cardTitle}>{t("Verilerim", "My Data")}</Text>
              <Text style={styles.hintTextInline}>
                {t(
                  "Sohbet, beslenme, egzersiz, ilerleme ve ruh hali kayıtların dahil, sistemde tuttuğumuz tüm verini JSON dosyası olarak indirebilirsin.",
                  "You can download all the data we hold about you — including chat, nutrition, exercise, progress, and mood records — as a JSON file."
                )}
              </Text>
              {exportError ? <ErrorBanner message={exportError} /> : null}
              <SecondaryButton onPress={handleExport} disabled={isExporting}>
                <Download size={14} color={colors.text} /> {"  "}
                {isExporting ? t("Hazırlanıyor...", "Preparing...") : t("Verilerimi İndir", "Download My Data")}
              </SecondaryButton>
            </Card>

            <Card>
              <Text style={styles.dangerTitle}>{t("Tehlikeli Bölge", "Danger Zone")}</Text>
              <Text style={styles.hintTextInline}>
                {t(
                  "Hesabını silmek kalıcıdır ve geri alınamaz — tüm verin kalıcı olarak silinir.",
                  "Deleting your account is permanent and cannot be undone — all your data will be permanently deleted."
                )}
              </Text>

              {!isDeleteFormOpen ? (
                <SecondaryButton onPress={() => setIsDeleteFormOpen(true)}>
                  <Trash2 size={14} color={colors.error} /> {"  "}
                  <Text style={{ color: colors.error, fontWeight: "600" }}>{t("Hesabımı Sil", "Delete My Account")}</Text>
                </SecondaryButton>
              ) : (
                <View style={{ gap: 10 }}>
                  {deleteError ? <ErrorBanner message={deleteError} /> : null}
                  <View>
                    <FormLabel>{t("Onaylamak için şifreni gir", "Enter your password to confirm")}</FormLabel>
                    <FormInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
                  </View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        onPress={handleDeleteAccount}
                        disabled={isDeleting || !deletePassword}
                        loading={isDeleting}
                      >
                        {isDeleting ? t("Siliniyor...", "Deleting...") : t("Kalıcı Olarak Sil", "Delete Permanently")}
                      </PrimaryButton>
                    </View>
                    <SecondaryButton
                      onPress={() => {
                        setIsDeleteFormOpen(false);
                        setDeletePassword("");
                        setDeleteError(null);
                      }}
                    >
                      {t("Vazgeç", "Cancel")}
                    </SecondaryButton>
                  </View>
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  dangerTitle: { fontSize: 15, fontWeight: "700", color: colors.error },
  emailText: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 },
  hintTextInline: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
