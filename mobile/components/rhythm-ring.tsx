import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { Apple, Dumbbell, Smile } from "lucide-react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 92;
const STROKE = 9;

/** movement/nutrition/mood yüzdelerinden "Ritim" bileşik skorunu hesaplar -
 * hem tam RhythmRing kartı hem de MiniRhythmRing (bkz. altta, Sohbet üst
 * barındaki "Bugün" rozeti, kullanıcı isteği 2026-08-18) AYNI mantığı
 * kullanıyor - kopya hesaplama yerine tek bir yer. */
export function computeRhythmOverall(
  movementPct: number | null,
  nutritionPct: number | null,
  moodPct: number | null
): number | null {
  const values = [movementPct, nutritionPct, moodPct].filter((v): v is number => v != null);
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Animasyonlu ilerleme halkası - boyuttan bağımsız çekirdek çizim mantığı.
 * Hem tam boy RhythmRing'in (SIZE=92) hem de üst bar rozetindeki
 * MiniRhythmRing'in (ör. 20px) ALTINDA aynı bileşen - Reanimated kurulumu
 * tek bir yerde, boyuta göre kopyalanmıyor. */
function AnimatedRing({
  overall,
  size,
  strokeWidth,
  showNumber,
  replayKey,
}: {
  overall: number | null;
  size: number;
  strokeWidth: number;
  showNumber?: boolean;
  // Değiştiğinde dolma animasyonunu BAŞTAN oynatır - `overall` AYNI kalsa
  // bile (kullanıcı isteği, 2026-08-18: "Sohbet sekmesine her girdiğinde
  // tetiklensin, daha canlı gözüksün"). MiniRhythmRing (bkz. altta) bunu
  // ChatTab'ın sekme-odağı sayacına bağlıyor - `overall` değişmediğinde
  // state aynı kalıp effect hiç tetiklenmeyebiliyordu (React aynı primitive
  // değere re-render yapmıyor), o yüzden AYRI bir sayaç gerekiyordu.
  replayKey?: number;
}) {
  const c = useThemeColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);
  useEffect(() => {
    // Önce anında (animasyonsuz) sıfıra çekip SONRA hedefe dolduruyoruz -
    // aksi halde progress zaten hedef değerdeyse (overall değişmemiş)
    // withTiming'in tek başına çağrılması görsel olarak hiçbir şey
    // yapmazdı, "yeniden oynatma" hissi kaybolurdu.
    progress.value = 0;
    progress.value = withTiming((overall ?? 0) / 100, { duration: 900, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overall, replayKey]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={c.surfaceMuted} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={c.accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showNumber ? (
        <View style={ringCenterStyle.center}>
          <Text style={[ringCenterStyle.number, { fontSize: size * 0.24, color: c.text }]}>
            {overall != null ? overall : "—"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const ringCenterStyle = StyleSheet.create({
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  number: { fontFamily: "Inter_700Bold" },
});

/** Sohbet üst barındaki "Bugün" rozetine gömülü minyatür Ritim halkası
 * (kullanıcı isteği, 2026-08-18: "yanına da ritim halkası eklesek güzel
 * olur") - sayı YOK (bu boyutta okunmaz), sadece dolgu oranı görsel bir
 * sinyal/önizleme. Ayrıntılı döküm (Hareket/Beslenme/Ruh Hali + sayı) hâlâ
 * SADECE "Bugün" BottomSheet'indeki tam RhythmRing'de.
 */
export function MiniRhythmRing({
  movementPct,
  nutritionPct,
  moodPct,
  size = 20,
  replayKey,
}: {
  movementPct: number | null;
  nutritionPct: number | null;
  moodPct: number | null;
  size?: number;
  replayKey?: number;
}) {
  const overall = computeRhythmOverall(movementPct, nutritionPct, moodPct);
  return (
    <AnimatedRing overall={overall} size={size} strokeWidth={Math.max(2.5, size * 0.14)} replayKey={replayKey} />
  );
}

/** "Ritim" bileşik skoru - chat/anasayfa ekranı için (Redesign, ChatGPT'nin
 * mockup'ından uyarlanan 3 fikirden biri: "Hareket %68 · Beslenme %81 ·
 * Ruh Hali %74" tarzı tek bakışta özet). Üç girdi de AYRI backend
 * endpoint'lerinden (bugünkü antrenman oturumu var mı, günlük beslenme
 * özeti/kalori hedefi, bugünkü mood) türetilir - yeni backend alanı GEREKMEZ,
 * tamamen istemci tarafı bir bileşim. Herhangi bir girdi henüz yoksa (örn.
 * bugün mood seçilmemiş) o segment %0 sayılır ama "—" ile ayrı gösterilir ki
 * kullanıcı "hiç yapmadım" ile "seçmedim" farkını görsün.
 */
export function RhythmRing({
  movementPct,
  nutritionPct,
  moodPct,
}: {
  movementPct: number | null;
  nutritionPct: number | null;
  moodPct: number | null;
}) {
  const c = useThemeColors();
  const t = useT();
  const s = useMemo(() => makeStyles(c), [c]);

  const overall = computeRhythmOverall(movementPct, nutritionPct, moodPct);
  const label = rhythmLabel(overall, t);

  return (
    <View style={s.card}>
      <AnimatedRing overall={overall} size={SIZE} strokeWidth={STROKE} showNumber />
      <View style={s.breakdown}>
        <Text style={s.label}>{label}</Text>
        <RhythmRow icon={<Dumbbell size={13} color={c.muted} />} name={t("Hareket", "Movement")} pct={movementPct} c={c} />
        <RhythmRow icon={<Apple size={13} color={c.muted} />} name={t("Beslenme", "Nutrition")} pct={nutritionPct} c={c} />
        <RhythmRow icon={<Smile size={13} color={c.muted} />} name={t("Ruh Hali", "Mood")} pct={moodPct} c={c} />
      </View>
    </View>
  );
}

function RhythmRow({
  icon,
  name,
  pct,
  c,
}: {
  icon: React.ReactNode;
  name: string;
  pct: number | null;
  c: ThemeColors;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.row}>
      {icon}
      <Text style={s.rowName}>{name}</Text>
      <Text style={s.rowValue}>{pct != null ? `%${pct}` : "—"}</Text>
    </View>
  );
}

function rhythmLabel(overall: number | null, t: (tr: string, en: string) => string): string {
  if (overall == null) return t("Bugün başlangıç", "Today's a start");
  if (overall >= 80) return t("Harika gidiyor", "Going great");
  if (overall >= 60) return t("Dengeli bir gün", "A balanced day");
  if (overall >= 40) return t("Fena değil", "Not bad");
  return t("Bugün başlangıç", "Today's a start");
}

/** "Bugün" BottomSheet'inde günün ipucunun YERİNE geçen kişisel, sıcak cümle
 * (kullanıcı isteği, 2026-08-18: jenerik bir bilgi kırıntısı yerine "bugün
 * sen nasılsın" temasına oturan bir şey). Aynı eşik mantığı `rhythmLabel`
 * ile TUTARLI (kısa etiketle çelişmesin), ama tam cümle + isim içeriyor.
 * Backend çağrısı GEREKMİYOR - zaten elde olan ritim skorundan türetiliyor. */
export function rhythmEncouragement(
  overall: number | null,
  name: string | undefined,
  t: (tr: string, en: string) => string
): string {
  const who = name ? `${name}, ` : "";
  if (overall == null) {
    return t(
      `${who}bugün için güzel bir başlangıç noktasındasın - ruh halini seçerek başlayabilirsin.`,
      `${who}today's a great point to start from - try picking your mood to begin.`
    );
  }
  if (overall >= 80) return t(`Harika gidiyorsun${name ? `, ${name}` : ""}! Bu ritmi koru.`, `You're doing great${name ? `, ${name}` : ""}! Keep this rhythm going.`);
  if (overall >= 60) return t("Bugün oldukça dengeli bir gün geçiriyorsun, böyle devam.", "You're having a pretty balanced day, keep it up.");
  if (overall >= 40) return t("Fena değil - küçük adımlar da sayılır.", "Not bad at all - small steps count too.");
  return t("Bugün yeniden başlamak için de güzel bir gün.", "Today's also a fine day to start fresh.");
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    breakdown: {
      flex: 1,
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
      marginBottom: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowName: {
      flex: 1,
      fontSize: 12,
      color: c.muted,
    },
    rowValue: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
  });
}
