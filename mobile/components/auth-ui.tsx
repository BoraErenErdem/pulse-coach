import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextInputProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Moon, Sun } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PreferredLanguage } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { lightColors } from "@/components/ui";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { authFont } from "@/lib/fonts";

// Arkadaşımızın tasarımcının PNG tasarımlarının (karşılama/kaydol/giriş
// ekranları) mobil portu. Bu ekranlar tasarım gereği koyu modda uygulamanın
// genel `useThemeColors()` paletini KULLANMIYOR (marka gradient fotoğrafı
// üzerine kurulu, kendi sabit paleti var) - ama kullanıcı isteğiyle
// (2026-09-16) bir AÇIK mod eklendi: uygulamanın zaten var olan
// `useTheme()`/`ThemeProvider`sı (bkz. lib/theme-context.tsx) burada da
// kullanılıyor, açık moddaki renkler ui.tsx::lightColors'tan (kırık beyaz +
// turuncu marka paleti) TÜRETİLİYOR - yeni bir renk sistemi icat etmek yerine
// tek kaynağa bağlı kalındı. Koyu modda PNG fotoğraf arkaplan, açık modda düz
// `lightColors.background` kullanılıyor (PNG'ler yalnızca koyu sürüm için
// tasarlandı, açık modda ANLAMSIZ olurdu).
export const AUTH_ACCENT = "#FF7A45";
const WHITE = "#FFFFFF";

interface AuthPalette {
  background: string;
  wordmark: string;
  eyebrow: string;
  headline: string;
  subtitle: string;
  fieldLabel: string;
  fieldBg: string;
  fieldBorder: string;
  fieldText: string;
  placeholder: string;
  keyboardAppearance: "dark" | "light";
  buttonGradient: [string, string];
  buttonText: string;
  checkboxBorder: string;
  checkboxChecked: string;
  checkboxMark: string;
  consentText: string;
  consentLink: string;
  bannerErrorBg: string;
  bannerErrorBorder: string;
  bannerErrorText: string;
  bannerSuccessBg: string;
  bannerSuccessBorder: string;
  bannerSuccessText: string;
  bottomLinkText: string;
  bottomLinkAction: string;
  pillBg: string;
  pillBorder: string;
  pillTextInactive: string;
  pillActiveBg: string;
  pillTextActive: string;
  pulseMark: string;
  badgeBg: string;
}

const DARK_PALETTE: AuthPalette = {
  background: "#170D08",
  wordmark: WHITE,
  eyebrow: WHITE,
  headline: AUTH_ACCENT,
  subtitle: "rgba(255,255,255,0.85)",
  fieldLabel: "rgba(255,255,255,0.92)",
  fieldBg: "rgba(255,255,255,0.16)",
  fieldBorder: "rgba(255,255,255,0.28)",
  fieldText: WHITE,
  placeholder: "rgba(255,255,255,0.5)",
  keyboardAppearance: "dark",
  buttonGradient: ["#D2571F", "#96350F"],
  buttonText: WHITE,
  checkboxBorder: "rgba(255,255,255,0.5)",
  checkboxChecked: AUTH_ACCENT,
  checkboxMark: WHITE,
  consentText: "rgba(255,255,255,0.72)",
  consentLink: AUTH_ACCENT,
  bannerErrorBg: "rgba(226,88,77,0.18)",
  bannerErrorBorder: "rgba(226,88,77,0.4)",
  bannerErrorText: "#FFD9D4",
  bannerSuccessBg: "rgba(87,179,123,0.18)",
  bannerSuccessBorder: "rgba(87,179,123,0.4)",
  bannerSuccessText: "#D4F5E0",
  bottomLinkText: "rgba(255,255,255,0.72)",
  bottomLinkAction: AUTH_ACCENT,
  pillBg: "rgba(0,0,0,0.28)",
  pillBorder: "rgba(255,255,255,0.2)",
  pillTextInactive: "rgba(255,255,255,0.7)",
  pillActiveBg: AUTH_ACCENT,
  pillTextActive: WHITE,
  // Kullanıcı bulgusu (2026-09-16, cihazda test, birkaç tur): beyaz nabız
  // işareti koyu gradient üzerinde sönük duruyordu, sade turuncu (AUTH_ACCENT)
  // da ekranın kendi canlı gradient'i üzerinde SEÇİLEMEZ bulundu - çözüm
  // `AuthBrandBadge`in koyu "squircle" zemini (bkz. badgeBg) + bu zemine karşı
  // net duran daha doygun bir turuncu (#FF9142).
  pulseMark: "#FF9142",
  badgeBg: "rgba(90,20,10,0.4)",
};

// lightColors (ui.tsx) = uygulamanın açık temasında zaten kullanılan "kırık
// beyaz arkaplan + turuncu vurgu" paleti - kullanıcının istediği "kırık beyaz
// ve turuncu yoğunluktaki açık renkler" birebir bu.
const LIGHT_PALETTE: AuthPalette = {
  background: lightColors.background,
  wordmark: lightColors.text,
  eyebrow: lightColors.muted,
  headline: lightColors.accentSolid,
  subtitle: lightColors.muted,
  fieldLabel: lightColors.text,
  fieldBg: lightColors.surfaceInput,
  fieldBorder: lightColors.border,
  fieldText: lightColors.text,
  placeholder: lightColors.muted,
  keyboardAppearance: "light",
  buttonGradient: [lightColors.accentSolid, lightColors.accentSolidHover],
  buttonText: lightColors.onAccentSolid,
  checkboxBorder: lightColors.borderStrong,
  checkboxChecked: lightColors.accentSolid,
  checkboxMark: lightColors.onAccentSolid,
  consentText: lightColors.muted,
  consentLink: lightColors.accentSolid,
  bannerErrorBg: lightColors.errorBg,
  bannerErrorBorder: "rgba(196,43,43,0.28)",
  bannerErrorText: lightColors.error,
  bannerSuccessBg: lightColors.successBg,
  bannerSuccessBorder: "rgba(62,143,92,0.28)",
  bannerSuccessText: lightColors.success,
  bottomLinkText: lightColors.muted,
  bottomLinkAction: lightColors.accentSolid,
  pillBg: lightColors.surface,
  pillBorder: lightColors.border,
  pillTextInactive: lightColors.muted,
  pillActiveBg: lightColors.accentSolid,
  pillTextActive: lightColors.onAccentSolid,
  pulseMark: lightColors.accentSolid,
  badgeBg: "rgba(184,72,31,0.12)",
};

function useAuthPalette(): { palette: AuthPalette; isDark: boolean } {
  const { theme } = useTheme();
  return { palette: theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE, isDark: theme === "dark" };
}

export function AuthBackground({
  source,
  children,
}: {
  source: ImageSourcePropType;
  children: ReactNode;
}) {
  const { palette, isDark } = useAuthPalette();
  if (!isDark) {
    return <View style={[styles.bg, { backgroundColor: palette.background }]}>{children}</View>;
  }
  return (
    <ImageBackground source={source} resizeMode="cover" style={[styles.bg, { backgroundColor: palette.background }]}>
      {children}
    </ImageBackground>
  );
}

export function AuthTopBar() {
  const insets = useSafeAreaInsets();
  const { palette, isDark } = useAuthPalette();
  const { toggleTheme } = useTheme();
  const t = useT();
  const s = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={[s.topBar, { top: insets.top + 8 }]}>
      <Pressable
        onPress={toggleTheme}
        hitSlop={8}
        style={s.iconPill}
        accessibilityRole="button"
        accessibilityLabel={isDark ? t("Açık temaya geç", "Switch to light theme") : t("Koyu temaya geç", "Switch to dark theme")}
      >
        {isDark ? <Sun size={15} color={palette.wordmark} /> : <Moon size={15} color={palette.wordmark} />}
      </Pressable>
      <AuthLangSwitch />
    </View>
  );
}

function AuthLangSwitch() {
  const { language, setLanguage } = useLanguage();
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const options: PreferredLanguage[] = ["tr", "en"];
  return (
    <View style={s.langRow}>
      {options.map((lang) => {
        const active = language === lang;
        return (
          <Pressable
            key={lang}
            onPress={() => setLanguage(lang)}
            style={[s.langChip, active && s.langChipActive]}
            accessibilityRole="button"
            accessibilityLabel={lang === "tr" ? "Türkçe" : "English"}
            aria-selected={active}
          >
            <Text style={[s.langChipText, active && s.langChipTextActive]}>{lang.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AuthWordmark({
  size = 24,
  withMark = false,
  markSize = 56,
}: {
  size?: number;
  withMark?: boolean;
  markSize?: number;
}) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={s.brandBlock}>
      {withMark ? <AuthBrandBadge size={markSize} /> : null}
      {/* Yazı tipi boyutu ölçüsü korunuyor: büyük harf bloğu ~0.8 x size. */}
      <BrandWordmark height={Math.round(size * 0.8)} color={palette.wordmark} />
    </View>
  );
}

/** Marka rozeti: koyu "squircle" zemin (Karşılama'da kullanıcı onaylı rozet, 2026-09-16) üzerinde
 * arkadaşın P logosu (2026-10-07, önceden nabız işareti). Nabız artık logo değil, hareket
 * motifi (yükleniyor/koç avatarı). `size` = rozetin kenarı. */
export function AuthBrandBadge({ size = 64 }: { size?: number }) {
  const { palette } = useAuthPalette();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="PulseCoach"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: palette.badgeBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandMark size={Math.round(size * 0.56)} color={palette.pulseMark} />
    </View>
  );
}

export function AuthField({
  label,
  rightSlot,
  ...inputProps
}: TextInputProps & { label: string; rightSlot?: ReactNode }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={s.fieldGroup}>
      <View style={s.fieldLabelRow}>
        <Text style={s.fieldLabel}>{label}</Text>
        {rightSlot}
      </View>
      <TextInput
        placeholderTextColor={palette.placeholder}
        keyboardAppearance={palette.keyboardAppearance}
        {...inputProps}
        style={[s.fieldInput, inputProps.style]}
      />
    </View>
  );
}

export function AuthButton({
  children,
  onPress,
  disabled,
  loading,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.buttonWrap, (disabled || loading || pressed) && { opacity: 0.75 }]}
      accessibilityRole="button"
      aria-disabled={!!(disabled || loading)}
      aria-busy={!!loading}
    >
      <LinearGradient colors={palette.buttonGradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.button}>
        {loading ? <ActivityIndicator color={palette.buttonText} style={{ marginRight: 8 }} /> : null}
        <Text style={s.buttonText}>{children}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function AuthCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    // Rol + durum: yoksa VoiceOver/TalkBack onay kutusunu duyuramıyor, kullanıcı
    // rızaları veremeyip kayıt olamıyordu (canlı test 2026-10-06).
    <Pressable
      style={s.consentRow}
      onPress={() => onChange(!checked)}
      hitSlop={4}
      accessibilityRole="checkbox"
      aria-checked={checked}
    >
      <View style={[s.checkbox, checked && s.checkboxChecked]}>{checked ? <Text style={s.checkboxMarkText}>✓</Text> : null}</View>
      <Text style={s.consentText}>{children}</Text>
    </Pressable>
  );
}

/** Üç zorunlu onay: aydınlatma teyidi (rıza DEĞİL - Kurul 2018/90), sağlık verisi
 * açık rızası, Kullanım Koşulları -  - register.tsx ve
 * oauth-consent.tsx (Google/Apple ile YENİ kayıt) arasında BİREBİR aynı
 * metin/link gerekiyordu (2026-09-16, ikinci kopyalama noktası eklenirken
 * tek yere çıkarıldı - bkz. o iki dosyadaki kullanım). `router` dışarıdan
 * alınıyor çünkü bu bileşen expo-router'a bağımlı olmak yerine çağıran
 * ekranın zaten sahip olduğu router örneğini kullanıyor. */
export function AuthConsentGroup({
  kvkkConsent,
  onKvkkConsentChange,
  healthDataConsent,
  onHealthDataConsentChange,
  termsConsent,
  onTermsConsentChange,
  onNavigate,
}: {
  kvkkConsent: boolean;
  onKvkkConsentChange: (next: boolean) => void;
  healthDataConsent: boolean;
  onHealthDataConsentChange: (next: boolean) => void;
  termsConsent: boolean;
  onTermsConsentChange: (next: boolean) => void;
  onNavigate: (href: { pathname: "/kvkk"; params: { section: string } } | "/terms") => void;
}) {
  const t = useT();
  return (
    <>
      <AuthCheckbox checked={kvkkConsent} onChange={onKvkkConsentChange}>
        <AuthConsentLink onPress={() => onNavigate({ pathname: "/kvkk", params: { section: "aydinlatma" } })}>
          {t("Aydınlatma Metni", "Privacy Notice")}
        </AuthConsentLink>
        {t("'ni okudum ve bilgilendirildim.", " — I have read it and been informed.")}
      </AuthCheckbox>
      <AuthCheckbox checked={healthDataConsent} onChange={onHealthDataConsentChange}>
        {t(
          "Sağlık verilerimin (antrenman, beslenme, vücut ölçümleri, ruh hâli vb.) ",
          "I give my explicit consent to the processing of my health data (workouts, nutrition, body measurements, mood, etc.) as described in the "
        )}
        <AuthConsentLink onPress={() => onNavigate({ pathname: "/kvkk", params: { section: "saglik-verisi" } })}>
          {t("Açık Rıza Metni", "Explicit Consent Text")}
        </AuthConsentLink>
        {t("'nde belirtildiği şekilde işlenmesine açık rıza veriyorum.", ".")}
      </AuthCheckbox>
      <AuthCheckbox checked={termsConsent} onChange={onTermsConsentChange}>
        {t("18 yaşından büyüğüm; ", "I am 18 or older and I accept the ")}
        <AuthConsentLink onPress={() => onNavigate("/terms")}>{t("Kullanım Koşulları", "Terms of Service")}</AuthConsentLink>
        {t(
          "'nı (yapay zekâ koçun tıbbi tavsiye yerine geçmediği dahil) okudum ve kabul ediyorum.",
          ", including that the AI coach does not replace medical advice."
        )}
      </AuthCheckbox>
    </>
  );
}

export function AuthConsentLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <Text style={s.consentLink} onPress={onPress}>
      {children}
    </Text>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={[s.banner, s.bannerError]}>
      <Text style={s.bannerErrorText}>{message}</Text>
    </View>
  );
}

export function AuthSuccessBanner({ message }: { message: string }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={[s.banner, s.bannerSuccess]}>
      <Text style={s.bannerSuccessText}>{message}</Text>
    </View>
  );
}

export function AuthBottomLink({ prefix, linkText, onPress }: { prefix: string; linkText: string; onPress: () => void }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <Text style={s.bottomLinkRow}>
      {prefix} <Text onPress={onPress} style={s.bottomLinkAction}>{linkText}</Text>
    </Text>
  );
}

export function AuthTextLink({ children, onPress, align = "left" }: { children: ReactNode; onPress: () => void; align?: "left" | "center" }) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <Text onPress={onPress} style={[s.textLink, { textAlign: align }]}>
      {children}
    </Text>
  );
}

/** Ekranlara özgü metinler (ör. "Giriş Yap" başlığı, "Şifremi unuttum" linki)
 * için tema-duyarlı renk paleti - her ekran dosyası kendi StyleSheet'inde
 * fontSize/layout'u tutar, rengi buradan alır. */
export function useAuthColors(): AuthPalette {
  return useAuthPalette().palette;
}

function makeStyles(palette: AuthPalette) {
  return StyleSheet.create({
    topBar: {
      position: "absolute",
      right: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      zIndex: 10,
    },
    iconPill: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.pillBg,
      borderWidth: 1,
      borderColor: palette.pillBorder,
    },
    langRow: {
      flexDirection: "row",
      backgroundColor: palette.pillBg,
      borderRadius: 10,
      padding: 3,
      gap: 2,
      borderWidth: 1,
      borderColor: palette.pillBorder,
    },
    langChip: {
      borderRadius: 7,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    langChipActive: {
      backgroundColor: palette.pillActiveBg,
    },
    langChipText: {
      fontSize: 12,
      ...authFont("bold"),
      color: palette.pillTextInactive,
    },
    langChipTextActive: {
      color: palette.pillTextActive,
    },
    brandBlock: {
      alignItems: "center",
      gap: 10,
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    fieldLabel: {
      fontSize: 14,
      color: palette.fieldLabel,
      ...authFont("medium"),
    },
    fieldInput: {
      height: 52,
      borderRadius: 14,
      paddingHorizontal: 16,
      backgroundColor: palette.fieldBg,
      borderWidth: 1,
      borderColor: palette.fieldBorder,
      color: palette.fieldText,
      fontSize: 15,
      ...authFont("regular"),
    },
    buttonWrap: {
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 4,
    },
    button: {
      height: 54,
      paddingHorizontal: 32,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: {
      color: palette.buttonText,
      fontSize: 16,
      ...authFont("bold"),
    },
    consentRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: palette.checkboxBorder,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: palette.checkboxChecked,
      borderColor: palette.checkboxChecked,
    },
    checkboxMarkText: {
      color: palette.checkboxMark,
      fontSize: 13,
      ...authFont("bold"),
    },
    consentText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      color: palette.consentText,
      ...authFont("regular"),
    },
    consentLink: {
      color: palette.consentLink,
      ...authFont("semibold"),
    },
    banner: {
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
    },
    bannerError: {
      backgroundColor: palette.bannerErrorBg,
      borderColor: palette.bannerErrorBorder,
    },
    bannerErrorText: {
      color: palette.bannerErrorText,
      fontSize: 13,
      ...authFont("medium"),
    },
    bannerSuccess: {
      backgroundColor: palette.bannerSuccessBg,
      borderColor: palette.bannerSuccessBorder,
    },
    bannerSuccessText: {
      color: palette.bannerSuccessText,
      fontSize: 13,
      ...authFont("medium"),
    },
    bottomLinkRow: {
      textAlign: "center",
      fontSize: 14,
      color: palette.bottomLinkText,
      ...authFont("regular"),
    },
    bottomLinkAction: {
      color: palette.bottomLinkAction,
      ...authFont("bold"),
    },
    textLink: {
      fontSize: 13,
      color: palette.bottomLinkAction,
      ...authFont("bold"),
    },
  });
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
