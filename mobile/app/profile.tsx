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
  type Profile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
const GOAL_OPTIONS = ["", ...GOALS] as const;
const GOAL_LABELS: Record<Goal | "", string> = {
  "": "Belirtilmemiş",
  weight_loss: "Kilo vermek",
  muscle_gain: "Kas yapmak",
  general_health: "Genel sağlık",
};

const ACTIVITY_OPTIONS = ["", ...ACTIVITY_LEVELS] as const;
const ACTIVITY_LABELS: Record<ActivityLevel | "", string> = {
  "": "Belirtilmemiş",
  sedentary: "Hareketsiz",
  light: "Hafif aktif",
  moderate: "Orta aktif",
  active: "Çok aktif",
};

export default function ProfileScreen() {
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
      // Web'de <a download> ile tarayıcıya indiriliyordu, RN'de bu API yok -
      // JSON önce yerel bir dosyaya yazılıp expo-sharing'in native paylaşım
      // sayfası (kaydet/gönder) açılıyor.
      const { File, Paths } = await import("expo-file-system");
      const Sharing = await import("expo-sharing");
      const filename = `pulsecoach-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Verilerimi Paylaş/Kaydet" });
      } else {
        setExportError(`Dosya oluşturuldu ama paylaşım desteklenmiyor: ${file.uri}`);
      }
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Veriler indirilemedi, tekrar dener misin?");
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
      setDeleteError(err instanceof ApiError ? err.message : "Hesap silinemedi, tekrar dener misin?");
      setIsDeleting(false);
    }
  }

  return (
    <DetailScreen title="Profil">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <Skeleton height={320} />
        ) : (
          <>
            {isFirstTimeSetup ? (
              <InfoBanner message="Hoş geldin! Koçunun sana özel öneriler sunabilmesi için önce hedefini ve birkaç temel bilgini öğrenelim." />
            ) : null}

            <Card>
              <Text style={styles.cardTitle}>Hesap</Text>
              {user ? <Text style={styles.emailText}>{user.email}</Text> : null}
            </Card>

            <Card>
              <Text style={styles.cardTitle}>Genel Bilgiler</Text>
              {profileSuccess ? <SuccessBanner message={profileSuccess} /> : null}
              {profileError ? <ErrorBanner message={profileError} /> : null}

              <View>
                <FormLabel>Genel Hedef</FormLabel>
                <ChipSelect options={GOAL_OPTIONS} value={goal} onChange={setGoal} labels={GOAL_LABELS} />
              </View>

              <View>
                <FormLabel>Aktivite Seviyesi</FormLabel>
                <ChipSelect
                  options={ACTIVITY_OPTIONS}
                  value={activityLevel}
                  onChange={setActivityLevel}
                  labels={ACTIVITY_LABELS}
                />
              </View>

              <View>
                <FormLabel>Kısıtlamalar (alerji, vejetaryen vb.)</FormLabel>
                <FormInput value={dietaryRestrictions} onChangeText={setDietaryRestrictions} placeholder="opsiyonel" />
              </View>

              <View>
                <FormLabel>Hedef Kilo (kg)</FormLabel>
                <FormInput
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  keyboardType="number-pad"
                  placeholder="opsiyonel"
                  style={{ maxWidth: 140 }}
                />
              </View>

              <PrimaryButton onPress={handleSubmit} disabled={isSaving} loading={isSaving}>
                {isSaving ? "Kaydediliyor..." : "Kaydet"}
              </PrimaryButton>
            </Card>

            <View style={styles.hintRow}>
              <User size={13} color={colors.muted} />
              <Text style={styles.hintText}>
                Bunu sohbet üzerinden de belirleyebilirsin (ör. &ldquo;kilo vermek istiyorum,
                vejetaryenim&rdquo;). Günlük beslenme ve egzersiz hedefleri için Hedefler
                sekmesine bak.
              </Text>
            </View>

            <Card>
              <Text style={styles.cardTitle}>Verilerim</Text>
              <Text style={styles.hintTextInline}>
                Sohbet, beslenme, egzersiz, ilerleme ve ruh hali kayıtların dahil, sistemde
                tuttuğumuz tüm verini JSON dosyası olarak indirebilirsin.
              </Text>
              {exportError ? <ErrorBanner message={exportError} /> : null}
              <SecondaryButton onPress={handleExport} disabled={isExporting}>
                <Download size={14} color={colors.text} /> {"  "}
                {isExporting ? "Hazırlanıyor..." : "Verilerimi İndir"}
              </SecondaryButton>
            </Card>

            <Card>
              <Text style={styles.dangerTitle}>Tehlikeli Bölge</Text>
              <Text style={styles.hintTextInline}>
                Hesabını silmek kalıcıdır ve geri alınamaz — tüm verin kalıcı olarak silinir.
              </Text>

              {!isDeleteFormOpen ? (
                <SecondaryButton onPress={() => setIsDeleteFormOpen(true)}>
                  <Trash2 size={14} color={colors.error} /> {"  "}
                  <Text style={{ color: colors.error, fontWeight: "600" }}>Hesabımı Sil</Text>
                </SecondaryButton>
              ) : (
                <View style={{ gap: 10 }}>
                  {deleteError ? <ErrorBanner message={deleteError} /> : null}
                  <View>
                    <FormLabel>Onaylamak için şifreni gir</FormLabel>
                    <FormInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
                  </View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        onPress={handleDeleteAccount}
                        disabled={isDeleting || !deletePassword}
                        loading={isDeleting}
                      >
                        {isDeleting ? "Siliniyor..." : "Kalıcı Olarak Sil"}
                      </PrimaryButton>
                    </View>
                    <SecondaryButton
                      onPress={() => {
                        setIsDeleteFormOpen(false);
                        setDeletePassword("");
                        setDeleteError(null);
                      }}
                    >
                      Vazgeç
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
