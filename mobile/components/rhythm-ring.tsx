import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { Apple, Dumbbell, Smile } from "lucide-react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";
import type { MoodKey } from "@/lib/api";

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
  trackColor,
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
  // Halkanın DOLMAMIŞ kısmının rengi - varsayılan `c.surfaceMuted` (tam boy
  // RhythmRing kartı için, `c.surface` zemin üzerinde yeterli kontrast
  // veriyor). MiniRhythmRing BUNU override ediyor (bkz. altta) - Sohbet'in
  // "Bugün" rozetinin KENDİ zemini zaten `${c.accent}1F` (hafif turuncu
  // dolgu), `surfaceMuted` o zeminle neredeyse AYNI tonda kalıp izi
  // kayboluyordu - kullanıcı bulgusu (2026-08-21): "halka renginden dolayı
  // halka gibi görünmüyor".
  trackColor?: string;
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
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? c.surfaceMuted} strokeWidth={strokeWidth} fill="none" />
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
 * SADECE "Bugün" panelindeki tam RhythmRing'de.
 *
 * `c.borderStrong` track rengi + biraz daha kalın çizgi (kullanıcı bulgusu,
 * 2026-08-21: rozetin kendi zemini `${c.accent}1F` ile `c.surfaceMuted`
 * neredeyse aynı tonda kalıp "halka gibi görünmüyor"du) - `borderStrong`
 * her iki temada da hem rozetin dolgu tonundan hem accent'ten yeterince
 * ayrışıyor, dolmamış kısım artık gerçekten bir "iz" olarak görünüyor.
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
  const c = useThemeColors();
  const overall = computeRhythmOverall(movementPct, nutritionPct, moodPct);
  return (
    <AnimatedRing
      overall={overall}
      size={size}
      strokeWidth={Math.max(3, size * 0.18)}
      replayKey={replayKey}
      trackColor={c.borderStrong}
    />
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

/** Her mood için BİRDEN FAZLA cümle varyantı (kullanıcı isteği, 2026-08-19:
 * "çeşitlilik olsun" - tek sabit cümle her açılışta AYNI kalınca ezberlenip
 * jenerik hissettiriyordu). Her giriş bir TR/EN çifti - `name` opsiyonel,
 * bazı varyantlarda kullanılıyor bazılarında kullanılmıyor (hepsi isimle
 * başlarsa tekdüzeleşir). `pickVariant` bunlardan seed'e göre birini seçer. */
const MOOD_ENCOURAGEMENTS: Record<
  MoodKey,
  { tr: (name?: string) => string; en: (name?: string) => string }[]
> = {
  harika: [
    {
      tr: (name) => `Harika hissediyorsun${name ? `, ${name}` : ""}! Bu enerjiyi bugün değerlendir.`,
      en: (name) => `You're feeling great${name ? `, ${name}` : ""}! Make the most of this energy today.`,
    },
    {
      tr: () => "Bugün enerjin çok iyi - bunu değerlendirecek bir şey yapmaya ne dersin?",
      en: () => "Your energy's great today - how about doing something to make the most of it?",
    },
    {
      tr: () => "Harika bir gündesin! Bu ivmeyi taşımak için küçük bir adım daha at.",
      en: () => "You're having a great day! Carry this momentum with one more small step.",
    },
    {
      tr: (name) => `Bu hız harika${name ? `, ${name}` : ""} - bugünü unutulmaz kılacak bir şey dene.`,
      en: (name) => `This pace is great${name ? `, ${name}` : ""} - try something that'll make today memorable.`,
    },
    {
      tr: () => "Enerjin yerinde! Bu ruh haliyle biraz daha zorlayıcı bir hedefe göz atabilirsin.",
      en: () => "Your energy's on point! With this mood you could take on something a bit more ambitious.",
    },
  ],
  iyi: [
    {
      tr: () => "İyi bir gün geçiriyorsun, güzel.",
      en: () => "You're having a good day, nice.",
    },
    {
      tr: (name) => `Bugün gayet iyi hissediyorsun${name ? `, ${name}` : ""} - bu ivmeyi sürdürmeye ne dersin?`,
      en: (name) => `You're feeling pretty good today${name ? `, ${name}` : ""} - want to keep this momentum going?`,
    },
    {
      tr: () => "Keyifli bir gündesin, hedeflerinden birine göz atmanın tam zamanı.",
      en: () => "You're in good spirits - it's a great time to check in on one of your goals.",
    },
    {
      tr: (name) => `İyi gidiyorsun${name ? `, ${name}` : ""} - bugünü biraz daha ileri taşı.`,
      en: (name) => `You're doing well${name ? `, ${name}` : ""} - push today just a little further.`,
    },
    {
      tr: () => "Bugün oldukça dengeli hissediyorsun, bu güzel bir yerden devam edebilirsin.",
      en: () => "You're feeling fairly balanced today, a nice place to keep building from.",
    },
  ],
  notr: [
    {
      tr: () => "Nötr bir gündesin - küçük bir adım bile bugünü değiştirebilir.",
      en: () => "You're feeling neutral today - even one small step could shift it.",
    },
    {
      tr: (name) => `Bugün ne iyi ne kötü${name ? `, ${name}` : ""} - küçük, somut bir adım günü senin lehine çevirebilir.`,
      en: (name) => `Today's neither good nor bad${name ? `, ${name}` : ""} - one small, concrete step could tip it your way.`,
    },
    {
      tr: () => "Sakin bir gündesin - bu, dinlenmek ya da yeni bir şey denemek için de iyi bir zaman.",
      en: () => "You're having a calm day - a good time to rest or try something new.",
    },
    {
      tr: (name) => `Bugün ortada hissediyorsun${name ? `, ${name}` : ""}, bu da gayet normal - istersen birlikte bir şeye bakalım.`,
      en: (name) => `You're feeling in-between today${name ? `, ${name}` : ""}, and that's completely normal - we could look at something together if you'd like.`,
    },
    {
      tr: () => "Nötr bir noktadasın - ne yönde ilerlemek istediğine sen karar verirsin.",
      en: () => "You're at a neutral point - it's up to you which way to steer it.",
    },
  ],
  dusuk: [
    {
      tr: () => "Biraz düşük hissediyorsun gibi - kendine nazik davran, küçük adımlar da sayılır.",
      en: () => "You seem to be feeling a bit low - be gentle with yourself, small steps count too.",
    },
    {
      tr: (name) => `Bugün biraz zorlanıyor gibisin${name ? `, ${name}` : ""} - kendine baskı yapmadan ilerleyebilirsin.`,
      en: (name) => `You seem to be having a hard time today${name ? `, ${name}` : ""} - you can move forward without pushing yourself.`,
    },
    {
      tr: () => "Düşük bir gündesin, bu geçici - küçük ve ulaşılabilir bir şeyle başlayabilirsin.",
      en: () => "You're having a low day, and that's temporary - you could start with something small and reachable.",
    },
    {
      tr: (name) => `Enerjin düşük görünüyor${name ? `, ${name}` : ""} - bugün kendine biraz yumuşak davranmayı unutma.`,
      en: (name) => `Your energy seems low${name ? `, ${name}` : ""} - remember to be a little gentle with yourself today.`,
    },
    {
      tr: () => "Zor bir modda değilsin ama pek de iyi değilsin - istersen ne olduğunu konuşabiliriz.",
      en: () => "You're not in a tough spot, but not great either - we can talk about what's going on if you'd like.",
    },
  ],
  zor: [
    {
      tr: (name) => `Bugün zor geçiyor gibi görünüyor${name ? `, ${name}` : ""} - yalnız değilsin, istersen konuşalım.`,
      en: (name) => `Today seems tough${name ? `, ${name}` : ""} - you're not alone, we can talk if you'd like.`,
    },
    {
      tr: (name) => `Bugün gerçekten zorlu geçiyor olabilir${name ? `, ${name}` : ""} - burada olduğunu unutma, yalnız değilsin.`,
      en: (name) => `Today might really be a hard one${name ? `, ${name}` : ""} - remember you're not alone here.`,
    },
    {
      tr: () => "Zor bir gündesin - bunu hissetmen çok doğal, istersen ne olduğunu anlatabilirsin.",
      en: () => "You're having a tough day - it's completely natural to feel this way, you can tell me what's going on if you'd like.",
    },
    {
      tr: (name) => `Bugün ağır geliyor gibi${name ? `, ${name}` : ""} - küçük bir nefes bile bir başlangıç olabilir.`,
      en: (name) => `Today feels heavy${name ? `, ${name}` : ""} - even one small breath can be a start.`,
    },
    {
      tr: () => "Zor anlar geçiriyor olabilirsin - burada seni dinlemeye hazırım.",
      en: () => "You might be going through a hard moment - I'm here to listen.",
    },
  ],
};

/** `seed` negatif de olsa (JS'de modulo işareti korur) HER ZAMAN geçerli bir
 * index döner. */
function pickVariant<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

/** "Bugün" BottomSheet'inde günün ipucunun YERİNE geçen kişisel, sıcak cümle
 * (kullanıcı isteği, 2026-08-18: jenerik bir bilgi kırıntısı yerine "bugün
 * sen nasılsın" temasına oturan bir şey).
 *
 * ÖNCEDEN `overall` (movement/nutrition/mood ortalaması) bucket'ına göre
 * seçiliyordu - kullanıcı bulgusu (2026-08-17): mood HİÇ seçilmemişken bile
 * movement/nutrition tek başına 40-59 bandına düşünce "Fena değil - küçük
 * adımlar da sayılır" gibi tuhaf, mood'dan bağımsız bir mesaj çıkabiliyordu;
 * sonra "notr" seçilince ortalama AYNI bandın içinde kalıp mesaj hiç
 * değişmiyordu ("verdiğim veriye göre güncellenmiyor" hissi). Artık birincil
 * sinyal DOĞRUDAN `todayMood` (kullanıcının o an girdiği veri) - her mood
 * kendi cümlesine sahip, mood henüz seçilmemişse de KENDİ (ayrı, gündeki
 * ilerlemeyi övmeyen) mesajı var. movement/nutrition artık sadece o cümleye
 * eklenen küçük bir ek not (`extra`) - gün içinde antrenman/beslenme
 * kaydedildikçe cümle yine güncellenir ama mood'un yerini almaz.
 *
 * `variantSeed`: her mood için 5 cümle varyantı var (kullanıcı isteği,
 * 2026-08-19: "çeşitlilik olsun") - çağıran taraf (bkz. app/(tabs)/index.tsx)
 * bunu "Bugün" her açıldığında/sekmeye her dönüldüğünde artan bir sayaçla
 * besliyor, aynı mood için art arda AYNI cümle çıkmasın diye. Render İÇİNDE
 * rastgele seçim YAPILMIYOR (Math.random()) - bu, sheet açıkken input'a her
 * tuş vuruşunda cümlenin göz kırpması gibi tutarsız bir his verirdi.
 * Backend çağrısı GEREKMİYOR - tamamen istemci tarafı, elde olan state'ten. */
export function rhythmEncouragement(
  todayMood: MoodKey | null,
  movementPct: number | null,
  nutritionPct: number | null,
  name: string | undefined,
  t: (tr: string, en: string) => string,
  variantSeed = 0
): string {
  const who = name ? `${name}, ` : "";
  const hasMovement = (movementPct ?? 0) > 0;
  const hasNutrition = (nutritionPct ?? 0) > 0;
  const extra =
    hasMovement && hasNutrition
      ? t(" Üstelik bugün hem hareket etmiş hem beslenmeni kaydetmişsin.", " Plus you've logged both movement and nutrition today.")
      : hasMovement
        ? t(" Üstelik bugün hareket de etmişsin.", " Plus you've been active today too.")
        : hasNutrition
          ? t(" Üstelik beslenmeni de kaydetmişsin bugün.", " Plus you've logged your nutrition today too.")
          : "";

  if (!todayMood) {
    return t(
      `${who}bugün ruh halini henüz paylaşmadın - seçtiğinde burada sana özel bir not belirir.`,
      `${who}you haven't shared your mood yet today - pick one and a note made just for you will show up here.`
    );
  }

  const variant = pickVariant(MOOD_ENCOURAGEMENTS[todayMood], variantSeed);
  return t(variant.tr(name) + extra, variant.en(name) + extra);
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
