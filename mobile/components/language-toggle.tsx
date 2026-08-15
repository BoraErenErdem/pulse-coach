import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PreferredLanguage } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { type ThemeColors, useThemeColors } from "@/components/ui";

const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "TR",
  en: "EN",
};

/** web/src/components/LanguageToggle.tsx'in mobil portu - kompakt TR/EN
 * geçişi, giriş yapılmamış ekranlarda (login/register) da kullanılabilir
 * çünkü useLanguage() token yokken sadece yerel/cihaz varsayılanını
 * değiştirir, backend'e bir şey yazmaz (bkz. language-context.tsx).
 * 2026-08-15: `useThemeColors()`'a geçirildi - login ekranı artık tema-
 * duyarlı (bkz. ThemeToggle ile birlikte kullanıldığı login.tsx), aktif
 * çip `accentSolid`/`onAccentSolid` kullanıyor (WCAG kontrast düzeltmesi,
 * bkz. ui.tsx). */
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={s.row}>
      {(Object.keys(LANGUAGE_LABELS) as PreferredLanguage[]).map((lang) => (
        <Pressable
          key={lang}
          onPress={() => setLanguage(lang)}
          style={[s.chip, language === lang && s.chipActive]}
        >
          <Text style={[s.chipText, language === lang && s.chipTextActive]}>
            {LANGUAGE_LABELS[lang]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    chip: {
      borderRadius: 7,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipActive: {
      backgroundColor: c.accentSolid,
    },
    chipText: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: c.muted,
    },
    chipTextActive: {
      color: c.onAccentSolid,
    },
  });
}
