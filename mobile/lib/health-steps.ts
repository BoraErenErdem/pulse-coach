import { Platform } from "react-native";
import { getItemAsync, setItemAsync, deleteItemAsync } from "@/lib/storage";
import { localDateKey } from "@/lib/api";

// Apple Sağlık'tan günlük adım (2026-11-06). Kütüphane DİNAMİK içe aktarılır:
// kurulu dev client'ta native modül yoksa statik import uygulamayı açılışta
// çökertir (bkz. CLAUDE.md Gotchas). Web/Android'de hiç yüklenmez.
//
// HealthKit gizlilik gereği OKUMA izninin verilip verilmediğini söylemez -
// reddedilmişse sorgu hata vermez, yalnız boş döner. Bu yüzden "bağlı" durumu
// kullanıcının bağlan düğmesine basmasıyla cihazda tutulur; veri gelmezse kart
// izni Sağlık uygulamasından açmayı önerir.

const CONNECTED_KEY = "pulsecoach.steps_connected";
const STEP_COUNT = "HKQuantityTypeIdentifierStepCount" as const;

type HealthKit = typeof import("@kingstinct/react-native-healthkit");

let modulePromise: Promise<HealthKit | null> | null = null;

function loadHealthKit(): Promise<HealthKit | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  modulePromise ??= import("@kingstinct/react-native-healthkit").then(
    (mod) => mod,
    () => null
  );
  return modulePromise;
}

/** Bu cihazda Apple Sağlık kullanılabilir mi (iPhone + native modül kurulu). */
export async function isStepSourceAvailable(): Promise<boolean> {
  const hk = await loadHealthKit();
  if (!hk) return false;
  try {
    return await hk.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

export async function isStepsConnected(): Promise<boolean> {
  return (await getItemAsync(CONNECTED_KEY)) === "1";
}

/** İzin penceresini açar (yalnız adım OKUMA). Kullanıcı reddetse de true dönebilir - bkz. dosya başı. */
export async function connectSteps(): Promise<boolean> {
  const hk = await loadHealthKit();
  if (!hk) return false;
  await hk.requestAuthorization({ toRead: [STEP_COUNT] });
  await setItemAsync(CONNECTED_KEY, "1");
  return true;
}

export async function disconnectSteps(): Promise<void> {
  await deleteItemAsync(CONNECTED_KEY);
}

export interface DeviceStepDay {
  date: string; // YYYY-MM-DD, cihazın yerel günü
  steps: number;
}

/** Son `days` günün (bugün dahil) günlük adım toplamları. HKStatisticsCollection
 * iPhone + Apple Watch örneklerini çift saymadan birleştirir. Verisi olmayan
 * günler listede yer almaz. */
export async function readDailySteps(days = 7): Promise<DeviceStepDay[]> {
  const hk = await loadHealthKit();
  if (!hk) return [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const results = await hk.queryStatisticsCollectionForQuantity(STEP_COUNT, ["cumulativeSum"], start, { day: 1 }, {
    filter: { date: { startDate: start } },
    unit: "count",
  });
  const out: DeviceStepDay[] = [];
  for (const r of results) {
    const steps = r.sumQuantity?.quantity;
    if (!r.startDate || steps === undefined) continue;
    out.push({ date: localDateKey(new Date(r.startDate)), steps: Math.round(steps) });
  }
  return out;
}
