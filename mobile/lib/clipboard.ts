import { Clipboard as CoreClipboard } from "react-native";

// expo-clipboard yerel modül: onu içermeyen eski bir geliştirme derlemesinde statik
// import uygulamayı açılışta çökertir, bu yüzden dinamik yükleniyor. Modül yoksa
// React Native çekirdeğindeki (kullanımdan kalkmış ama 0.81'de hâlâ gömülü) panoya
// düşülür - yeni derleme alınana kadar kopyalama yine çalışsın diye.
export async function copyText(text: string): Promise<boolean> {
  try {
    const Clipboard = await import("expo-clipboard");
    return await Clipboard.setStringAsync(text);
  } catch {
    // aşağıdaki yedeğe düş
  }
  try {
    CoreClipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
