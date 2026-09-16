import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { authFont } from "@/lib/fonts";
import { AuthBackground, AuthButton, AuthPulseMark, AuthTopBar, AuthWordmark, useAuthColors } from "@/components/auth-ui";

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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <AuthBackground source={BG}>
      <AuthTopBar />
      <View style={s.topMark}>
        <View style={s.markWrap}>
          <View
            style={[
              s.markGlow,
              { backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(184,72,31,0.12)" },
            ]}
          />
          {/* Kullanıcı bulgusu (cihazda test, 2026-09-16): koyu modda paletin
              turuncu vurgusu bu ekranın kendi canlı turuncu/kırmızı gradient'i
              üzerinde neredeyse görünmez oluyordu - beyaza geçildi, ışık
              modunda ise turuncu (palet varsayılanı) kırık beyaz zeminde zaten
              net görünüyordu, değiştirilmedi. */}
          <AuthPulseMark size={112} color={isDark ? "#FFFFFF" : undefined} />
        </View>
      </View>
      <View style={[s.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={s.content}>
          <AuthWordmark size={26} />
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
    topMark: {
      position: "absolute",
      left: 0,
      right: 0,
      top: "30%",
      alignItems: "center",
    },
    markWrap: {
      width: 172,
      height: 172,
      alignItems: "center",
      justifyContent: "center",
    },
    markGlow: {
      position: "absolute",
      width: 172,
      height: 172,
      borderRadius: 86,
    },
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
