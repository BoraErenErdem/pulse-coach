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
import { useLanguage } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { lightColors } from "@/components/ui";
import { PulseMark } from "@/components/pulse-mark";
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
  // Kullanıcı bulgusu (2026-09-16, cihazda test): beyaz nabız işareti koyu
  // gradient üzerinde sönük/markayla bağlantısız duruyordu - turuncuya
  // (AUTH_ACCENT, başlıklarla/butonla aynı ton) çevrildi.
  pulseMark: AUTH_ACCENT,
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
  const s = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={[s.topBar, { top: insets.top + 8 }]}>
      <Pressable onPress={toggleTheme} hitSlop={8} style={s.iconPill}>
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
          <Pressable key={lang} onPress={() => setLanguage(lang)} style={[s.langChip, active && s.langChipActive]}>
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
  markSize = 36,
}: {
  size?: number;
  withMark?: boolean;
  markSize?: number;
}) {
  const { palette } = useAuthPalette();
  const s = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={s.brandBlock}>
      {withMark ? <AuthPulseMark size={markSize} /> : null}
      <Text style={[s.wordmark, { fontSize: size }]}>PulseCoach</Text>
    </View>
  );
}

/** Bağımsız (wordmark'tan ayrı) kullanım için - ör. Karşılama ekranının üst
 * kısmına, kullanıcı isteğiyle (2026-09-16) marka metninden ayrılıp büyütülmüş
 * "nabız atıyor" hissi veren tek başına bir işaret olarak. `color` opsiyonel
 * override - Karşılama ekranında turuncu (palet varsayılanı) koyu moddaki
 * canlı turuncu/kırmızı gradient üzerinde SEÇİLEMEZ bulundu (kullanıcı
 * bulgusu, cihazda test), o ekran kendi rengini (beyaz) geçiyor. */
export function AuthPulseMark({ size = 40, color }: { size?: number; color?: string }) {
  const { palette } = useAuthPalette();
  return <PulseMark size={size} color={color ?? palette.pulseMark} animated pulseEveryMs={2000} />;
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
    <Pressable style={s.consentRow} onPress={() => onChange(!checked)} hitSlop={4}>
      <View style={[s.checkbox, checked && s.checkboxChecked]}>{checked ? <Text style={s.checkboxMarkText}>✓</Text> : null}</View>
      <Text style={s.consentText}>{children}</Text>
    </Pressable>
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
    wordmark: {
      color: palette.wordmark,
      textAlign: "center",
      ...authFont("bold"),
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
