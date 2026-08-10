import { colors } from "@/components/ui";

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

/** react-native-gifted-charts'ın çoğu çizgi/çubuk grafikte tekrarlanan ortak
 * eksen/gridline stili - spread ile kullanılır: `<LineChart {...chartAxisProps()} .../>`.
 * `yAxisFontSize` grafikten grafiğe değişebiliyor (ör. mood ölçeği metinleri
 * için 10, sayısal değerler için 11) - geri kalanı sabit. */
export function chartAxisProps(yAxisFontSize = 11) {
  return {
    yAxisTextStyle: { color: colors.muted, fontSize: yAxisFontSize },
    xAxisLabelTextStyle: { color: colors.muted, fontSize: 10 },
    rulesColor: colors.border,
    yAxisColor: colors.border,
    xAxisColor: colors.border,
  };
}
