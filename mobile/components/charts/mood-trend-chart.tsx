import { Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { MoodKey, MoodLog } from "@/lib/api";
import { colors, seriesColors } from "@/components/ui";

// web/src/components/charts/MoodTrendChart.tsx'in mobil portu.
const MOOD_SCALE: Record<MoodKey, number> = {
  zor: 1,
  dusuk: 2,
  notr: 3,
  iyi: 4,
  harika: 5,
};

const MOOD_SCALE_LABELS: Record<number, string> = {
  1: "Zor",
  2: "Düşük",
  3: "Nötr",
  4: "İyi",
  5: "Harika",
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

// WeightChart/TrendCorrelationChart'takiyle aynı sınıf sorun: her etiketi
// göstermek telefon genişliğinde sıkışıp okunmaz oluyor.
const MAX_VISIBLE_LABELS = 8;

function thinnedLabel(index: number, total: number, label: string): string {
  const stride = Math.max(1, Math.ceil(total / MAX_VISIBLE_LABELS));
  return index % stride === 0 ? label : "";
}

export function MoodTrendChart({ history }: { history: MoodLog[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;

  const sorted = [...history].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const data = sorted.map((entry, index) => ({
    value: MOOD_SCALE[entry.mood_key],
    label: thinnedLabel(index, sorted.length, formatDate(entry.log_date)),
  }));

  if (data.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: colors.muted }}>
        Henüz ruh hali kaydı yok. Sohbet sekmesindeki mod seçiciyi kullandıkça trend burada
        görünecek.
      </Text>
    );
  }

  return (
    <View>
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        curved
        areaChart
        color={seriesColors.series1}
        thickness={2}
        startFillColor={seriesColors.series1}
        endFillColor={seriesColors.series1}
        startOpacity={0.18}
        endOpacity={0}
        yAxisOffset={1}
        maxValue={4}
        noOfSections={4}
        yAxisLabelTexts={["Zor", "Düşük", "Nötr", "İyi", "Harika"]}
        yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
        rulesColor={colors.border}
        yAxisColor={colors.border}
        xAxisColor={colors.border}
        initialSpacing={12}
        spacing={data.length > 1 ? Math.max(24, chartWidth / data.length) : 40}
        dataPointsColor={seriesColors.series1}
        dataPointsRadius={3}
        pointerConfig={{
          pointerStripColor: colors.border,
          pointerColor: seriesColors.series1,
          radius: 5,
          pointerLabelComponent: (items: { value: number }[]) => (
            <View
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                {MOOD_SCALE_LABELS[items[0]?.value] ?? items[0]?.value}
              </Text>
            </View>
          ),
        }}
      />
    </View>
  );
}
