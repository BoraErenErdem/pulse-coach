import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/language-context";
import { authFont } from "@/lib/fonts";
import { AuthBackground, AuthButton, AuthTopBar, AuthWordmark, useAuthColors } from "@/components/auth-ui";

const BG = require("@/assets/images/auth/welcome-bg.png");

// Tasarımcı arkadaşımızın PNG mockup'ının mobil portu (karşılama ekranı) -
// (auth) grubunun `index` rotası olarak yaşıyor ki Stack.Protected token
// yokken bu grubu render ederken başlangıç ekranı deterministik şekilde bu
// olsun (bkz. login.tsx/register.tsx - artık ayrı ekranlar, önceden tek
// tab'lı bir ekrandı).
export default function WelcomeScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useAuthColors();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <AuthBackground source={BG}>
      <AuthTopBar />
      <View style={[s.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={s.content}>
          <AuthWordmark size={26} withMark />
          <View style={s.copyBlock}>
            <Text style={s.eyebrow}>{t("Hoş geldin", "Welcome")}</Text>
            <Text style={s.title}>
              {t("Ritmini Birlikte Keşfedelim", "Let's Discover Your Rhythm")}
            </Text>
            <Text style={s.subtitle}>
              {t(
                "Antrenmandan ruh haline kendini takip etmek için ihtiyacın olan her şey tek yerde",
                "Everything you need to track your progress from training to mood, all in one place"
              )}
            </Text>
          </View>
          <AuthButton onPress={() => router.push("/register")}>
            {t("Başlayalım", "Let's Get Started")}
          </AuthButton>
        </View>
      </View>
    </AuthBackground>
  );
}

function makeStyles(c: ReturnType<typeof useAuthColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "flex-end",
    },
    content: {
      alignItems: "center",
      gap: 28,
    },
    copyBlock: {
      alignItems: "center",
      gap: 10,
    },
    eyebrow: {
      fontSize: 20,
      color: c.eyebrow,
      ...authFont("regular"),
    },
    title: {
      fontSize: 26,
      color: c.headline,
      textAlign: "center",
      lineHeight: 32,
      ...authFont("bold"),
    },
    subtitle: {
      fontSize: 14,
      color: c.subtitle,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 8,
      ...authFont("regular"),
    },
  });
}
