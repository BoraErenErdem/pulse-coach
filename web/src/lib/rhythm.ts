import type { MoodKey } from "@/lib/api";
import { MOOD_KEYS } from "@/lib/api";

// Sohbetteki "Bugün" panelinin ritim skoru ve kişisel cümleleri - mobile/components/rhythm-ring.tsx'ten
// BİREBİR (2026-10-07, metinler ve seçim mantığı aynı kalsın diye kopyalandı; biri değişirse diğeri de).

/** movement/nutrition/mood yüzdelerinin ortalaması ("Ritim"); hiçbiri yoksa null. */
export function computeRhythmOverall(
  movementPct: number | null,
  nutritionPct: number | null,
  moodPct: number | null
): number | null {
  const values = [movementPct, nutritionPct, moodPct].filter((v): v is number => v != null);
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Ruh hali yüzdesi: zor %20 ... harika %100 (mobil index.tsx ile aynı). */
export function moodPctOf(mood: MoodKey | null): number | null {
  return mood ? (MOOD_KEYS.indexOf(mood) + 1) * 20 : null;
}

// ÖNCEDEN her bant TEK bir sabit cümleydi ("Fena değil" → "Yolunda bir gün"
// → 40-59 bandına 4 varyant). Kullanıcı isteği (2026-08-22): "diğer bantlara
// da varyant ekle, hepsinde 4'er tane olsun" - mood cümlelerindeki
// (MOOD_ENCOURAGEMENTS) AYNI "birden fazla pozitif varyant + rotasyon"
// deseni artık TÜM bantlara uygulandı, hepsi pozitif/teşvik edici tutuldu.
const RHYTHM_LABELS: Record<"great" | "balanced" | "onTrack" | "starting", { tr: string; en: string }[]> = {
  great: [
    { tr: "Harika gidiyor", en: "Going great" },
    { tr: "Bugün çok iyisin", en: "You're doing really well today" },
    { tr: "Zirvedesin", en: "On top of your game" },
    { tr: "Muhteşem bir gün geçiriyorsun", en: "You're having an amazing day" },
  ],
  balanced: [
    { tr: "Dengeli bir gün", en: "A balanced day" },
    { tr: "Güzel bir denge tutturdun", en: "You've struck a nice balance" },
    { tr: "İyi bir ritim yakaladın", en: "You've found a good rhythm" },
    { tr: "Sağlam gidiyor", en: "Going steady" },
  ],
  onTrack: [
    { tr: "İvme kazanıyorsun", en: "Building momentum" },
    { tr: "İyi bir tempo", en: "A good pace" },
    { tr: "İlerleme kaydediyorsun", en: "You're making progress" },
    { tr: "Adım adım ilerliyorsun", en: "Step by step, you're moving forward" },
  ],
  starting: [
    { tr: "Bugün başlangıç", en: "Today's a start" },
    { tr: "Henüz erken, devam et", en: "It's still early, keep going" },
    { tr: "İlk adımı atmaya hazırsın", en: "You're ready to take the first step" },
    { tr: "Bugün yeni bir sayfa", en: "Today's a fresh page" },
  ],
};

export function rhythmLabel(overall: number | null, t: (tr: string, en: string) => string, variantSeed = 0): string {
  function pick(key: keyof typeof RHYTHM_LABELS) {
    const variant = pickVariant(RHYTHM_LABELS[key], variantSeed);
    return t(variant.tr, variant.en);
  }
  if (overall == null) return pick("starting");
  if (overall >= 80) return pick("great");
  if (overall >= 60) return pick("balanced");
  if (overall >= 40) return pick("onTrack");
  return pick("starting");
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
 * Backend çağrısı GEREKMİYOR - tamamen istemci tarafı, elde olan state'ten.
 *
 * `streakDays`: kullanıcı isteği (2026-08-21) - "Bugün" paneline ayrı bir
 * alev+sayı rozeti eklemek yerine (streak zaten İlerleme+Profil'de var,
 * üçüncü bir yerde TEKRAR göstermek kalabalık olurdu - bkz. proje belleği)
 * mevcut cümleye ARA SIRA (her 3 yenilemede bir, `variantSeed` üzerinden)
 * bir streak notu ekleniyor. hareket/beslenme notuyla AYNI ANDA basılmıyor
 * (ikisi birden "Üstelik...Üstelik..." gibi uzayan/tekrarlı bir cümle
 * yaratırdı) - o turda streak notu SEÇİLDİYSE hareket/beslenme notunun
 * YERİNE geçiyor, seçilmediyse eskisi gibi davranıyor. */
export function rhythmEncouragement(
  todayMood: MoodKey | null,
  movementPct: number | null,
  nutritionPct: number | null,
  name: string | undefined,
  t: (tr: string, en: string) => string,
  variantSeed = 0,
  streakDays: number | null = null
): string {
  const who = name ? `${name}, ` : "";
  const hasMovement = (movementPct ?? 0) > 0;
  const hasNutrition = (nutritionPct ?? 0) > 0;
  const movementNutritionExtra =
    hasMovement && hasNutrition
      ? t(" Üstelik bugün hem hareket etmiş hem beslenmeni kaydetmişsin.", " Plus you've logged both movement and nutrition today.")
      : hasMovement
        ? t(" Üstelik bugün hareket de etmişsin.", " Plus you've been active today too.")
        : hasNutrition
          ? t(" Üstelik beslenmeni de kaydetmişsin bugün.", " Plus you've logged your nutrition today too.")
          : "";
  // En az 2 günlük bir seri "vurgulanmaya değer" sayılıyor (tek gün henüz
  // bir "seri" hissi vermiyor) - ve her seferinde DEĞİL, 3 yenilemeden
  // birinde (kullanıcı isteği: "ara sıra").
  const showStreakNote = (streakDays ?? 0) >= 2 && variantSeed % 3 === 0;
  const streakExtra = showStreakNote
    ? t(
        ` Üstelik ${streakDays} gündür üst üste hedeflerini tutturuyorsun.`,
        ` Plus you've hit your goals for ${streakDays} days in a row.`
      )
    : "";
  const extra = showStreakNote ? streakExtra : movementNutritionExtra;

  if (!todayMood) {
    return t(
      `${who}bugün ruh halini henüz paylaşmadın - seçtiğinde burada sana özel bir not belirir.`,
      `${who}you haven't shared your mood yet today - pick one and a note made just for you will show up here.`
    );
  }

  const variant = pickVariant(MOOD_ENCOURAGEMENTS[todayMood], variantSeed);
  return t(variant.tr(name) + extra, variant.en(name) + extra);
}
