import { Platform } from "react-native";
import { getItemAsync, setItemAsync } from "@/lib/storage";

// Uygulama içi "değerlendir" penceresi (1.0.1). Apple'ın önerisi: açılışta ya da
// ilk kullanımda değil, kullanıcı uygulamayı benimsedikten sonra ve bir işi
// bitirdiği anda sor. iOS pencereyi yılda en fazla 3 kez gösterir ve göstermeyi
// kendisi de atlayabilir - burada ayrıca kendi seyrek kuralımız var:
// ilk kayıttan >= 7 gün sonra, >= 10 başarılı kayıt, son sorudan >= 120 gün.
// Modül native: DİNAMİK import (eski dev client'ta statik import çökertir).

const FIRST_KEY = "pulsecoach.review_first_log_at";
const COUNT_KEY = "pulsecoach.review_log_count";
const LAST_ASK_KEY = "pulsecoach.review_last_ask_at";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS_SINCE_FIRST = 7;
const MIN_LOGS = 10;
const MIN_DAYS_BETWEEN_ASKS = 120;
// Başarı bildirimi ve titreşim önce görünsün.
const ASK_DELAY_MS = 1500;

/** Bir kayıt (antrenman, öğün, kilo) başarıyla kaydedildikten sonra çağır. Hata fırlatmaz. */
export async function noteSuccessfulLog(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const now = Date.now();
    const first = Number(await getItemAsync(FIRST_KEY)) || 0;
    if (!first) await setItemAsync(FIRST_KEY, String(now));
    const count = (Number(await getItemAsync(COUNT_KEY)) || 0) + 1;
    await setItemAsync(COUNT_KEY, String(count));

    const lastAsk = Number(await getItemAsync(LAST_ASK_KEY)) || 0;
    const engaged = first > 0 && now - first >= MIN_DAYS_SINCE_FIRST * DAY_MS && count >= MIN_LOGS;
    const rested = !lastAsk || now - lastAsk >= MIN_DAYS_BETWEEN_ASKS * DAY_MS;
    if (!engaged || !rested) return;

    const StoreReview = await import("expo-store-review");
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await setItemAsync(LAST_ASK_KEY, String(now));
    setTimeout(() => {
      StoreReview.requestReview().catch(() => {});
    }, ASK_DELAY_MS);
  } catch {
    // Değerlendirme isteği hiçbir zaman kaydı bozmamalı.
  }
}
