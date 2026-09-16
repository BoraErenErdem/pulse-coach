import { Platform } from "react-native";

type Weight = "regular" | "medium" | "semibold" | "bold";

const INTER: Record<Weight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

const SYSTEM_WEIGHT: Record<Weight, "400" | "500" | "600" | "700"> = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
};

/** Karşılama/Kaydol/Giriş ekranları için istenen "SF Pro Display" - Apple'ın
 * font lisansı bu fontun üçüncü taraf uygulamalara gömülüp Android/web'e
 * dağıtılmasını yasaklıyor (yalnızca Apple platformlarının OS düzeyinde
 * kullanımına izin veriyor). iOS'ta zaten hiçbir fontFamily belirtmeden
 * sistem fontu San Francisco/SF Pro olduğu için, iOS'ta gerçek SF Pro
 * Display'i (System + fontWeight) kullanıyoruz; Android/web'de projede
 * zaten yüklü olan Inter'e (SF Pro'ya en yakın lisanslı/özgür alternatif)
 * düşüyoruz. */
export function authFont(weight: Weight): { fontFamily?: string; fontWeight?: "400" | "500" | "600" | "700" } {
  if (Platform.OS === "ios") {
    return { fontWeight: SYSTEM_WEIGHT[weight] };
  }
  return { fontFamily: INTER[weight] };
}
