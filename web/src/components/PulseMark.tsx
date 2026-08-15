/** PulseCoach'ın imza motifi — "Nabız → Eğri". Tek bir SVG path: soldan bir
 * EKG/nabız çizgisi başlar, sağda yumuşak bir yükselen trend eğrisine
 * dönüşür ve bir veri noktasında biter. Marka isminin (nabız) ve uygulamanın
 * çekirdek içeriğinin (ilerleme trendleri) birleştiği tek imza öğe — hem logo
 * hem yükleme/boş-durum göstergesi olarak kullanılır (bkz. redesign planı).
 *
 * `pathLength={1}` SVG normalizasyonu sayesinde gerçek path uzunluğundan
 * bağımsız olarak CSS'teki `.pulse-draw` (stroke-dasharray/offset 0->1)
 * animasyonu her boyutta aynı şekilde çalışır. */
export function PulseMark({
  size = 24,
  animated = false,
  loop = false,
  className = "",
}: {
  size?: number;
  /** Sayfa/ekran ilk yüklendiğinde bir kere "kendini çizerek" belirir. */
  animated?: boolean;
  /** Yükleme durumu — animasyon sonsuz tekrar eder. */
  loop?: boolean;
  className?: string;
}) {
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
        d="M2,24 L16,24 L20,13 L25,34 L29,6 L34,24 L41,24 C48,24 51,23 57,18 C68,9 78,5 92,5"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={animated ? `pulse-draw ${loop ? "pulse-draw-loop" : ""}` : undefined}
      />
      <circle cx="92" cy="5" r="4.5" fill="currentColor" />
    </svg>
  );
}
