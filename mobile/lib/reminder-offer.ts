import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getItemAsync, setItemAsync } from "@/lib/storage";

// Hatırlatma teklifi (1.0.2). Bildirim izni önceden YALNIZ Profil > Ayarlar'daki
// düğmeden isteniyordu: canlı veride (2026-11-12) kullanıcıların çoğu oraya hiç
// girmediği için "3 gün açmadın" hatırlatması çoğu telefonda hiç kurulmuyordu.
// Apple'ın önerisi: izni açılışta değil, bağlamında iste. Burada ilk başarılı
// kayıttan (form, ruh hali, sohbetten kayıt, hızlı başlangıç) hemen sonra, cihaz
// başına BİR KEZ, "Yarın hatırlatayım mı?" sayfası açılır; OS izin penceresi
// ancak kullanıcı "Evet" derse gelir (OS penceresi reddedilince bir daha
// gösterilemiyor, kendi sayfamız bu hakkı korur).
// Sayfanın kendisi components/reminder-offer-sheet.tsx (kök düzende tek kopya).

const SHOWN_KEY = "pulsecoach.reminder_offer_shown";
// Kaydın başarı bildirimi/titreşimi ve kapanan form sayfasının animasyonu önce bitsin.
const DEFAULT_DELAY_MS = 1500;

type Listener = () => void;
const listeners = new Set<Listener>();
let scheduled = false;

export function subscribeReminderOffer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bir kayıt başarıyla kaydedildikten sonra çağır. Teklif gösterilecekse true
 * döner (çağıran aynı anda başka bir pencere, ör. değerlendirme, açmasın).
 * Hata fırlatmaz. */
export async function maybeOfferReminders(delayMs = DEFAULT_DELAY_MS): Promise<boolean> {
  if (Platform.OS === "web" || scheduled || listeners.size === 0) return false;
  try {
    if ((await getItemAsync(SHOWN_KEY)) === "1") return false;
    // Zaten izin verilmiş ya da reddedilmiş: sorulacak bir şey yok (reddedilen izin
    // yalnız iOS Ayarlar'dan açılır, Ayarlar ekranındaki düğme bunu anlatıyor).
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "undetermined") return false;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      listeners.forEach((listener) => listener());
    }, delayMs);
    return true;
  } catch {
    return false;
  }
}

/** Sayfa açılınca çağrılır: cevap ne olursa olsun bir daha sorulmaz. */
export async function markReminderOfferShown(): Promise<void> {
  try {
    await setItemAsync(SHOWN_KEY, "1");
  } catch {
    // Saklanamazsa en kötü ihtimalle bir sonraki kayıtta yeniden sorulur.
  }
}
