import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PreferredLanguage } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { colors } from "@/components/ui";

const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: "TR",
  en: "EN",
};

/** web/src/components/LanguageToggle.tsx'in mobil portu - kompakt TR/EN
 * geçişi, giriş yapılmamış ekranlarda (login/register) da kullanılabilir
 * çünkü useLanguage() token yokken sadece yerel/cihaz varsayılanını
 * değiştirir, backend'e bir şey yazmaz (bkz. language-context.tsx). */
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.row}>
      {(Object.keys(LANGUAGE_LABELS) as PreferredLanguage[]).map((lang) => (
        <Pressable
          key={lang}
          onPress={() => setLanguage(lang)}
          style={[styles.chip, language === lang && styles.chipActive]}
        >
          <Text style={[styles.chipText, language === lang && styles.chipTextActive]}>
            {LANGUAGE_LABELS[lang]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextActive: {
    color: "#fff",
  },
});
