import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { useT } from "@/lib/language-context";

// web/src/components/charts/MacroDistributionChart.tsx'in mobil portu -
// dataviz kuralı korunuyor: sodyum (mg) farklı ölçekte olduğu için makrolar
// (g) ile AYNI grafikte değil, ayrı bir alt grafikte gösteriliyor.
export function MacroDistributionChart({
  proteinG,
  carbsG,
  fatG,
  sugarG,
  sodiumMg,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  sodiumMg: number;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 80;
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const s = useMemo(() => makeStyles(c), [c]);

  if (proteinG === 0 && carbsG === 0 && fatG === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>{t("Bugün için henüz öğün kaydı yok.", "No meal logged today yet.")}</Text>
    );
  }

  const gramsData = [
    { value: proteinG, label: t("Protein", "Protein"), frontColor: seriesColors.series2 },
    { value: carbsG, label: t("Karb.", "Carb."), frontColor: seriesColors.series3 },
    { value: fatG, label: t("Yağ", "Fat"), frontColor: seriesColors.series4 },
    { value: sugarG, label: t("Şeker", "Sugar"), frontColor: seriesColors.series5 },
  ];
  const sodiumData = [{ value: sodiumMg, label: t("Sodyum", "Sodium"), frontColor: seriesColors.series6 }];

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={s.subLabel}>{t("Makrolar (g)", "Macros (g)")}</Text>
        <BarChart
          data={gramsData}
          width={chartWidth}
          height={180}
          barWidth={32}
          spacing={24}
          barBorderRadius={4}
          showValuesAsTopLabel
          topLabelTextStyle={{ color: c.muted, fontSize: 11 }}
          xAxisLabelTextStyle={{ color: c.muted, fontSize: 11 }}
          yAxisTextStyle={{ color: c.muted, fontSize: 11 }}
          noOfSections={4}
          rulesColor={c.border}
          yAxisColor={c.border}
          xAxisColor={c.border}
        />
      </View>
      <View>
        <Text style={s.subLabel}>{t("Sodyum (mg) — ayrı ölçek", "Sodium (mg) — separate scale")}</Text>
        <BarChart
          data={sodiumData}
          width={chartWidth}
          height={140}
          barWidth={32}
          spacing={24}
          barBorderRadius={4}
          showValuesAsTopLabel
          topLabelTextStyle={{ color: c.muted, fontSize: 11 }}
          xAxisLabelTextStyle={{ color: c.muted, fontSize: 11 }}
          yAxisTextStyle={{ color: c.muted, fontSize: 11 }}
          noOfSections={4}
          rulesColor={c.border}
          yAxisColor={c.border}
          xAxisColor={c.border}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    subLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: c.muted,
      marginBottom: 6,
    },
  });
}
