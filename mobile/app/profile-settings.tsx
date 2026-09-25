import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  Bell,
  ChevronRight,
  Download,
  FileText,
  Info,
  Lock,
  Mail,
  Minus,
  Moon,
  Palette,
  Plus,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Target,
  Trash2,
  UserRound,
} from "lucide-react-native";
import {
  ACTIVITY_LEVELS,
  ApiError,
  COACH_TONES,
  deleteAccount,
  exportUserData,
  GOALS,
  MAX_DIETARY_RESTRICTIONS_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  type ActivityLevel,
  type CoachTone,
  type Goal,
  type PreferredLanguage,
  type ProfileUpdatePayload,
} from "@/lib/api";
import { useAppLock } from "@/lib/app-lock-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { toLocaleUpper } from "@/lib/format";
import { useNotifications } from "@/lib/notifications-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { tapLight, tapSuccess } from "@/lib/haptics";
import {
  DetailScreen,
  ErrorBanner,
  FormInput,
  InfoBanner,
  Skeleton,
  SuccessBanner,
  type ThemeColors,
  useThemeColors,
} from "@/components/ui";
import { GlassShell } from "@/components/progress-cards";
import { PROFILE_SURFACE_TONE, SurfaceToneProvider, useRampColor } from "@/components/surface-tone";
import { SegmentToggle } from "@/components/nutrition-cards";
import { useProfileAccent } from "@/components/profile-identity";

// Profil > Hesap ve Ayarlar (2026-09-25 redesign, Profil ametist kimliğinde).
// Önceden 7 soğuk kart art arda ve iki farklı kaydetme davranışı (bazı çipler
// anında, Genel Bilgiler Kaydet düğmesiyle) aynı ekranda karışıyordu. Artık:
// - SEÇİMLER anında kaydedilir (hedef, aktivite, koç tonu, dil, tema, bildirim),
// - METİN alanları (görünen ad, hassasiyetler) tek bir Kaydet ile - düğme ancak
//   bir değişiklik varken belirir.
// Sıra: Hakkında -> Hedef ve Koç -> Görünüm -> Bildirimler -> Gizlilik ->
// Verilerim -> Uygulama -> Tehlikeli Bölge (ayrık, kırmızı).
// Hassasiyet/kısıtlama notu (alerji vb.) kullanıcıya ait veridir: form mevcut
// değeri aynen yükler, sadece kullanıcı değiştirip kaydederse güncellenir.

const CONTACT_EMAIL = "pulsecoach26@gmail.com";
const DEFAULT_NUDGE_HOUR = 18;
const LANGUAGE_LABELS: Record<PreferredLanguage, string> = { tr: "Türkçe", en: "English" };

function usePanelText() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return { isDark, c, text: isDark ? "#FFFFFF" : c.text, muted: isDark ? "rgba(255,255,255,0.75)" : c.muted };
}

function Panel({
  icon,
  title,
  tag,
  toneFrom,
  toneTo,
  children,
}: {
  icon: ReactNode;
  title: string;
  tag?: string;
  toneFrom: number;
  toneTo: number;
  children: ReactNode;
}) {
  const p = usePanelText();
  const ramp = useRampColor();
  const accent = useProfileAccent();
  return (
    <GlassShell gradient={[ramp(toneFrom), ramp(toneTo)]} lightFill="rgba(255,255,255,0.85)" radius={22} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} subtle>
      <View style={styles.panelBody}>
        <View style={styles.panelHeader}>
          <View style={[styles.panelIcon, { backgroundColor: `${accent.graphic}26`, borderColor: `${accent.graphic}55` }]}>{icon}</View>
          <Text style={[styles.panelTitle, { color: p.text }]}>{title}</Text>
          {tag ? <Text style={[styles.panelTag, { color: accent.text }]}>{tag}</Text> : null}
        </View>
        {children}
      </View>
    </GlassShell>
  );
}

/** Sarılan seçim çipleri - seçili olan ametist dolgu. */
function ChoiceChips<K extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly K[];
  value: K;
  onChange: (next: K) => void;
  labels: Record<K, string>;
}) {
  const p = usePanelText();
  const accent = useProfileAccent();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => {
              if (on) return;
              tapLight();
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[
              styles.chip,
              on
                ? { backgroundColor: p.isDark ? `${accent.graphic}40` : accent.fill, borderColor: p.isDark ? accent.graphic : accent.fill }
                : { backgroundColor: p.isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)", borderColor: p.isDark ? "rgba(255,255,255,0.14)" : p.c.border },
            ]}
          >
            <Text style={[styles.chipText, { color: on ? (p.isDark ? "#FFFFFF" : accent.onFill) : p.text }]}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SubLabel({ children, hint }: { children: string; hint?: string }) {
  const p = usePanelText();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.subLabel, { color: p.text }]}>{children}</Text>
      {hint ? <Text style={[styles.hint, { color: p.muted }]}>{hint}</Text> : null}
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const p = usePanelText();
  const accent = useProfileAccent();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.switchLabel, { color: p.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: p.muted }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          tapLight();
          onChange(next);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: p.isDark ? "rgba(255,255,255,0.22)" : "#D6CFC2", true: accent.graphic }}
        thumbColor="#FFFFFF"
        // RN Web açıkken başparmağı varsayılan camgöbeğine boyuyor (activeThumbColor).
        {...(Platform.OS === "web" ? ({ activeThumbColor: "#FFFFFF" } as object) : {})}
      />
    </View>
  );
}

function LinkRow({ icon, label, hint, onPress }: { icon: ReactNode; label: string; hint?: string; onPress: () => void }) {
  const p = usePanelText();
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[styles.switchLabel, { color: p.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: p.muted }]}>{hint}</Text> : null}
      </View>
      <ChevronRight size={18} color={p.muted} />
    </Pressable>
  );
}

function Divider() {
  const p = usePanelText();
  return <View style={[styles.divider, { backgroundColor: p.isDark ? "rgba(255,255,255,0.10)" : "rgba(36,29,20,0.08)" }]} />;
}

export default function ProfileSettingsScreen() {
  return (
    <SurfaceToneProvider tone={PROFILE_SURFACE_TONE}>
      <SettingsScreen />
    </SurfaceToneProvider>
  );
}

function SettingsScreen() {
  const { token, user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const p = usePanelText();
  const accent = useProfileAccent();
  const router = useRouter();
  const s = useMemo(() => makeStyles(c, p.isDark), [c, p.isDark]);
  const { profile, isLoading, error: loadError, updateProfile } = useProfile();
  const { permissionStatus, enablePush, disablePush } = useNotifications();
  const { isSupported: isAppLockSupported, isEnabled: isAppLockEnabled, setEnabled: setAppLockEnabled } = useAppLock();
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
  const COACH_TONE_LABELS: Record<CoachTone, string> = {
    sicak: t("Samimi", "Warm"),
    enerjik: t("Enerjik", "Energetic"),
    notr: t("Nötr", "Neutral"),
  };

  // ---- metin alanları (tek Kaydet)
  const [displayName, setDisplayName] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [textSaved, setTextSaved] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [isSavingText, setIsSavingText] = useState(false);
  useEffect(() => {
    // Profil her değiştiğinde (ilk yükleme ya da kayıt sonrası) formu senkronla.
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setRestrictions(profile.dietary_restrictions ?? "");
  }, [profile]);
  const isTextDirty =
    !!profile &&
    (displayName.trim() !== (profile.display_name ?? "") || restrictions.trim() !== (profile.dietary_restrictions ?? ""));

  async function saveText() {
    setTextError(null);
    setTextSaved(null);
    setIsSavingText(true);
    try {
      await updateProfile({ display_name: displayName.trim() || null, dietary_restrictions: restrictions.trim() || null });
      tapSuccess();
      setTextSaved(t("Kaydedildi!", "Saved!"));
    } catch (err) {
      setTextError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSavingText(false);
    }
  }

  // ---- anında kaydedilen seçimler
  const [prefError, setPrefError] = useState<string | null>(null);
  async function savePreference(payload: ProfileUpdatePayload) {
    setPrefError(null);
    try {
      await updateProfile(payload);
    } catch (err) {
      setPrefError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    }
  }

  // ---- hatırlatma saati (hızlı art arda +/- tek istekte birleşsin)
  const [nudgeHour, setNudgeHour] = useState<number | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bekleyen (zamanlanmış ya da yolda) yerel değişiklik sayısı: varken profil
  // senkronu atlanır - yoksa yoldaki eski kaydın yanıtı, kullanıcının o arada
  // yaptığı daha yeni seçimi ekranda ezip DB ile ekranı ayrıştırıyordu (canlı
  // testte bulundu: 18'den ++ sonra -- yapılınca ekran/DB farklı saat).
  const pendingNudge = useRef(0);
  useEffect(() => {
    if (pendingNudge.current > 0) return;
    setNudgeHour(profile?.daily_nudge_hour ?? null);
  }, [profile?.daily_nudge_hour]);
  useEffect(() => () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
  }, []);
  function changeNudgeHour(next: number | null) {
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
  const shownHour = nudgeHour ?? DEFAULT_NUDGE_HOUR;

  // ---- push
  const [pushError, setPushError] = useState<string | null>(null);
  const [isTogglingPush, setIsTogglingPush] = useState(false);
  async function togglePush(next: boolean) {
    setPushError(null);
    setIsTogglingPush(true);
    try {
      if (next) {
        const granted = await enablePush();
        if (!granted) {
          setPushError(
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
      setIsTogglingPush(false);
    }
  }

  // ---- verilerim
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function handleExport() {
    if (!token) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const data = await exportUserData(token);
      // RN'de <a download> yok - JSON yerel dosyaya yazılıp paylaşım sayfası açılır.
      const { File, Paths } = await import("expo-file-system");
      const Sharing = await import("expo-sharing");
      const filename = `${t("pulsecoach-verilerim", "pulsecoach-my-data")}-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: t("Verilerimi Paylaş/Kaydet", "Share/Save My Data") });
      } else {
        setExportError(t(`Dosya oluşturuldu ama paylaşım desteklenmiyor: ${file.uri}`, `File created but sharing isn't supported: ${file.uri}`));
      }
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : t("Veriler indirilemedi, tekrar dener misin?", "Couldn't download data, want to try again?"));
    } finally {
      setIsExporting(false);
    }
  }

  // ---- hesap silme (iki adımlı, şifre onaylı - bilerek kaydırmaya geçirilmedi)
  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const themeOptions = useMemo(
    () =>
      [
        { key: "system" as ThemePreference, label: t("Sistem", "System"), icon: (color: string) => <Smartphone size={15} color={color} /> },
        { key: "light" as ThemePreference, label: t("Açık", "Light"), icon: (color: string) => <Sun size={15} color={color} /> },
        { key: "dark" as ThemePreference, label: t("Koyu", "Dark"), icon: (color: string) => <Moon size={15} color={color} /> },
      ] as const,
    [t]
  );
  const languageOptions = useMemo(
    () => (["tr", "en"] as const).map((key) => ({ key, label: LANGUAGE_LABELS[key] })),
    []
  );
  const segmentColors = useMemo(() => ({ accent: accent.graphic, fill: accent.fill, onFill: accent.onFill }), [accent]);
  const instantTag = toLocaleUpper(t("anında kaydedilir", "saved instantly"), language);
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const iconColor = accent.text;
  const filledCount = [profile?.goal, profile?.activity_level, profile?.dietary_restrictions].filter(Boolean).length;

  return (
    <DetailScreen title={t("Hesap ve Ayarlar", "Account & Settings")} subtitle={user?.email} glowHeight={300}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {loadError ? <ErrorBanner message={loadError} /> : null}

        {isLoading || !profile ? (
          <>
            <Skeleton height={220} />
            <Skeleton height={260} />
          </>
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

            <Panel icon={<UserRound size={17} color={iconColor} />} title={t("Hakkında", "About You")} toneFrom={0} toneTo={0.14}>
              {textSaved ? <SuccessBanner message={textSaved} /> : null}
              {textError ? <ErrorBanner message={textError} /> : null}
              <View style={{ gap: 6 }}>
                <SubLabel hint={t("Karşılamada e-postan yerine bu ad görünür.", "Shown in greetings instead of your email.")}>
                  {t("Görünen Ad", "Display Name")}
                </SubLabel>
                <FormInput
                  value={displayName}
                  onChangeText={(value) => {
                    setDisplayName(value);
                    setTextSaved(null);
                  }}
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  placeholder={t("opsiyonel", "optional")}
                  style={s.input}
                  accessibilityLabel={t("Görünen ad", "Display name")}
                />
              </View>
              <View style={{ gap: 6 }}>
                <SubLabel
                  hint={t(
                    "Alerjiler, hassasiyetler, beslenme tercihleri - koçun önerilerinde dikkate alır.",
                    "Allergies, sensitivities, diet preferences - your coach takes them into account."
                  )}
                >
                  {t("Hassasiyetler ve Kısıtlamalar", "Sensitivities & Restrictions")}
                </SubLabel>
                <TextInput
                  value={restrictions}
                  onChangeText={(value) => {
                    setRestrictions(value);
                    setTextSaved(null);
                  }}
                  maxLength={MAX_DIETARY_RESTRICTIONS_LENGTH}
                  multiline
                  placeholder={t("ör. fıstık alerjisi, laktozsuz, vejetaryen", "e.g. peanut allergy, lactose-free, vegetarian")}
                  placeholderTextColor={p.muted}
                  style={[s.input, s.textArea, { color: p.text }]}
                  accessibilityLabel={t("Hassasiyetler ve kısıtlamalar", "Sensitivities and restrictions")}
                />
                <Text style={[styles.counter, { color: p.muted }]}>
                  {restrictions.length}/{MAX_DIETARY_RESTRICTIONS_LENGTH}
                </Text>
              </View>
              {isTextDirty ? (
                <View style={styles.saveRow}>
                  <Pressable
                    onPress={() => {
                      setDisplayName(profile.display_name ?? "");
                      setRestrictions(profile.dietary_restrictions ?? "");
                    }}
                    style={[styles.ghostButton, { borderColor: p.isDark ? "rgba(255,255,255,0.2)" : c.border }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ghostText, { color: p.text }]}>{t("Vazgeç", "Discard")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveText}
                    disabled={isSavingText}
                    style={[styles.primaryButton, { backgroundColor: accent.fill, opacity: isSavingText ? 0.7 : 1 }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.primaryText, { color: accent.onFill }]}>
                      {isSavingText ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Panel>

            <Panel icon={<SlidersHorizontal size={17} color={iconColor} />} title={t("Hedef ve Koç", "Goal & Coach")} tag={instantTag} toneFrom={0.14} toneTo={0.3}>
              {prefError ? <ErrorBanner message={prefError} /> : null}
              {isFirstTimeSetup ? (
                <View style={{ gap: 4 }}>
                  <View style={[styles.progressTrack, { backgroundColor: p.isDark ? "rgba(255,255,255,0.14)" : c.border }]}>
                    <View style={[styles.progressFill, { width: `${(filledCount / 3) * 100}%`, backgroundColor: accent.graphic }]} />
                  </View>
                  <Text style={[styles.hint, { color: p.muted }]}>{t(`Profilin ${filledCount}/3 tamam`, `${filledCount}/3 fields done`)}</Text>
                </View>
              ) : null}
              <View style={{ gap: 8 }}>
                <SubLabel>{t("Genel Hedef", "General Goal")}</SubLabel>
                <ChoiceChips
                  options={GOAL_OPTIONS}
                  value={profile.goal ?? ""}
                  onChange={(next) => void savePreference({ goal: next || null })}
                  labels={GOAL_LABELS}
                />
              </View>
              <View style={{ gap: 8 }}>
                <SubLabel>{t("Aktivite Seviyesi", "Activity Level")}</SubLabel>
                <ChoiceChips
                  options={ACTIVITY_OPTIONS}
                  value={profile.activity_level ?? ""}
                  onChange={(next) => void savePreference({ activity_level: next || null })}
                  labels={ACTIVITY_LABELS}
                />
              </View>
              <View style={{ gap: 8 }}>
                <SubLabel hint={t("Sohbette ve bildirimlerde kullandığı üslup.", "The tone used in chat and notifications.")}>
                  {t("Koç Tonu", "Coach Tone")}
                </SubLabel>
                <ChoiceChips
                  options={COACH_TONES}
                  value={profile.coach_tone ?? "notr"}
                  onChange={(next) => void savePreference({ coach_tone: next })}
                  labels={COACH_TONE_LABELS}
                />
              </View>
              <View style={{ gap: 8 }}>
                <SubLabel hint={t("Arayüz, egzersiz/besin adları ve koç yanıtları.", "Interface, exercise/food names and coach replies.")}>
                  {t("Dil", "Language")}
                </SubLabel>
                <SegmentToggle options={languageOptions} value={language} onChange={setLanguage} colors={segmentColors} />
              </View>
              <Divider />
              <LinkRow
                icon={<Target size={18} color={iconColor} />}
                label={t("Hedef Merkezi", "Goal Center")}
                hint={t("Kilo, antrenman ve beslenme hedeflerin", "Your body, workout and nutrition goals")}
                onPress={() => router.push("/goals")}
              />
            </Panel>

            <Panel icon={<Palette size={17} color={iconColor} />} title={t("Görünüm", "Appearance")} tag={instantTag} toneFrom={0.3} toneTo={0.42}>
              <SegmentToggle options={themeOptions} value={themePreference} onChange={setThemePreference} colors={segmentColors} />
              <Text style={[styles.hint, { color: p.muted }]}>
                {themePreference === "system"
                  ? t("Telefonunun açık/koyu ayarını izler.", "Follows your phone's light/dark setting.")
                  : t("Uygulama her zaman bu temada açılır.", "The app always opens in this theme.")}
              </Text>
            </Panel>

            <Panel icon={<Bell size={17} color={iconColor} />} title={t("Bildirimler", "Notifications")} tag={instantTag} toneFrom={0.42} toneTo={0.58}>
              {pushError ? <ErrorBanner message={pushError} /> : null}
              <SwitchRow
                label={t("Anlık bildirimler", "Push notifications")}
                hint={t("Rekor, hedef ve koç mesajları telefonuna gelsin.", "Records, goals and coach messages on your phone.")}
                value={permissionStatus === "granted"}
                onChange={(next) => void togglePush(next)}
                disabled={isTogglingPush}
              />
              <Divider />
              <SwitchRow
                label={t("Haftalık ilerleme özeti", "Weekly progress summary")}
                hint={t("Pazar günü koçundan haftanın özeti (e-posta dahil).", "Your coach's weekly recap on Sunday (email included).")}
                value={profile.weekly_summary_enabled}
                onChange={(next) => void savePreference({ weekly_summary_enabled: next })}
              />
              <Divider />
              <SwitchRow
                label={t("Günlük hatırlatma", "Daily reminder")}
                hint={t("Ruh hali ya da öğün kaydı eksikse, en fazla 3 günde bir.", "When mood or meals are missing, at most every 3 days.")}
                value={profile.daily_nudge_enabled}
                onChange={(next) => void savePreference({ daily_nudge_enabled: next })}
              />
              {profile.daily_nudge_enabled ? (
                <View style={styles.hourRow}>
                  <Text style={[styles.hint, { color: p.muted, flex: 1 }]}>{t("Hatırlatma saati", "Reminder time")}</Text>
                  <Pressable
                    onPress={() => {
                      tapLight();
                      changeNudgeHour((shownHour + 23) % 24);
                    }}
                    style={[styles.hourButton, { borderColor: `${accent.graphic}77`, backgroundColor: `${accent.graphic}22` }]}
                    accessibilityRole="button"
                    accessibilityLabel={t("Bir saat erken", "One hour earlier")}
                  >
                    <Minus size={18} color={p.isDark ? "#FFFFFF" : accent.text} />
                  </Pressable>
                  <Text style={[styles.hourValue, { color: p.text }]} accessibilityLiveRegion="polite">
                    {`${String(shownHour).padStart(2, "0")}:00`}
                  </Text>
                  <Pressable
                    onPress={() => {
                      tapLight();
                      changeNudgeHour((shownHour + 1) % 24);
                    }}
                    style={[styles.hourButton, { borderColor: `${accent.graphic}77`, backgroundColor: `${accent.graphic}22` }]}
                    accessibilityRole="button"
                    accessibilityLabel={t("Bir saat geç", "One hour later")}
                  >
                    <Plus size={18} color={p.isDark ? "#FFFFFF" : accent.text} />
                  </Pressable>
                </View>
              ) : null}
            </Panel>

            <Panel icon={<Shield size={17} color={iconColor} />} title={t("Gizlilik", "Privacy")} toneFrom={0.58} toneTo={0.7}>
              {isAppLockSupported ? (
                <>
                  <SwitchRow
                    label={t("Uygulama kilidi", "App lock")}
                    hint={t("Açılışta biyometrik/PIN doğrulaması iste.", "Require biometric/PIN verification on open.")}
                    value={isAppLockEnabled}
                    onChange={(next) => setAppLockEnabled(next).catch(() => {})}
                  />
                  <Divider />
                </>
              ) : null}
              <LinkRow icon={<Lock size={18} color={iconColor} />} label={t("Gizlilik ve KVKK", "Privacy & KVKK")} onPress={() => router.push("/kvkk")} />
              <Divider />
              <LinkRow icon={<FileText size={18} color={iconColor} />} label={t("Kullanım Koşulları", "Terms of Service")} onPress={() => router.push("/terms")} />
            </Panel>

            <Panel icon={<Download size={17} color={iconColor} />} title={t("Verilerim", "My Data")} toneFrom={0.7} toneTo={0.8}>
              <Text style={[styles.hint, { color: p.muted }]}>
                {t(
                  "Tüm verini (profil, sohbet, beslenme, egzersiz, ilerleme, ruh hali) JSON olarak indir.",
                  "Download all your data (profile, chat, nutrition, exercise, progress, mood) as JSON."
                )}
              </Text>
              {exportError ? <ErrorBanner message={exportError} /> : null}
              <Pressable
                onPress={handleExport}
                disabled={isExporting}
                style={[styles.outlineButton, { borderColor: `${accent.graphic}99`, opacity: isExporting ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                <Download size={16} color={p.isDark ? "#FFFFFF" : accent.text} />
                <Text style={[styles.outlineText, { color: p.isDark ? "#FFFFFF" : accent.text }]}>
                  {isExporting ? t("Hazırlanıyor...", "Preparing...") : t("Verilerimi İndir", "Download My Data")}
                </Text>
              </Pressable>
            </Panel>

            <Panel icon={<Info size={17} color={iconColor} />} title={t("Uygulama", "App")} toneFrom={0.8} toneTo={0.9}>
              <LinkRow
                icon={<Mail size={18} color={iconColor} />}
                label={t("Geri bildirim gönder", "Send feedback")}
                hint={CONTACT_EMAIL}
                onPress={() => {
                  const subject = encodeURIComponent(`PulseCoach ${version} - ${t("Geri bildirim", "Feedback")}`);
                  Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`).catch(() => {});
                }}
              />
              <Divider />
              <Text style={[styles.hint, { color: p.muted }]}>{t(`PulseCoach sürüm ${version}`, `PulseCoach version ${version}`)}</Text>
            </Panel>

            <View style={[styles.danger, { borderColor: `${c.error}55`, backgroundColor: p.isDark ? "rgba(226,88,77,0.08)" : "rgba(196,43,43,0.05)" }]}>
              <Text style={[styles.dangerTitle, { color: c.error }]}>{t("Tehlikeli Bölge", "Danger Zone")}</Text>
              <Text style={[styles.hint, { color: p.muted }]}>
                {t(
                  "Hesabını silmek kalıcıdır ve geri alınamaz — tüm verin kalıcı olarak silinir.",
                  "Deleting your account is permanent and cannot be undone — all your data will be permanently deleted."
                )}
              </Text>
              {!isDeleteFormOpen ? (
                <Pressable
                  onPress={() => setIsDeleteFormOpen(true)}
                  style={[styles.outlineButton, { borderColor: `${c.error}88` }]}
                  accessibilityRole="button"
                >
                  <Trash2 size={16} color={c.error} />
                  <Text style={[styles.outlineText, { color: c.error }]}>{t("Hesabımı Sil", "Delete My Account")}</Text>
                </Pressable>
              ) : (
                <View style={{ gap: 10 }}>
                  {deleteError ? <ErrorBanner message={deleteError} /> : null}
                  <Text style={[styles.subLabel, { color: p.text }]}>{t("Onaylamak için şifreni gir", "Enter your password to confirm")}</Text>
                  <FormInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry style={s.input} />
                  <View style={styles.saveRow}>
                    <Pressable
                      onPress={() => {
                        setIsDeleteFormOpen(false);
                        setDeletePassword("");
                        setDeleteError(null);
                      }}
                      style={[styles.ghostButton, { borderColor: p.isDark ? "rgba(255,255,255,0.2)" : c.border }]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.ghostText, { color: p.text }]}>{t("Vazgeç", "Cancel")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDeleteAccount}
                      disabled={isDeleting || !deletePassword}
                      style={[styles.primaryButton, { backgroundColor: c.error, opacity: isDeleting || !deletePassword ? 0.55 : 1 }]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.primaryText, { color: "#FFFFFF" }]}>
                        {isDeleting ? t("Siliniyor...", "Deleting...") : t("Kalıcı Olarak Sil", "Delete Permanently")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </DetailScreen>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { padding: 16, gap: 14, paddingBottom: 40 },
    input: {
      backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "#FFFFFF",
      borderColor: isDark ? "rgba(255,255,255,0.14)" : c.border,
      color: isDark ? "#FFFFFF" : c.text,
    },
    textArea: {
      minHeight: 84,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      textAlignVertical: "top",
    },
  });
}

const styles = StyleSheet.create({
  panelBody: { padding: 18, gap: 14 },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  panelIcon: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  panelTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  panelTag: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  subLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  counter: { fontSize: 12, alignSelf: "flex-end" },
  saveRow: { flexDirection: "row", gap: 10 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  ghostButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  outlineButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, borderRadius: 14, borderWidth: 1.5 },
  outlineText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  switchLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  divider: { height: 1 },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hourButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hourValue: { fontSize: 18, fontFamily: "Inter_600SemiBold", minWidth: 58, textAlign: "center" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  danger: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 12 },
  dangerTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
