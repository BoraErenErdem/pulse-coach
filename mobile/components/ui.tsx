import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import type { MoodKey, PreferredLanguage, WorkoutType } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { PulseMark } from "@/components/pulse-mark";

// Redesign (2026-08-15): bu dosya önceden BİLİNÇLİ olarak minimal/işlevsel
// bırakılmıştı ("kapsamlı görsel tasarım kullanıcının 3. adımına bırakıldı" -
// bkz. proje belleği). Bu, o adım. Web'in olgun `ui.tsx`'iyle aynı token
// mantığı: web CSS custom property + `.dark` sınıfıyla çalışıyordu, RN'de
// runtime CSS yok - bu yüzden burada iki sabit palet (`lightColors`/
// `darkColors`) + bir `useThemeColors()` hook'u var. Geriye dönük uyumluluk
// İÇİN `colors`/`seriesColors` HÂLÂ statik (açık tema) export ediliyor -
// Faz 1 kapsamı DIŞINDAKİ ekranlar (Antrenman/Beslenme/Hedefler/Profil/Ruh
// Hali/Check-in'ler/Auth) hâlâ bunu import ediyor, bilerek koyu temaya
// tepki vermiyor (kademeli yayılma planının parçası - bkz. redesign planı).
// Burada tanımlanan PAYLAŞIMLI bileşenler (Card/Button/Banner/StatTile/...)
// ise `useThemeColors()` kullanıyor - yani o ekranların KENDİ metni açık
// temada sabit kalsa da, bu paylaşımlı bileşenlerin (Card zemin rengi vb.)
// KENDİSİ otomatik olarak koyu temaya tepki veriyor (dosya değiştirmeden).

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
      fontWeight: "600",
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

export function ErrorBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.banner, { backgroundColor: c.errorBg }]}>
      <Text style={{ color: c.error, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.banner, { backgroundColor: c.successBg }]}>
      <Text style={{ color: c.success, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function InfoBanner({ message }: { message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.banner, { backgroundColor: c.infoBg }]}>
      <Text style={{ color: c.info, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

/** Sıcak vurgu renkli özet/içgörü kartı - haftalık özet metni gibi "bunu
 * oku" denen tek bir içerik için (web'deki InsightCard'ın portu). */
export function InsightCard({ title, message }: { title: string; message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.insightCard}>
      <Text style={s.insightTitle}>✨ {title}</Text>
      <Text style={s.insightMessage}>{message}</Text>
    </View>
  );
}

export function Skeleton({ height = 96 }: { height?: number }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return <View style={[s.skeleton, { height }]} />;
}

/** İkon + mesaj ile boş liste gösterimi - web'deki EmptyState'in portu.
 * Önceden her ekran (goals/mood-history/workouts/nutrition) kendi ad-hoc
 * markup'ını yazıyordu (bazıları ikonsuz düz metin) - checkins.tsx'in
 * ikonlu deseni buraya çıkarılıp hepsine uygulandı (2026-08-13 tutarlılık
 * incelemesi). */
export function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.emptyWrap}>
      {icon}
      <Text style={s.emptyText}>{message}</Text>
    </View>
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
