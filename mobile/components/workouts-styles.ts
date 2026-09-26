// Antrenman sekmesi stilleri (2026-09-26, app/(tabs)/workouts.tsx'ten taşındı - mantık aynı).
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { StyleSheet } from "react-native";
import type { ThemeColors } from "@/components/ui";

export function makeStyles(c: ThemeColors, insetBottom: number, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 16, paddingBottom: 32 + getFloatingTabBarClearance(insetBottom) },
    // İlerleme'yle AYNI başlık tipografisi (bkz. progress.tsx::title notu) -
    // sayfa başlığı Inter Medium 30, eski 22/700Bold'un yerine.
    title: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 4,
    },
    rangeRow: { alignItems: "flex-start", marginBottom: 10 },
    statGridRows: { gap: 10 },
    statGridRow: { flexDirection: "row", gap: 10 },
    // İlerleme'deki AYNI kesin 50/50 ızgara çözümü (bkz. progress.tsx::
    // statTileEqual notu - flexBasis:0+flexGrow:1+minWidth:0).
    statTileEqual: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
    groupLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.4,
    },
    exerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    exerciseRowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: isDark ? "#FFFFFF" : c.text, flexShrink: 1 },
    exerciseRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    exerciseRowMeta: { fontSize: 12 },
    repsWeightRow: { flexDirection: "row", gap: 10 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
    },
    secondaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(245,162,107,0.12)",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    pendingText: { fontSize: 13, color: isDark ? "#FFFFFF" : c.text, flex: 1 },
    hintText: { fontSize: 12 },
    sessionCard: {
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      padding: 12,
    },
    sessionEditRow: { gap: 8 },
    sessionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sessionHeaderText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: isDark ? "#FFFFFF" : c.text,
      flex: 1,
      marginRight: 8,
    },
    // Düzenle/sil/kaydet/iptal ikon butonları: önceden 15px ikon + hitSlop 8
    // (~31px) - 44pt minimumun altındaydı, hitSlop büyütmek de yan yana
    // duran butonların alanlarını ÇAKIŞTIRIRDI (yanlışlıkla sil). Sabit 44x44
    // kutu çakışmaz; negatif dikey marj satır yüksekliğini değiştirmez.
    iconRow: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: -10 },
    iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginVertical: -10 },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    setEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    setEditName: { fontSize: 12 },
    setEditUnit: { fontSize: 11 },
    setLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
    setText: { fontSize: 13, color: isDark ? "#FFFFFF" : c.text },
    // Kullanıcı bulgusu (2026-09-22, üçüncü oturum): "Rekor" rozeti çok
    // soluktu - kök neden İKİ KATLIYDI: (1) dolgu alfası çok düşüktü (%12-18)
    // VE kenarlık YOKTU, (2) yazı 10px'ti - tasarım dilinin kendi kuralı
    // (§2: "küçük yazı ≥11-13px, 10px kullanma") burada ihlal edilmişti.
    // Artık chip formülü (`${hex}xx` dolgu + `${hex}xx` kenarlık, bkz.
    // reference-pulsecoach-design-language §2) JSX'te workoutIds.sessions'tan
    // hesaplanıyor, yazı 11px+Bold oldu.
    recordBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    recordText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    expandSessionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.accent },
  });
}
