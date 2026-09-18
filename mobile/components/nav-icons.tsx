import Svg, { Path } from "react-native-svg";

// Yüzen alt gezinme pilinin boyut sabitleri - TEK kaynaktan (`(tabs)/
// _layout.tsx` pilin kendi stilini bunlardan kurar, diğer sekmeler
// (workouts/nutrition/progress/profile/index) `FLOATING_TAB_BAR_CLEARANCE`
// ile kendi en-alt içeriğinin pilin ALTINDA gizlenmemesi için paddingBottom
// ekler) - `position:"absolute"` pil artık ekran içeriği için otomatik yer
// AYIRMIYOR (bkz. _layout.tsx'teki uzun not), bu payı el ile eklemek
// gerekiyor.
// `FLOATING_TAB_BAR_MARGIN` 12→4→0 (2026-09-19, kullanıcı gerçek iPhone'da
// TURLARCA test ediyor). Kök neden anlayışı: safe-area inset'ini
// (iPhone'da ~34px) TAM saygıyla uygulamak istenen "kenara yapışık pil"
// hissini vermiyor - Instagram/TikTok gibi birçok uygulamanın yüzen alt
// çubuğu da inset'i TAM uygulamıyor, sistemin kendi home-indicator'ı
// (beyaz çubuk) İÇERİĞİN ÜZERİNE bindirilmiş çiziliyor, çakışma olmuyor.
// Bu yüzden `insets.bottom`u SINIRLIYORUZ (`getFloatingTabBarBottomOffset`).
// Sınır değeri 8'de kullanıcı "bu sefer ÇOK aşağıda kaldı, birazcık
// yukarı al" dedi - 8→14 (aradaki ince nokta). 14'te "fena değil ama çok
// çok az daha yukarı al" dedi - 14→18. Android'de (insetBottom zaten ~0)
// davranış hiç değişmiyor.
export const FLOATING_TAB_BAR_HEIGHT = 60;
export function getFloatingTabBarBottomOffset(insetBottom: number): number {
  return Math.min(18, insetBottom);
}
// Cihazın home-indicator safe-area'sı (`insets.bottom`, iPhone'larda ~34,
// çoğu Android'de 0) sabit bir derleme-zamanı değeri OLAMAZ - bu yüzden
// fonksiyon, her ekran KENDİ `useSafeAreaInsets().bottom`'ını geçiyor.
export function getFloatingTabBarClearance(insetBottom: number): number {
  // `+8`: pilin POZİSYONUNA değil, içeriğin pilin ÜST kenarına tam
  // yapışmaması için küçük bir nefes payı.
  return FLOATING_TAB_BAR_HEIGHT + getFloatingTabBarBottomOffset(insetBottom) + 8;
}

// Alt gezinme çubuğu ikonları - arkadaşın gönderdiği chat tasarımı
// (2026-09-18, "pulsecoach pngler/chat/*/icons") lucide yerine Google
// Material Symbols (outlined) path'lerini kullanıyor - "Beslenme" özellikle
// (avokado silüeti) lucide'ın `Apple` ikonundan görsel olarak belirgin
// şekilde farklı, bu yüzden yaklaşık bir eşdeğer yerine tasarımın KENDİ
// SVG path'i buraya taşındı (viewBox 0 -960 960 960, Material Symbols'ın
// standart ızgarası). `AnimatedTabIcon` (bkz. (tabs)/_layout.tsx) bu
// bileşenleri lucide ikonlarıyla AYNI `{ color, size }` imzasıyla çağırıyor
// - o taraf hiç değişmedi.
function MaterialIcon({ path, size, color }: { path: string; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d={path} fill={color} />
    </Svg>
  );
}

const CHAT_PATH =
  "M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z";
const PROGRESS_PATH = "M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z";
const WORKOUT_PATH =
  "m826-585-56-56 30-31-128-128-31 30-57-57 30-31q23-23 57-22.5t57 23.5l129 129q23 23 23 56.5T857-615l-31 30ZM346-104q-23 23-56.5 23T233-104L104-233q-23-23-23-56.5t23-56.5l30-30 57 57-31 30 129 129 30-31 57 57-30 30Zm397-336 57-57-303-303-57 57 303 303ZM463-160l57-58-302-302-58 57 303 303Zm-6-234 110-109-64-64-109 110 63 63Zm63 290q-23 23-57 23t-57-23L104-406q-23-23-23-57t23-57l57-57q23-23 56.5-23t56.5 23l63 63 110-110-63-62q-23-23-23-57t23-57l57-57q23-23 56.5-23t56.5 23l303 303q23 23 23 56.5T857-441l-57 57q-23 23-57 23t-57-23l-62-63-110 110 63 63q23 23 23 56.5T577-161l-57 57Z";
const NUTRITION_PATH =
  "M380-220q66 0 113-46.5T540-380q0-66-47-113t-113-47q-67 0-113.5 47T220-380q0 67 46.5 113.5T380-220Zm0-80q-33 0-56.5-23.5T300-380q0-33 23.5-56.5T380-460q33 0 56.5 23.5T460-380q0 33-23.5 56.5T380-300Zm260 180q88 0 144-56t56-144q0-17-11.5-28.5T800-360q-17 0-28.5 11.5T760-320q0 48-36.5 84T640-200q-17 0-28.5 11.5T600-160q0 17 11.5 28.5T640-120Zm0 80q-51 0-85.5-34.5T520-160q0-50 34.5-85t85.5-35q14 0 27-13t13-27q0-50 34.5-85t85.5-35q50 0 85 35t35 85q0 121-79.5 200.5T640-40ZM380-80q-161 0-230.5-100T80-400q0-75 22.5-159.5t63-155.5Q206-786 261-833t119-47q56 0 105 36t87.5 93.5Q611-693 637-621.5T673-480h-81q-10-60-32-117.5T508.5-700q-29.5-45-63-72.5T380-800q-38 0-77 37t-71 94.5Q200-611 180-540t-20 140q0 81 25 129t60 72.5q35 24.5 72.5 31.5t62.5 7q12 0 27.5-1t32.5-5q-1 20 2 40t11 39q-17 4-35 5.5T380-80Zm0-300Zm320 120Z";
const PROFILE_PATH =
  "M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm146.5-204.5Q340-521 340-580t40.5-99.5Q421-720 480-720t99.5 40.5Q620-639 620-580t-40.5 99.5Q539-440 480-440t-99.5-40.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm100-95.5q47-15.5 86-44.5-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160q53 0 100-15.5ZM523-537q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-43-43Zm0 360Z";

export function ChatNavIcon({ color, size }: { color: string; size: number }) {
  return <MaterialIcon path={CHAT_PATH} size={size} color={color} />;
}
export function ProgressNavIcon({ color, size }: { color: string; size: number }) {
  return <MaterialIcon path={PROGRESS_PATH} size={size} color={color} />;
}
export function WorkoutNavIcon({ color, size }: { color: string; size: number }) {
  return <MaterialIcon path={WORKOUT_PATH} size={size} color={color} />;
}
export function NutritionNavIcon({ color, size }: { color: string; size: number }) {
  return <MaterialIcon path={NUTRITION_PATH} size={size} color={color} />;
}
export function ProfileNavIcon({ color, size }: { color: string; size: number }) {
  return <MaterialIcon path={PROFILE_PATH} size={size} color={color} />;
}
