import { useEffect } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// web/src/components/PulseMark.tsx'in RN karşılığı - AYNI path/imza motif,
// react-native-svg + reanimated ile çizilme animasyonu.
// react-native-svg'nin `pathLength` normalizasyonu platformlar arası tutarsız
// olabildiği için (web'deki gibi 0->1 değil) burada path'in GERÇEK
// uzunluğunu aşan sabit bir strokeDasharray (DASH_LENGTH) kullanılıyor -
// offset bu sabite göre animasyonlanıyor.
//
// ÖNEMLİ: DASH_LENGTH gerçek path uzunluğunu ÇOK aşarsa (2026-08-20'de
// olduğu gibi - PULSE_PATH kısaldıkça kısaldı ama DASH_LENGTH eski/daha
// uzun bir path'ten kalma 260'ta sabit kaldı), çizgi görsel olarak
// `progress`in ~%57'sinde ZATEN tam görünür hale geliyor (kalan süre boşa
// gidiyor) - offsetteki DASH_LENGTH*progress, gerçek uzunluğa (RealLength)
// ulaşır ulaşmaz path zaten tamamen görünür (bkz. görünür uzunluk =
// min(RealLength, DASH_LENGTH*progress)). Bu, web'in `pathLength=1` TAM
// normalizasyonuna göre mobilin gözle GÖRÜNÜR OLARAK daha hızlı çizilmesine
// yol açtı (kullanıcı fark etti: "mobilde hala biraz daha hızlı gidiyor").
// Bu yüzden PULSE_PATH her değiştiğinde DASH_LENGTH da gerçek uzunluğa
// (küçük bir tampon payıyla) yeniden ayarlanmalı.
//
// Motif geçmişi (2026-08-20): önce "Nabız → Eğri" (EKG'nin sağda çapraz bir
// yükselen eğriye dönüşmesi) denendi - kullanıcı bunu üç turdur "kayık/
// bozuk" buldu. Tamamen yatay iki-eşit-vuruşlu bir versiyona geçildi ama bu
// sefer "nabız olduğu belirgin değil, çok yatay" geri bildirimi geldi -
// kullanıcı somut bir referans görsel attı (klasik EKG monitörü ikonu: küçük
// bir ön-titreşim + TEK çok belirgin/sivri/yüksek bir ana atım, aralarda düz
// çizgi). Şimdiki hal o referansa göre - atımın DİKLİĞİ (genişliğine göre
// çok yüksek olması) "nabız" hissini veren asıl unsurmuş, iki eşit yumuşak
// dalga değil. Yine tamamen yatay taban (y=21) korunuyor - çapraz/eğik
// okunma sorunu geri gelmesin.
const PULSE_PATH =
  "M2,21 L22,21 L27,16 L32,26 L37,21 L46,21 L54,5 L62,37 L70,21 L96,21";
// PULSE_PATH'in gerçek uzunluğu ~149.1 (düz çizgi parçalarının toplamı) -
// 156, küçük bir tampon payıyla bunu güvenle aşıyor ama artık eskisi
// (260) gibi aşırı büyük değil.
const DASH_LENGTH = 156;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function PulseMark({
  size = 24,
  color = "#DD5B2E",
  animated = false,
  loop = false,
  pulseEveryMs,
}: {
  size?: number;
  color?: string;
  /** Bileşen görünür olduğunda bir kere "kendini çizerek" belirir. */
  animated?: boolean;
  /** Yükleme durumu — animasyon SÜREKLİ (aralıksız) tekrar eder. */
  loop?: boolean;
  /** `animated` ile birlikte: sürekli döngü yerine, bir atımın
   * başlangıcından bir sonrakinin başlangıcına kadar bu kadar milisaniye
   * süren periyodik bir "canlı nabız" ritmi - marka öğesinin durağan
   * durduğu ekranlarda (ör. giriş/şifremi-unuttum) ara sıra kendini
   * hatırlatması için (2026-08-20, kullanıcı isteği: "2 saniyede bir
   * olacak şekilde ayarla, canlı hissi versin"). `loop` verilmişse bu
   * görmezden gelinir. */
  pulseEveryMs?: number;
}) {
  const progress = useSharedValue(animated ? 0 : 1);
  const dotOpacity = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      progress.value = 1;
      dotOpacity.value = 1;
      return;
    }
    if (loop) {
      progress.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false
      );
      dotOpacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else if (pulseEveryMs) {
      // pulseEveryMs = bir atımın BAŞLANGICINDAN bir sonrakinin başlangıcına
      // kadarki tam döngü süresi (2026-08-20, kullanıcı: "2 saniyede bir
      // olacak şekilde ayarla" - "her X ms bekle" değil, "her X ms'de bir
      // tetiklensin"). Çizim süresi 800ms (ilk sürüm 550ms'ydi - kullanıcı
      // "nabız çizgisi çok hızlı atıyor, hafif yavaşlat" dedi), kalan süre
      // tam çizili durur, sonra ani sıfırlanıp yeniden başlar.
      const drawDuration = 800;
      const holdDuration = Math.max(0, pulseEveryMs - drawDuration);
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: drawDuration, easing: Easing.inOut(Easing.cubic) }),
          withDelay(holdDuration, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
      dotOpacity.value = withRepeat(
        withSequence(
          withDelay(Math.max(0, drawDuration - 200), withTiming(1, { duration: 200, easing: Easing.ease })),
          withDelay(holdDuration, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
    } else {
      progress.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) });
      dotOpacity.value = withTiming(1, { duration: 300, easing: Easing.ease });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, loop, pulseEveryMs]);

  const animatedPathProps = useAnimatedProps(() => ({
    strokeDashoffset: DASH_LENGTH * (1 - progress.value),
  }));
  const animatedDotProps = useAnimatedProps(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <Svg width={size} height={size * 0.42} viewBox="0 0 100 42">
      <AnimatedPath
        d={PULSE_PATH}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[DASH_LENGTH, DASH_LENGTH]}
        animatedProps={animatedPathProps}
      />
      <AnimatedCircle cx={96} cy={21} r={4.5} fill={color} animatedProps={animatedDotProps} />
    </Svg>
  );
}
