// Beslenme sekmesi stilleri (2026-09-26, app/(tabs)/nutrition.tsx'ten taşındı - mantık aynı).
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { StyleSheet } from "react-native";
import type { ThemeColors } from "@/components/ui";

export function makeStyles(c: ThemeColors, insetBottom: number, isDark: boolean) {
  const text = isDark ? "#FFFFFF" : c.text;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { padding: 16, gap: 16, paddingBottom: 32 + getFloatingTabBarClearance(insetBottom) },
    // İlerleme/Antrenman'la AYNI başlık tipografisi.
    title: { fontSize: 30, fontFamily: "Inter_500Medium", color: c.text, marginBottom: 4 },
    row: { flexDirection: "row", gap: 10 },
    hintText: { fontSize: 13, lineHeight: 19 },
    outlineButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    outlineButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    // `textTransform: "uppercase"` web'de "PAZARTESI" üretiyordu (Türkçe İ
    // kaybı, bkz. CLAUDE.md "Turkish casing") - büyütme JS'te yerel ayarla.
    groupLabel: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.4 },
    dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    dayKcal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    mealHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
    mealIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    mealTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: text },
    mealKcal: { fontSize: 14, fontFamily: "Inter_700Bold" },
    mealAdd: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    mealEmpty: { fontSize: 12, marginTop: 1 },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)",
      borderRadius: 14,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 10,
    },
    entryEditRow: { flex: 1, gap: 8 },
    entryEditControls: { flexDirection: "row", alignItems: "center", gap: 6 },
    entryName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: text },
    entryMealTag: { fontSize: 12, fontFamily: "Inter_500Medium" },
    entryMeta: { fontSize: 13 },
    entryUnit: { fontSize: 13 },
    entryNutrients: { fontSize: 12, lineHeight: 17 },
    // 44pt dokunma kutusu (Antrenman'daki AYNI çözüm): negatif dikey marj satır
    // yüksekliğini büyütmüyor, sabit kutu yan yana düğmelerde çakışmıyor.
    iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginVertical: -8 },
    photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    photoPreview: { width: 88, height: 88, borderRadius: 14, backgroundColor: c.surfaceMuted },
    clearHit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
    clearText: { fontSize: 13, textDecorationLine: "underline" },
    analyzingRow: { paddingVertical: 8 },
    reviewItemBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(245,162,107,0.35)",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)",
      padding: 12,
      gap: 10,
    },
    reviewDetected: { fontSize: 12, lineHeight: 17 },
    reviewSave: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 44,
      borderRadius: 14,
    },
    reviewSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    reviewDiscard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
    },
    reviewDiscardText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    uncertainRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    uncertainText: { flex: 1, fontSize: 12, lineHeight: 17 },
    reviewError: { fontSize: 12, color: c.error },
    photoGallery: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  });
}
