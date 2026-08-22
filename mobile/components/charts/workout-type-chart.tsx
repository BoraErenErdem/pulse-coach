import { Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, useThemeColors, useWorkoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { chartWidthFor } from "./chart-utils";

// web/src/components/charts/WorkoutTypeChart.tsx'in mobil portu - 2026-08-06:
// İlerleme sekmesinden Antrenman sekmesine taşındı (Faz B, İlerleme↔Antrenman
// tekrarını giderme kararı), veri kaynağı ProgressLog.workout_type yerine
// WorkoutSession.workout_type oldu - gerçek antrenman kayıtlarını yansıtır.
export function WorkoutTypeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const workoutTypeColors = useWorkoutTypeColors();

  const counts: Partial<Record<WorkoutType, number>> = {};
  for (const session of sessions) {
    if (session.workout_type) {
      const type = session.workout_type as WorkoutType;
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  const data = (Object.keys(WORKOUT_TYPE_LABELS[language]) as WorkoutType[])
    .map((key) => ({
      value: counts[key] ?? 0,
      label: WORKOUT_TYPE_LABELS[language][key],
      frontColor: workoutTypeColors[key],
    }))
    .filter((item) => item.value > 0);

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t("Henüz tamamlanmış antrenman kaydı yok.", "No completed workout logged yet.")}
      </Text>
    );
  }

  // Antrenman türü sabit/sınırlı bir küme (4 tür - bkz. ui.tsx::WORKOUT_TYPE_LABELS),
  // ama SADECE o an en az bir kaydı olanlar çiziliyor (2-4 arası değişebiliyor).
  // ÖNCEDEN sabit barWidth=36/spacing=28 kullanılıyordu - kullanıcı bulgusu
  // (2026-08-22): "hafif yana taşma" (bkz. chart-utils.ts::chartWidthFor notu).
  // O düzeltmeyle bu sabit değerler dar ekranlarda ARTIK sığıyor olsa da,
  // veri sayısından TAMAMEN bağımsız sabit bir değer kırılgan - bar
  // sayısı+aralık toplamı `chartWidth`'i AŞMAYACAK şekilde veri sayısına göre
  // hesaplanıyor (barWidth 24-40 arasına sıkıştırılmış, çok az kutuda aşırı
  // şişmesin/çok kutuda aşırı incelmesin diye).
  // İKİNCİ tur (kullanıcı bulgusu: taşma hâlâ sürüyordu): kök neden
  // `endSpacing` idi - react-native-gifted-charts'ın BarChart'ı bunu açıkça
  // vermezsen `spacing`YLE AYNI değere düşürüyor (bkz. gifted-charts-core/
  // BarChart/index.js: `endSpacing = props.endSpacing ?? spacing`) - yani
  // son çubuktan SONRA da bir `spacing` kadar daha boşluk ekleniyordu, bu da
  // hesabıma HİÇ dahil değildi. `endSpacing={0}` ile kapatıldı (LineChart'ın
  // aksine - o sabit/küçük bir varsayılana düşüyor, bu yüzden çizgi
  // grafiklerde taşma görülmüyordu).
  const initialSpacing = 12;
  const perItem = (chartWidth - initialSpacing) / data.length;
  const barWidth = Math.max(24, Math.min(40, perItem * 0.55));
  const spacing = Math.max(16, perItem - barWidth);

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={200}
        barWidth={barWidth}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={0}
        barBorderRadius={6}
        showValuesAsTopLabel
        topLabelTextStyle={{ color: c.muted, fontSize: 12 }}
        xAxisLabelTextStyle={{ color: c.muted, fontSize: 11 }}
        yAxisTextStyle={{ color: c.muted, fontSize: 11 }}
        noOfSections={4}
        rulesColor={c.border}
        yAxisColor={c.border}
        xAxisColor={c.border}
      />
    </View>
  );
}
