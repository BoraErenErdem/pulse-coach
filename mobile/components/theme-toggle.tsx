import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Moon, Sun } from "lucide-react-native";
import { useTheme } from "@/lib/theme-context";
import { useThemeColors, type ThemeColors } from "@/components/ui";

// web/src/components/ThemeToggle.tsx'in mobil portu - aynı ikon deseni
// (Sun/Moon), web'de NavBar'da yaşıyordu ama mobilde paylaşımlı bir üst bar
// yok (bkz. redesign planı - tab ekranlarının kendi başlığı yok). Faz 1
// kapsamında Sohbet sekmesinin üstüne, MoodPicker'ın hemen üzerine eklendi -
// aksi halde kullanıcının koyu/açık temayı elle değiştirmesinin HİÇBİR yolu
// olmazdı (sadece ilk açılışta OS tercihine bakılıyor, bkz. theme-context.tsx).
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const isDark = theme === "dark";

  return (
    <Pressable onPress={toggleTheme} hitSlop={8} style={s.button}>
      {isDark ? <Sun size={16} color={c.text} /> : <Moon size={16} color={c.text} />}
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    button: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
