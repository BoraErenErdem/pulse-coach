import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// expo-haptics web'de zaten no-op ama bazı Android cihazlarda izin/donanım
// eksikse hataya düşebiliyor (bkz. kütüphane issue'ları) - haptik bir "nice
// to have", asla kullanıcı akışını kesmemeli, o yüzden hepsi sessizce yutuluyor.
function safeHaptic(fn: () => Promise<void>) {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
}

/** Hafif dokunuş - küçük onaylar (bir sete eklendi, bir çip seçildi,
 * BottomSheet açıldı). */
export function tapLight(): void {
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Başarı - bir kayıt/oturum/öğün kaydedildi (web'deki yeşil "Kaydedildi!"
 * banner'ının dokunsal karşılığı). */
export function tapSuccess(): void {
  safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Uyarı - geri alınamaz bir eylem (silme, hesap silme onayı). */
export function tapWarning(): void {
  safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
