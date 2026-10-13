import { requireOptionalNativeModule } from "expo";
import { Clipboard as CoreClipboard, Platform } from "react-native";

// expo-clipboard yerel modül: onu içermeyen eski bir geliştirme derlemesinde statik
// import uygulamayı açılışta çökertir, bu yüzden dinamik yükleniyor. Modül yoksa
// React Native çekirdeğindeki (kullanımdan kalkmış ama 0.81'de hâlâ gömülü) panoya
// düşülür - yeni derleme alınana kadar kopyalama yine çalışsın diye.
//
// Yerel modülün varlığına import'tan ÖNCE bakılır (2026-10-13, cihazda görüldü):
// paketin kendisi yüklenirken `requireNativeModule` fırlatıyor; hata burada yakalansa da
// Metro modül yükleme hatasını ilk seferde ayrıca bildiriyor ve geliştirme derlemesinde
// kırmızı hata ekranı açılıyordu (kapatıp yeniden deneyince kopyalama çalışıyordu).
function hasExpoClipboard(): boolean {
  return Platform.OS === "web" || requireOptionalNativeModule("ExpoClipboard") != null;
}

export async function copyText(text: string): Promise<boolean> {
  if (hasExpoClipboard()) {
    try {
      const Clipboard = await import("expo-clipboard");
      return await Clipboard.setStringAsync(text);
    } catch {
      // aşağıdaki yedeğe düş
    }
  }
  try {
    CoreClipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
