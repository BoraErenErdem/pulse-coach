import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Download, Trash2, User } from "lucide-react-native";
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
import { useNotifications } from "@/lib/notifications-context";
import { useProfile } from "@/lib/profile-context";
import { parseLocaleNumber } from "@/lib/format";
import {
  Card,
  ChipSelect,
  DetailScreen,
  ErrorBanner,
  FormInput,
  FormLabel,
  InfoBanner,
  PrimaryButton,
  RevealOnMount,
  SecondaryButton,
  Skeleton,
  SuccessBanner,
  type ThemeColors,
  ToggleRow,
  useThemeColors,
} from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { tapSuccess } from "@/lib/haptics";

// web/src/app/(app)/profile/page.tsx'in mobil portu - Faz M5.
// 2026-08-15 (Faz M2): `app/profile.tsx`'ten `profile-settings.tsx`'e
// taşındı - yeni `(tabs)/profile.tsx` artık "Profil" TAB'ının kendisi
// (gruplandırılmış kısa yollar hub'ı), bu dosya oradaki "Hesap" kartından
// açılan asıl ayarlar ekranı (bkz. redesign planı).
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()` -
// bu ekran o zamana kadar HİÇ tema düzeltmesi görmemişti (koyu modda kırık
// kalıyordu, en görünür sekmelerden biri olmasına rağmen). Hesap silme
// akışı BİLEREK swipe'a geçirilmedi - iki adımlı açık onay, geri alınamaz
// bir işlem için doğru desen kaydırmadan daha güvenli.
const LANGUAGE_OPTIONS = ["tr", "en"] as const;
const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "Türkçe",
  en: "English",
};

export default function ProfileScreen() {
  const { token, user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz, updateProfile de aynı context
  // üzerinden yazıyor ki diğer tüketiciler (chat/goals/progress) yeni bir
  // fetch beklemeden anında güncel veriyi görsün (2026-08-10 mimari borç
  // raporu, bulgu #7).
  const { profile, isLoading, error: loadError, updateProfile: updateProfileShared } = useProfile();
  const { permissionStatus, enablePush, disablePush } = useNotifications();
  const isFirstTimeSetup = profile?.goal === null;

  const COACH_TONE_LABELS: Record<CoachTone, string> = {
    sicak: t("Samimi/Nazik", "Warm/Gentle"),
    enerjik: t("Enerjik/Motivasyon", "Energetic/Motivating"),
    notr: t("Nötr", "Neutral"),
  };

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
  const [coachTone, setCoachTone] = useState<CoachTone>("notr");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isTogglingNotifications, setIsTogglingNotifications] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form alanlarını paylaşımlı profile her değiştiğinde (ilk yükleme VEYA bu
  // formun kendi başarılı kaydından sonra) senkron tutar.
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

  async function handleSubmit() {
    if (!token) return;
    setProfileError(null);
    setProfileSuccess(null);
    setIsSaving(true);
    try {
      // `undefined` DEĞİL `null` gönderiyoruz: `undefined` JSON.stringify'da
      // silinip alan PATCH gövdesinden hiç çıkmıyor, backend de "gönderilmedi"
      // sayıp dokunmuyor - "Belirtilmemiş" seçilip kaydedilince değişiklik
      // sessizce yok sayılıyordu (kullanıcı bulgusu). `null` gövdede kalıyor,
      // backend bunu gerçek bir temizleme isteği olarak uyguluyor.
      await updateProfileShared({
        goal: goal || null,
        activity_level: activityLevel || null,
        dietary_restrictions: dietaryRestrictions || null,
        target_weight_kg: targetWeight ? parseLocaleNumber(targetWeight) : null,
      });
      tapSuccess();
      setProfileSuccess(t("Profil kaydedildi!", "Profile saved!"));
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleNotifications(next: boolean) {
    setNotificationsError(null);
    setIsTogglingNotifications(true);
    try {
      if (next) {
        const granted = await enablePush();
        if (!granted) {
          setNotificationsError(
            t(
              "İzin verilmedi ya da bildirim token'ı alınamadı - cihaz ayarlarından PulseCoach'a bildirim izni verdiğinden emin ol.",
              "Permission wasn't granted or the push token couldn't be obtained - make sure PulseCoach has notification permission in your device settings."
            )
          );
        }
      } else {
        await disablePush();
      }
    } finally {
      setIsTogglingNotifications(false);
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
    <DetailScreen title={t("Hesap", "Account")}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading ? (
          <Skeleton height={320} />
        ) : (
          <RevealOnMount delay={200}>
            {isFirstTimeSetup ? (
              <InfoBanner
                message={t(
                  "Hoş geldin! Koçunun sana özel öneriler sunabilmesi için önce hedefini ve birkaç temel bilgini öğrenelim.",
                  "Welcome! Let's learn your goal and a few basics first so your coach can give you personalized suggestions."
                )}
              />
            ) : null}

            <Card>
              <Text style={s.cardTitle}>{t("Hesap", "Account")}</Text>
              {user ? <Text style={s.emailText}>{user.email}</Text> : null}
            </Card>

            {/* Dil Tercihi + Koç Tonu ÖNCEDEN iki ayrı Card'dı - ikisi de
                basit birer chip-seçici, ayrı kartlarda olma gerekçesi
                zayıftı (2026-08-21 tasarım denetimi: bu ekran kardeşlerine
                göre en yoğun/en uzun olanıydı, 7 kart art arda). Tek
                "Tercihler" kartında birleştirildi - ikisi kendi alt
                başlığını koruyor, sadece dış kart tekilleşti. */}
            <Card>
              <Text style={s.cardTitle}>{t("Tercihler", "Preferences")}</Text>

              <View style={{ gap: 6 }}>
                <Text style={s.subLabel}>{t("Dil Tercihi", "Language Preference")}</Text>
                <Text style={s.hintTextInline}>
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
              </View>

              <View style={s.divider} />

              <View style={{ gap: 6 }}>
                <Text style={s.subLabel}>{t("Koç Tonu", "Coach Tone")}</Text>
                <Text style={s.hintTextInline}>
                  {t(
                    "Koçunun seninle sohbette ve push bildirimlerinde/hatırlatma mesajlarında kullandığı üslubu belirler.",
                    "Determines the tone your coach uses in chat as well as in push notifications and reminder messages."
                  )}
                </Text>
                <ChipSelect
                  options={COACH_TONES}
                  value={coachTone}
                  onChange={(tone) => {
                    // Dil Tercihi ile AYNI desen: seçilince anında kaydedilir,
                    // ayrı bir "Kaydet" butonu beklenmez.
                    setCoachTone(tone);
                    if (token) {
                      updateProfileShared({ coach_tone: tone }).catch(() => {});
                    }
                  }}
                  labels={COACH_TONE_LABELS}
                />
              </View>
            </Card>

            <Card>
              <Text style={s.cardTitle}>{t("Bildirimler", "Notifications")}</Text>
              <Text style={s.hintTextInline}>
                {t(
                  "Yeni kişisel rekor, hedefe ulaşma ve haftalık/günlük check-in mesajları için push bildirimi al.",
                  "Get push notifications for new personal records, reaching goals, and weekly/daily check-in messages."
                )}
              </Text>
              {notificationsError ? <ErrorBanner message={notificationsError} /> : null}
              <ToggleRow
                label={t("Bildirimleri Aç", "Enable Notifications")}
                value={permissionStatus === "granted"}
                onChange={handleToggleNotifications}
              />
              {isTogglingNotifications ? <Skeleton height={20} /> : null}
            </Card>

            <Card>
              <Text style={s.cardTitle}>{t("Genel Bilgiler", "General Info")}</Text>
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
                <View style={{ maxWidth: 200 }}>
                  <Stepper value={targetWeight} onChangeText={setTargetWeight} step={0.5} min={0} allowDecimal placeholder={t("opsiyonel", "optional")} />
                </View>
              </View>

              <PrimaryButton onPress={handleSubmit} disabled={isSaving} loading={isSaving}>
                {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
              </PrimaryButton>
            </Card>

            <View style={s.hintRow}>
              <User size={13} color={c.muted} />
              <Text style={s.hintText}>
                {t(
                  'Bunu sohbet üzerinden de belirleyebilirsin (ör. "kilo vermek istiyorum, vejetaryenim"). Günlük beslenme ve egzersiz hedefleri için Hedefler sekmesine bak.',
                  'You can also set this via chat (e.g. "I want to lose weight, I\'m vegetarian"). See the Goals tab for daily nutrition and exercise goals.'
                )}
              </Text>
            </View>

            <Card>
              <Text style={s.cardTitle}>{t("Verilerim", "My Data")}</Text>
              <Text style={s.hintTextInline}>
                {t(
                  "Sohbet, beslenme, egzersiz, ilerleme ve ruh hali kayıtların dahil, sistemde tuttuğumuz tüm verini JSON dosyası olarak indirebilirsin.",
                  "You can download all the data we hold about you — including chat, nutrition, exercise, progress, and mood records — as a JSON file."
                )}
              </Text>
              {exportError ? <ErrorBanner message={exportError} /> : null}
              <SecondaryButton onPress={handleExport} disabled={isExporting}>
                <Download size={14} color={c.text} /> {"  "}
                {isExporting ? t("Hazırlanıyor...", "Preparing...") : t("Verilerimi İndir", "Download My Data")}
              </SecondaryButton>
            </Card>

            <Card>
              <Text style={s.dangerTitle}>{t("Tehlikeli Bölge", "Danger Zone")}</Text>
              <Text style={s.hintTextInline}>
                {t(
                  "Hesabını silmek kalıcıdır ve geri alınamaz — tüm verin kalıcı olarak silinir.",
                  "Deleting your account is permanent and cannot be undone — all your data will be permanently deleted."
                )}
              </Text>

              {!isDeleteFormOpen ? (
                <SecondaryButton onPress={() => setIsDeleteFormOpen(true)}>
                  <Trash2 size={14} color={c.error} /> {"  "}
                  <Text style={{ color: c.error, fontFamily: "Inter_600SemiBold" }}>{t("Hesabımı Sil", "Delete My Account")}</Text>
                </SecondaryButton>
              ) : (
                <View style={{ gap: 10 }}>
                  {deleteError ? <ErrorBanner message={deleteError} /> : null}
                  <View>
                    <FormLabel>{t("Onaylamak için şifreni gir", "Enter your password to confirm")}</FormLabel>
                    <FormInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
                  </View>
                  <View style={s.row}>
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
          </RevealOnMount>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, gap: 16, paddingBottom: 32 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text },
    dangerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.error },
    emailText: { fontSize: 13, color: c.muted },
    row: { flexDirection: "row", gap: 10, alignItems: "center" },
    hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
    hintText: { flex: 1, fontSize: 12, color: c.muted, lineHeight: 17 },
    hintTextInline: { fontSize: 12, color: c.muted, lineHeight: 17 },
    // "Tercihler" kartındaki iki alt bölümü (Dil/Koç Tonu) ayıran ince
    // çizgi - goals.tsx'teki AYNI desen.
    divider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    subLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.text },
  });
}
