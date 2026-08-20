/** PulseCoach'ın imza motifi — klasik bir EKG monitörü çizgisi. Hem logo hem
 * yükleme/boş-durum göstergesi olarak kullanılır (bkz. redesign planı).
 *
 * Motif geçmişi (2026-08-20): önce "Nabız → Eğri" (EKG'nin sağda çapraz bir
 * yükselen eğriye dönüşmesi) denendi - kullanıcı bunu üç turdur "kayık/
 * bozuk" buldu. Tamamen yatay iki-eşit-vuruşlu bir versiyona geçildi ama bu
 * sefer "nabız olduğu belirgin değil, çok yatay" geri bildirimi geldi -
 * kullanıcı somut bir referans görsel attı (klasik EKG monitörü ikonu: küçük
 * bir ön-titreşim + TEK çok belirgin/sivri/yüksek bir ana atım, aralarda düz
 * çizgi). Şimdiki hal o referansa göre - atımın DİKLİĞİ (genişliğine göre
 * çok yüksek olması) "nabız" hissini veren asıl unsurmuş, iki eşit yumuşak
 * dalga değil. Yine tamamen yatay taban (y=21) korunuyor - çapraz/eğik
 * okunma sorunu geri gelmesin.
 *
 * `pathLength={1}` SVG normalizasyonu sayesinde gerçek path uzunluğundan
 * bağımsız olarak CSS'teki `.pulse-draw` (stroke-dasharray/offset 0->1)
 * animasyonu her boyutta aynı şekilde çalışır. */
export function PulseMark({
  size = 24,
  animated = false,
  loop = false,
  pulseEveryMs,
  className = "",
}: {
  size?: number;
  /** Sayfa/ekran ilk yüklendiğinde bir kere "kendini çizerek" belirir. */
  animated?: boolean;
  /** Yükleme durumu — animasyon SÜREKLİ (aralıksız) tekrar eder. */
  loop?: boolean;
  /** `animated` ile birlikte: sürekli döngü yerine, bir atımın
   * başlangıcından bir sonrakinin başlangıcına kadar bu kadar milisaniye
   * süren periyodik "canlı nabız" ritmi - marka öğesinin durağan durduğu
   * ekranlarda (ör. giriş/şifremi-unuttum) ara sıra kendini hatırlatması
   * için (2026-08-20, kullanıcı isteği: "2 saniyede bir olacak şekilde
   * ayarla"). Mobil `pulse-mark.tsx`'teki AYNI prop/anlam - CSS'teki
   * `.pulse-draw-periodic` yüzdeleri 2000ms varsayımına göre (bkz.
   * globals.css), bu prop farklı bir değerle çağrılırsa `animation-duration`
   * inline stille ezilir (oran korunur, mutlak süreler ölçeklenir). `loop`
   * verilmişse bu görmezden gelinir. */
  pulseEveryMs?: number;
  className?: string;
}) {
  const periodicDurationStyle = pulseEveryMs ? { animationDuration: `${pulseEveryMs}ms` } : undefined;
  const pathClassName = animated
    ? pulseEveryMs
      ? "pulse-draw-periodic"
      : `pulse-draw ${loop ? "pulse-draw-loop" : ""}`
    : undefined;

  return (
    <svg
      width={size}
      height={size * 0.42}
      viewBox="0 0 100 42"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2,21 L22,21 L27,16 L32,26 L37,21 L46,21 L54,5 L62,37 L70,21 L96,21"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={pathClassName}
        style={periodicDurationStyle}
      />
      <circle cx="96" cy="21" r="4.5" fill="currentColor" style={periodicDurationStyle} />
    </svg>
  );
}
