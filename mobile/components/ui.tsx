import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigationState } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { MoodKey, PreferredLanguage, WorkoutType } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { PulseMark } from "@/components/pulse-mark";

// Redesign (2026-08-15): bu dosya önceden BİLİNÇLİ olarak minimal/işlevsel
// bırakılmıştı ("kapsamlı görsel tasarım kullanıcının 3. adımına bırakıldı" -
// bkz. proje belleği). Bu, o adım. Web'in olgun `ui.tsx`'iyle aynı token
// mantığı: web CSS custom property + `.dark` sınıfıyla çalışıyordu, RN'de
// runtime CSS yok - bu yüzden burada iki sabit palet (`lightColors`/
// `darkColors`) + bir `useThemeColors()` hook'u var.
// GÜNCEL DURUM (2026-08-21 görsel tutarlılık taraması ile doğrulandı): "Faz 1
// kapsamı dışındaki ekranlar hâlâ statik `colors` kullanıyor" notu ARTIK
// GEÇERSİZ - tüm ekranlar (Antrenman/Beslenme/Hedefler/Profil/Ruh Hali/
// Check-in'ler/Auth dahil) kademeli yayılma planı tamamlanıp `useThemeColors()`
// kullanacak şekilde geçirildi (bkz. redesign planındaki M2b turu). `colors`/
// `seriesColors` statik export'ları SADECE `chart-utils.ts::chartAxisProps`'ın
// kullanılmayan bir varsayılan parametre değeri olarak kalıyor - her gerçek
// çağrı zaten `useThemeColors()`'ın sonucunu açıkça geçiriyor, geriye dönük
// uyumluluk için silinmedi ama artık aktif bir kod yolu değil.

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceInput: string;
  text: string;
  muted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  /** Metin taşıyan dolgu yüzeyler (buton, aktif çip, kullanıcı sohbet
   * balonu) İÇİN ayrı token - web'deki AYNI düzeltme (bkz. globals.css) -
   * düz `accent` üzerine beyaz metin WCAG AA'yı (4.5:1) geçmiyordu. */
  accentSolid: string;
  accentSolidHover: string;
  onAccentSolid: string;
  secondary: string;
  secondaryHover: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  info: string;
  infoBg: string;
  insightBg: string;
  insightAccent: string;
  celebrate: string;
}

// PulseCoach marka fikri "Nabız → Eğri" (bkz. pulse-mark.tsx) - açık temada
// krem arkaplan KORUNDU (kullanıcı kararı), gerisi web'deki globals.css ile
// AYNI hex değerleri kullanıyor (iki platform arasında marka tutarlılığı).
export const lightColors: ThemeColors = {
  background: "#FBF6ED",
  surface: "#FFFCF6",
  surfaceMuted: "#F1E9D8",
  surfaceInput: "#FFFEFB",
  text: "#241D14",
  muted: "#7D6F56",
  border: "#E7DBC2",
  borderStrong: "#D8C39A",
  accent: "#DD5B2E",
  accentHover: "#B8481F",
  accentSolid: "#B8481F",
  accentSolidHover: "#9C3C1A",
  onAccentSolid: "#FFFFFF",
  secondary: "#1C5F58",
  secondaryHover: "#164A45",
  error: "#C42B2B",
  errorBg: "#FBE7E4",
  success: "#3E8F5C",
  successBg: "#E5F3E9",
  info: "#1C5F58",
  infoBg: "#E4EEEC",
  insightBg: "#F7ECD6",
  insightAccent: "#C68A22",
  celebrate: "#C68A22",
};

// 2026-08-15 revizyonu: ilk koyu tema (sıcak kahve-siyahı, #171310) kullanıcı
// canlı testte "içim daraldı" dedi - turuncu vurgu SICAK arkaplanla aynı
// renk ailesinde kalıp yeterince ayrışmıyordu, kademeler (background→
// surface→surfaceMuted) de birbirine çok yakındı. Web'deki AYNI düzeltme
// (bkz. globals.css) - soğuk-nötr bir antrasit (ikincil çamgöbeği rengine
// yakın gece tonu), turuncu artık gerçek renk kontrastıyla öne çıkıyor.
export const darkColors: ThemeColors = {
  background: "#10161A",
  surface: "#1A2226",
  surfaceMuted: "#232D31",
  surfaceInput: "#10161A",
  text: "#F2EEE6",
  muted: "#8FA3A6",
  border: "#2C383C",
  borderStrong: "#3D4C51",
  accent: "#F0794A",
  accentHover: "#F5966D",
  // Koyu temada parlak turuncu üzerine BEYAZ metin bile 2.79:1 - koyu renk
  // hedeflemek yerine (parlaklığı kaybolurdu) tam tersini yapıyoruz: yüzey
  // parlak kalıyor, üzerine KOYU metin (arkaplan tonu) - 6.55:1, hem
  // erişilebilir hem "parlıyor" hissini koruyor (bkz. globals.css'teki aynı
  // gerekçe).
  accentSolid: "#F0794A",
  accentSolidHover: "#F5966D",
  onAccentSolid: "#10161A",
  secondary: "#4A9D92",
  secondaryHover: "#63B6AB",
  error: "#E2584D",
  errorBg: "#3A2320",
  success: "#57B37B",
  successBg: "#1E2F24",
  info: "#4A9D92",
  infoBg: "#1A2E2B",
  insightBg: "#332A16",
  insightAccent: "#E0A83E",
  celebrate: "#E0A83E",
};

/** Statik açık tema paleti - Faz 1 kapsamı DIŞINDAKİ ekranların hâlâ
 * kullandığı geriye dönük uyumlu export (bkz. dosya başındaki not). */
export const colors = lightColors;

/** Şu anki temaya göre renk paleti - Faz 1 kapsamındaki (Sohbet/İlerleme/
 * paylaşımlı bileşenler) dosyaların kullanması için. */
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return theme === "dark" ? darkColors : lightColors;
}

// Grafikler ve StatTile'lar arasında tutarlı kategorik palet (web'deki
// --series-1..6 CSS değişkenlerinin sabit RN karşılığı - dataviz kuralı:
// asla dual-axis, seriler arasında ayırt edilebilir renkler). `seriesColors`
// statik (açık tema, geriye dönük uyumlu) - `useSeriesColors()` Faz 1
// kapsamındaki grafikler (Kilo/Bel/Yağ/Aylar Arası Trend) için tema-duyarlı.
export const seriesColors = {
  series1: "#1C5F58",
  series2: "#DD5B2E",
  series3: "#C68A22",
  series4: "#7C5295",
  series5: "#B85C7E",
  series6: "#4C6FA3",
};

const darkSeriesColors: typeof seriesColors = {
  series1: "#4A9D92",
  series2: "#F0794A",
  series3: "#E0A83E",
  series4: "#9B74B3",
  series5: "#D17C9C",
  series6: "#6F8FC2",
};

export function useSeriesColors(): typeof seriesColors {
  const { theme } = useTheme();
  return theme === "dark" ? darkSeriesColors : seriesColors;
}

// Antrenman türü etiket/renk eşlemesi - önceden progress.tsx/workouts.tsx/
// workout-type-chart.tsx'te 3 AYRI kopyası vardı (2026-08-06'da fark
// eklenirken tek yere toplandı), WorkoutTypeChart ile WorkoutVolumeChart
// arasında renk tutarlılığı sağlamak için de burada olması gerekiyordu.
export const WORKOUT_TYPE_LABELS: Record<PreferredLanguage, Record<WorkoutType, string>> = {
  tr: { kuvvet: "Kuvvet", kardiyo: "Kardiyo", esneklik: "Esneklik", karışık: "Karışık" },
  en: { kuvvet: "Strength", kardiyo: "Cardio", esneklik: "Flexibility", karışık: "Mixed" },
};

export const workoutTypeColors: Record<WorkoutType, string> = {
  kuvvet: seriesColors.series2,
  kardiyo: seriesColors.series3,
  esneklik: seriesColors.series4,
  karışık: seriesColors.series5,
};

// Ruh hali emoji + TR/EN metin eşlemesi - önceden mood-picker.tsx (dizi
// biçimi) ve mood-history.tsx (Record biçimi) aynı emoji/metin içeriğinin
// KENDİ kopyasını tutuyordu (2026-08-10 mimari borç raporu, bulgu #15) - iki
// dosya da farklı bir şekle ihtiyaç duyduğu için (Pressable listesi vs.
// mood_key ile arama) sadece ham içerik burada birleştirildi, her dosya
// kendi şeklini bu tek kaynaktan kurar.
export const MOOD_KEYS: MoodKey[] = ["zor", "dusuk", "notr", "iyi", "harika"];

export const MOOD_META: Record<MoodKey, { emoji: string; tr: string; en: string }> = {
  zor: { emoji: "😔", tr: "Zor", en: "Tough" },
  dusuk: { emoji: "😕", tr: "Düşük", en: "Low" },
  notr: { emoji: "🙂", tr: "Nötr", en: "Neutral" },
  iyi: { emoji: "😊", tr: "İyi", en: "Good" },
  harika: { emoji: "🤩", tr: "Harika", en: "Great" },
};

/** Her paylaşımlı bileşenin kullandığı stil fabrikası - `useThemeColors()`
 * çıktısına göre `useMemo` ile bir kere hesaplanır (StyleSheet.create modül
 * seviyesinde sabit değer yakalar, tema değişince GÜNCELLENMEZ - bu yüzden
 * render içinde, renklere bağlı olarak yeniden üretiliyor). */
function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      gap: 16,
    },
    banner: {
      borderRadius: 8,
      padding: 10,
    },
    emptyWrap: { alignItems: "center", gap: 8, paddingVertical: 32 },
    emptyText: { fontSize: 13, color: c.muted, textAlign: "center", paddingHorizontal: 16 },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surfaceInput,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSolid,
      borderRadius: 10,
      paddingVertical: 12,
    },
    buttonText: {
      color: c.onAccentSolid,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignSelf: "flex-start",
    },
    secondaryButtonText: {
      color: c.text,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
    },
    insightCard: {
      borderRadius: 14,
      padding: 16,
      backgroundColor: c.insightBg,
      gap: 6,
    },
    insightTitle: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: c.insightAccent,
    },
    insightMessage: {
      fontSize: 13,
      color: c.text,
      lineHeight: 19,
    },
    skeleton: {
      borderRadius: 10,
      backgroundColor: c.surfaceMuted,
      width: "100%",
    },
    typingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    typingLabel: {
      fontSize: 13,
      color: c.muted,
    },
    statTile: {
      flexBasis: "48%",
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 14,
      gap: 4,
    },
    statLabel: {
      fontSize: 12,
      color: c.muted,
    },
    statValue: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.3,
      color: c.text,
    },
    statHint: {
      fontSize: 11,
      color: c.muted,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: c.accentSolid,
      borderColor: c.accentSolid,
    },
    checkboxMark: {
      color: c.onAccentSolid,
      fontSize: 12,
      fontFamily: "Inter_700Bold",
    },
    toggleLabel: {
      fontSize: 14,
      color: c.text,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: "transparent",
    },
    // Redesign (2026-08-15): önceden dolu `accentSolid` arkaplandı - kullanıcı
    // koyu modda turuncunun "bunaltıcı" hissettirdiğini belirtti. En büyük
    // pay bu bileşendeydi: tür/yoğunluk/kategori seçicilerinde aynı anda
    // birden fazla dolu turuncu balon görünebiliyordu. Artık sadece yumuşak
    // bir ton (aynı MoodPicker'daki gibi) + ince kenarlık - seçili olduğu
    // hâlâ net ama ekranda "bağıran" tek unsur artık asıl birincil eylem
    // (PrimaryButton/FAB) oluyor.
    chipActive: {
      backgroundColor: `${c.accent}26`,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
    },
    chipTextActive: {
      color: c.accent,
    },
    detailSafe: { flex: 1, backgroundColor: c.background },
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    detailBack: { padding: 4 },
    detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.text },
    streakDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    streakLabel: { fontSize: 12, color: c.muted },
  });
}

export function Card({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return <View style={s.card}>{children}</View>;
}

// Üçü de koşullu render ediliyor (hata/başarı olunca DOM'a giriyor) - önceden
// animasyonsuzdu, ekranda sert biçimde "pat" diye belirip kayboluyordu.
// 2026-08-21 cila turu 2: entering={FadeIn} eklendi, exit yok (koşul false
// olunca zaten View tamamen kalkıyor - reanimated'ın exiting'i unmount'u
// geciktirdiği için burada bilerek KULLANILMADI, banter kaybolurken bir
// sonraki içerik zıplamasın diye).
export function ErrorBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[s.banner, { backgroundColor: c.errorBg }]}>
      <Text style={{ color: c.error, fontSize: 13 }}>{message}</Text>
    </Animated.View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[s.banner, { backgroundColor: c.successBg }]}>
      <Text style={{ color: c.success, fontSize: 13 }}>{message}</Text>
    </Animated.View>
  );
}

export function InfoBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[s.banner, { backgroundColor: c.infoBg }]}>
      <Text style={{ color: c.info, fontSize: 13 }}>{message}</Text>
    </Animated.View>
  );
}

/** Sıcak vurgu renkli özet/içgörü kartı - haftalık özet metni gibi "bunu
 * oku" denen tek bir içerik için (web'deki InsightCard'ın portu).
 * Banner'lar gibi genelde koşullu render ediliyor (LLM içgörüsü gelince) -
 * 2026-08-21 cila turu 2: aynı FadeIn eklendi. */
export function InsightCard({ title, message }: { title: string; message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.insightCard}>
      <Text style={s.insightTitle}>✨ {title}</Text>
      <Text style={s.insightMessage}>{message}</Text>
    </Animated.View>
  );
}

/** İçinde kullanıldığı en yakın TAB navigator'ın state'ini okur - aktif
 * sekmenin adı `routeName`'e GERÇEKTEN eşit olduğunda true döner.
 * `_layout.tsx::AnimatedTabIcon`'daki AYNI ilke (bkz. oradaki uzun not):
 * React Navigation'ın kendi `focused` prop'u tab çubuğunda GÜVENİLMEZ
 * (ikonu iki kopya render edip aralarında opaklık geçiriyor), ama tab
 * navigator'ın KENDİ state'i (`state.routes[state.index].name`) sadece
 * GERÇEK bir sekme değişiminde değişiyor - bir sekmenin İÇİNDEN bir alt
 * sayfa push/pop edilirken (kök Stack seviyesinde, tab navigator'ın
 * DIŞINDA) bu state HİÇ değişmiyor. `Reveal`'in `active` prop'u bunu
 * kullanır (bkz. aşağı). */
export function useIsActiveTab(routeName: string): boolean {
  return useNavigationState((state) => state.routes[state.index]?.name === routeName);
}

/** Ekran bölümlerini kademeli (staggered) yumuşak bir kayma+opaklıkla
 * ortaya çıkarır - 2026-08-21 cila turu 2'de eklenen `entering={FadeIn...}`
 * kart sarmalayıcılarının YERİNE geçti. İki fark: (1) düz opaklık yerine
 * hafif bir translateY kayması da var ("başka türlü animasyon dene" -
 * kullanıcı geri bildirimi, telefon testi); (2) `entering` SADECE mount
 * anında çalıştığı için sekmeler arası geçişte (RN tab'lar unmount OLMUYOR,
 * bkz. proje belleği) ekrana İKİNCİ kez dönüldüğünde animasyon hiç
 * oynamıyordu - kullanıcı bunu "aynı sekmeye dönünce animasyonsuz direkt
 * geliyor" diye bildirdi. Çözüm: `entering` yerine `useFocusEffect` ile
 * TETİKLENEN paylaşımlı değerler - ekran her odaklandığında (ilk açılış
 * DAHİL, geri dönüş DAHİL) baştan oynuyor. PulseStreak/AnimatedStreakCount'un
 * `replayKey`+remount deseninden BİLEREK farklı - burada remount
 * İSTEMİYORUZ (kartların içindeki form state'i/SearchableSelect açık
 * durumu gibi şeyleri her odaklanmada sıfırlamamak için), o yüzden `key`
 * değil doğrudan shared value reset'i kullanılıyor.
 *
 * `active`: sekme İÇİNDEN bir alt sayfa push edilip geri dönülen ekranlarda
 * (ör. Profil -> Ruh Hali Geçmişi -> geri) `useFocusEffect` YİNE ateşleniyor
 * (kök Stack'te tab navigator'ın TAMAMI odağı kaybedip geri kazanıyor) - bu
 * da bölümlerin GEREKSİZ yere yeniden oynamasına, kullanıcının deyimiyle
 * "baştan yükleniyor gibi geç gelmesine" yol açtı (2026-08-21, telefon
 * testi). `active` verildiğinde (bkz. `useIsActiveTab`) `useFocusEffect`
 * yerine SADECE bu boolean'ın false->true geçişi tetikleyici olur - alt
 * sayfa push/pop'unda tab navigator'ın state'i DEĞİŞMEDİĞİ için (aktif
 * sekme baştan sona AYNI kalıyor) yeniden oynamaz, sadece GERÇEK bir
 * sekme değişiminde oynar. */
export function Reveal({
  delay = 0,
  children,
  style,
  active,
}: {
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);
  // Sistem "Hareketi Azalt" ayarı açıksa (2026-08-21 tasarım denetimi -
  // uygulamada hiçbir animasyon bu ayara saygı göstermiyordu, gerçek bir
  // erişilebilirlik boşluğuydu) kayma+opaklık geçişi yerine İÇERİK ANINDA
  // son haliyle beliriyor - tamamen kaldırmak yerine (o zaman odak
  // sırasında "hiç değişmiyor" hissi verirdi) süre/gecikme sıfırlanıyor.
  const reducedMotion = useReducedMotion();

  const play = useCallback(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = 0;
    translateY.value = 14;
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, reducedMotion]);

  useFocusEffect(
    useCallback(() => {
      if (active === undefined) play();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [play])
  );

  useEffect(() => {
    if (active) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** `Reveal`'in mount-tabanlı kardeşi - push edilen (Stack) detay ekranları
 * için (Ruh Hali Geçmişi/Bildirimler/Hedefler/Ayarlar/Egzersiz Geçmişi).
 * Bu ekranlar sekmelerin AKSİNE her push/pop'ta GERÇEKTEN unmount/remount
 * oluyor (standart native-stack davranışı - bu projede freeze/detach
 * yapılandırması YOK), yani `Reveal`'in var olma SEBEBİ (tab'lar unmount
 * olmadığı için `entering` bir daha hiç çalışmıyordu) burada geçerli
 * DEĞİL.
 *
 * 2026-08-21, ÜÇÜNCÜ tur: bu ekranlarda kullanıcı tarafından ÜÇ AYRI
 * turda telefonda test edilip "hâlâ animasyon yok" bulundu - önce
 * `Reveal`'in `useFocusEffect`+gecikme ayarı (0->200-320ms), sonra
 * Reanimated'in KENDİ `entering` prop'u (`FadeIn...withInitialValues`)
 * denendi, İKİSİ DE başarısız. Ortak nokta: uygulamada ŞİMDİYE KADAR
 * telefonda ÇALIŞTIĞI DOĞRULANMIŞ TÜM animasyonlar (Skeleton nabzı,
 * TypingIndicator, sekme ikonu sıçraması, tab ekranlarındaki `Reveal`)
 * SADECE `useSharedValue`+`useAnimatedStyle`+`withTiming` (çıplak worklet)
 * kullanıyor - `entering`/`exiting` (Reanimated'in ayrı Layout Animations alt
 * sistemi, react-native-screens'in native ekran geçişleriyle ekstra native
 * kayıt/senkronizasyon gerektiriyor) bu projede TELEFONDA DOĞRULANMIŞ hiçbir
 * yerde yok - yani `entering`'in bu Reanimated 4 + Yeni Mimari + native-stack
 * kombinasyonunda hiç ateşlenmiyor olması (ya da hiç görünür olmaması)
 * tutarlı bir açıklama. Bu üçüncü versiyon `entering`'i TAMAMEN terk edip
 * `Reveal` ile AYNI çıplak worklet mekanizmasını kullanıyor - farkı
 * `useFocusEffect` (odak olayına bağlı) yerine düz `useEffect` (bileşen
 * mount olunca BİR KERE çalışır) - bu ekranlar zaten her push'ta taze bir
 * mount olduğu için bu tam istenen "her push'ta baştan oyna" davranışını
 * hiçbir navigasyon/Layout-Animations altyapısına bağımlı olmadan verir. */
export function RevealOnMount({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);
  // Bkz. Reveal'daki AYNI not - "Hareketi Azalt" açıksa animasyon yerine
  // içerik anında son haliyle beliriyor.
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// Önceden düz gri bir kutuydu (statik, yükleniyor izlenimi vermiyordu) -
// 2026-08-20 animasyon turu: nefes alan yumuşak bir opaklık nabzı eklendi.
// Shimmer (kayan gradyan) yerine bu seçildi çünkü tek bir View ile kurulabiliyor
// (LinearGradient + maskeleme gerektirmiyor) ve marka tercihiyle örtüşüyor
// ("zarif, abartısız" - bkz. proje belleği).
export function Skeleton({ height = 96 }: { height?: number }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[s.skeleton, { height }, animatedStyle]} />;
}

/** Koç yanıt üretirken (sohbet balonu) veya bir işlem analiz edilirken
 * (fotoğraf analizi) gösterilen "düşünüyor" animasyonu - çıplak
 * ActivityIndicator yerine (2026-08-20, kullanıcı isteği: "koç düşünüyor...
 * analiz ediliyor... vb. animasyonlar"). İlk sürümde jenerik 3 noktalı bir
 * "yazıyor" göstergesiydi ama kullanıcı telefonda test edince "zaten var
 * olana çok benziyor, daha güzel bir şey yok mu" dedi - jenerik noktalar
 * yerine markanın KENDİ "Nabız → Eğri" motifi (PulseMark) kullanılıyor,
 * uygulamadaki DİĞER tüm yükleniyor anlarıyla (sohbet geçmişi, uygulama
 * açılışı) aynı görsel dil, ayrıca "nabız" temasıyla "düşünme" arasındaki
 * metafor da örtüşüyor. `label` verilirse yanına metin konur (fotoğraf
 * analizi gibi bağlam gerektiren kullanımlar için). */
export function TypingIndicator({ label, color }: { label?: string; color?: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.typingRow}>
      <PulseMark size={36} color={color ?? c.accent} animated loop />
      {label ? <Text style={s.typingLabel}>{label}</Text> : null}
    </View>
  );
}

/** İkon + mesaj ile boş liste gösterimi - web'deki EmptyState'in portu.
 * Önceden her ekran (goals/mood-history/workouts/nutrition) kendi ad-hoc
 * markup'ını yazıyordu (bazıları ikonsuz düz metin) - checkins.tsx'in
 * ikonlu deseni buraya çıkarılıp hepsine uygulandı (2026-08-13 tutarlılık
 * incelemesi). 2026-08-21 cila turu 2: skeleton'dan sonra aniden "pat" diye
 * belirmesin diye hafif bir FadeIn+kayma eklendi - Skeleton/TypingIndicator
 * zaten animasyonluydu, bu üçü arasındaki tek statik köşe buydu. */
export function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(250)} style={s.emptyWrap}>
      {icon}
      <Text style={s.emptyText}>{message}</Text>
    </Animated.View>
  );
}

/** Grafiklerle aynı seriesColors paletinden bir renk - StatTile'ın rengini
 * sayfadaki grafiklerle tutarlı tutar (web'deki seriesVar/--series-N'in
 * portu). Değer kalın Inter ile büyütüldü - WHOOP-tarzı "tek bakışta oku"
 * hissi (Fraunces burada KULLANILMIYOR, 2026-08-15 kullanıcı geri bildirimi
 * - Fraunces sadece karşılama başlığında kalıyor, bkz. index.tsx). */
export function StatTile({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.statTile}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
      {hint ? <Text style={s.statHint}>{hint}</Text> : null}
    </Animated.View>
  );
}

/** Art arda kaç gün aktif olunduğunu gösteren nabız-noktası dizisi -
 * web/src/components/ui.tsx::PulseStreak'in RN portu. Noom'un check-mark
 * streak fikrinin PulseCoach'ın nabız motifine uyarlanmış hali - var olan
 * bir veriyi (ör. `streak_days`) GÖRSEL olarak vurgular, yeni bir backend
 * kavramı GEREKTİRMEZ.
 *
 * `replayKey`: verildiğinde noktaların key'ine karışıp React'ı onları
 * YENİDEN MOUNT ETMEYE zorluyor - `entering` prop'u sadece mount anında
 * çalıştığı için "aynı sayıya rağmen animasyonu BAŞTAN oynat" (kullanıcı
 * isteği, 2026-08-19: "streak kısmına dokununca ... animasyonla belli
 * olsun") DEĞER DEĞİŞMEDEN mümkün değildi - RhythmRing'teki AYNI ilke
 * (bkz. rhythm-ring.tsx::AnimatedRing). */
export function PulseStreak({
  count,
  max = 8,
  label,
  replayKey = 0,
}: {
  count: number;
  max?: number;
  label?: string;
  replayKey?: number;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const dots = Math.min(count, max);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {Array.from({ length: max }).map((_, i) =>
          i < dots ? (
            <Animated.View
              key={`${replayKey}-${i}`}
              entering={FadeIn.delay(i * 60).duration(250)}
              style={[s.streakDot, { backgroundColor: c.accent }]}
            />
          ) : (
            <View key={`${replayKey}-${i}`} style={[s.streakDot, { backgroundColor: c.surfaceMuted }]} />
          )
        )}
        {count > max ? (
          <Text style={{ marginLeft: 2, fontSize: 12, fontFamily: "Inter_700Bold", color: c.accent }}>
            +{count - max}
          </Text>
        ) : null}
      </View>
      {label ? <Text style={s.streakLabel}>{label}</Text> : null}
    </View>
  );
}

/** Büyük, "patlayan" bir sıçrama + 0'dan hedefe sayan bir rakam - PulseStreak'in
 * yanında, dokunma sonrası streak'i "belirginleştirmek" için (kullanıcı
 * isteği, 2026-08-19). Sayaç kısmı BİLEREK düz React state ile (setInterval
 * adımları) yapılıyor - Reanimated'de bir Text'in İÇERİĞİNİ (rakamları)
 * animasyonlamak `useAnimatedProps` ile kırılgan/sürüm-hassas; sıçrama
 * (scale) kısmı ise Reanimated'in asıl güçlü olduğu yer, o da ayrı kalıyor.
 * `replayKey` değiştiğinde (ya da `count` değiştiğinde) baştan oynar. */
export function AnimatedStreakCount({
  count,
  replayKey = 0,
  style,
}: {
  count: number;
  replayKey?: number;
  style?: TextStyle | TextStyle[];
}) {
  const [displayed, setDisplayed] = useState(0);
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    setDisplayed(0);
    scale.value = 0.6;
    opacity.value = 0;
    scale.value = withSequence(
      withTiming(1.22, { duration: 260, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 160 })
    );
    opacity.value = withTiming(1, { duration: 200 });

    if (count <= 0) return;
    const steps = Math.min(count, 10);
    const stepMs = Math.max(35, 500 / steps);
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      setDisplayed(Math.round((step / steps) * count));
      if (step >= steps) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, replayKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.Text style={[style, animatedStyle]}>{displayed}</Animated.Text>;
}

/** Web'deki checkbox+label yerine RN'de sık kullanılan dokunulabilir satır. */
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={s.toggleRow} onPress={() => onChange(!value)}>
      <View style={[s.checkbox, value && s.checkboxChecked]}>
        {value ? <Text style={s.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={s.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

/** Web'deki <Select> yerine RN'de bağımlılıksız bir çözüm: yatay çip
 * seçici (login ekranındaki tab-toggle deseniyle aynı görsel dil). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.chipRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[s.chip, active && s.chipActive]}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return <Text style={s.label}>{children}</Text>;
}

export function FormInput(props: TextInputProps) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return <TextInput placeholderTextColor={c.muted} {...props} style={[s.input, props.style]} />;
}

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        (disabled || pressed) && { opacity: 0.7 },
      ]}
    >
      {loading ? <ActivityIndicator color={c.onAccentSolid} style={{ marginRight: 8 }} /> : null}
      <Text style={s.buttonText}>{children}</Text>
    </Pressable>
  );
}

/** PrimaryButton'ın dolgu-değil çerçeveli karşılığı (web'deki
 * SecondaryButton'ın portu) - "Fotoğraf Seç" gibi ikincil eylemler için.
 * `loading` prop'u sonradan eklendi (2026-08-14) - "Daha Fazla Göster"
 * (kademeli yükleme) butonu için PrimaryButton'daki ActivityIndicator
 * deseninin aynısı, geriye dönük uyumlu (opsiyonel, mevcut çağıranlar
 * etkilenmez). */
export function SecondaryButton({
  children,
  onPress,
  disabled,
  loading,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.secondaryButton,
        (disabled || loading || pressed) && { opacity: 0.7 },
      ]}
    >
      {loading ? <ActivityIndicator color={c.text} style={{ marginRight: 8 }} /> : null}
      <Text style={s.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

/** "Diğer" sekmesinden açılan alt sayfalar (Ruh Hali/Hedefler/Check-in'ler/
 * Profil) için ortak geri-dönüş başlığı - bu proje native Stack header'ı
 * yerine (tab ekranlarıyla aynı) kendi minimal UI'ını kuruyor, tutarlılık
 * için burada da aynı yaklaşım. `router.back()` her zaman "Diğer"e döner
 * çünkü bu sayfalar SADECE oradan push ediliyor. */
export function DetailScreen({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={s.detailSafe} edges={["top"]}>
      <View style={s.detailHeader}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.detailBack}>
          <ChevronLeft size={22} color={c.text} />
        </Pressable>
        <Text style={s.detailTitle}>{title}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export { PulseMark };
