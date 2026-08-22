import { colors, type ThemeColors } from "@/components/ui";

// weight-chart/calorie-trend-chart/mood-trend-chart/trend-correlation-chart/
// workout-volume-chart'ın HER BİRİ kendi kopyasında birebir aynı etiket
// seyreltme mantığını (MAX_VISIBLE_LABELS + thinnedLabel) ve eksen stil
// nesnelerini tekrarlıyordu (2026-08-10 mimari borç raporu, bulgu #14) - tek
// paylaşımlı yardımcılarla birleştirildi.

/** Son N güne/haftaya kadar veri gelebiliyor - HER etiketi göstermek telefon
 * genişliğinde sıkışıp okunmaz oluyordu (canlı testte bulundu). En fazla
 * `maxVisibleLabels` etiket görünecek şekilde aradakiler boş bırakılır, veri
 * noktalarının kendisi hâlâ hepsi için çizilir (sadece etiket metni
 * seyrekleştirilir). */
export function thinnedLabel(index: number, total: number, label: string, maxVisibleLabels = 8): string {
  const stride = Math.max(1, Math.ceil(total / maxVisibleLabels));
  return index % stride === 0 ? label : "";
}

/** Ruh hali 1-5 ölçeğinin dile göre etiketleri - MoodTrendChart ve
 * TrendCorrelationChart'ta birebir aynı kopyayla vardı. */
export function moodScaleLabels(t: (tr: string, en: string) => string): Record<number, string> {
  return {
    1: t("Zor", "Tough"),
    2: t("Düşük", "Low"),
    3: t("Nötr", "Neutral"),
    4: t("İyi", "Good"),
    5: t("Harika", "Great"),
  };
}

// Kullanıcı bulgusu (2026-08-22, Antrenman sekmesi): grafikler kartın içine
// tam sığmıyor, sağa doğru hafif bir taşma/kayma oluyordu. Kök neden:
// react-native-gifted-charts'a verdiğimiz `width` prop'unun DIŞINDA,
// kütüphane KENDİ Y ekseni etiket sütununu (varsayılan 35px -
// gifted-charts-core/AxesAndRulesDefaults.yAxisLabelWidth) ayrıca ekliyor -
// yani GERÇEK render genişliği = width + 35 (bkz. BarAndLineChartsWrapper
// içindeki `actualContainerWidth = (width ?? totalWidth) + yAxisLabelWidth`).
// Eski "ekran genişliği - 80" formülü sadece ScrollView konteyner (16×2) +
// Card padding (20×2) = 72'yi karşılamaya çalışıyordu, bu 35px'i hiç
// hesaba katmıyordu - grafik kartın gerçek iç alanından ~27px daha GENİŞ
// çiziliyor, bu da hafif bir sağa taşma olarak görünüyordu.
const SCREEN_HORIZONTAL_INSETS = 72; // ScrollView container (16×2) + Card padding (20×2)
const Y_AXIS_LABEL_RESERVE = 35; // gifted-charts-core'un varsayılan y ekseni etiket genişliği

/** Bir grafiğin `width` prop'una geçmesi gereken DOĞRU değer - ekran
 * genişliğinden ScrollView/Card iç boşluklarını VE kütüphanenin kendi Y
 * ekseni etiket payını düşer. `hideYAxisText` kullanan (Y ekseni metni
 * gizli) grafikler bu payı gerektirmez - böyle bir grafik varsa AYRI bir
 * hesap gerekir, şu an TÜM çağıran grafikler Y eksenini gösteriyor. */
export function chartWidthFor(screenWidth: number): number {
  return screenWidth - SCREEN_HORIZONTAL_INSETS - Y_AXIS_LABEL_RESERVE;
}

/** react-native-gifted-charts'ın çoğu çizgi/çubuk grafikte tekrarlanan ortak
 * eksen/gridline stili - spread ile kullanılır: `<LineChart {...chartAxisProps(11, c)} .../>`.
 * `yAxisFontSize` grafikten grafiğe değişebiliyor (ör. mood ölçeği metinleri
 * için 10, sayısal değerler için 11) - geri kalanı sabit. `themeColors`
 * parametresi teknik olarak opsiyonel (statik açık tema paletine düşer) ama
 * ARTIK TÜM çağıran grafikler `useThemeColors()`'ın sonucunu açıkça geçiriyor
 * (bkz. ui.tsx başındaki güncel not, 2026-08-21) - varsayılan sadece geriye
 * dönük bir güvenlik ağı, aktif kullanılan bir yol değil. */
export function chartAxisProps(yAxisFontSize = 11, themeColors: ThemeColors = colors) {
  return {
    yAxisTextStyle: { color: themeColors.muted, fontSize: yAxisFontSize },
    xAxisLabelTextStyle: { color: themeColors.muted, fontSize: 10 },
    rulesColor: themeColors.border,
    yAxisColor: themeColors.border,
    xAxisColor: themeColors.border,
  };
}
