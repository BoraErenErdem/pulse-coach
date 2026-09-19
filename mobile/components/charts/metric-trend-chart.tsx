import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { ProgressLog } from "@/lib/api";
import { useThemeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import { formatDate } from "@/lib/format";
import { chartWidthFor, thinnedLabel, warmPanelAxisProps } from "./chart-utils";

const MAX_VISIBLE_LABELS = 5;

// WeightChart'ın genelleştirilmiş hali (2026-08-11, kullanıcı isteği: bel
// çevresi/vücut yağ oranı trendleri için de aynı grafik gerekiyordu) -
// tek/farklı olan alan hangi ProgressLog kolonuna bakıldığı (`getValue`),
// birim ve renk. WeightChart artık bu bileşenin ince bir sarmalayıcısı
// (bkz. weight-chart.tsx) - kopya kod yerine [[2026-08-10 mimari borç
// raporu]] ile aynı ilke.
//
// 2026-08-22: dokunma tooltip'i (`pointerConfig`) bilgilendirme kutusunun
// İÇİNDE "çizgi çizgi işaretler" gösteriyordu (kütüphanenin ForeignObject/
// Animated.View tabanlı pointer katmanı, grafiğin eğri çizgisi/alan
// dolgusuyla native tarafta güvenilir bir z-order kurmuyor) - önce
// WorkoutVolumeChart'taki desene (onPress + altta sabit "Seçili Değer"
// satırı) geçildi, AMA kullanıcı bulgusu: bu 3 grafik (Kilo/Bel/Vücut Yağı)
// zaten tek bakışta anlaşılır, dokunma detayına gerek yoktu - özellik
// TAMAMEN kaldırıldı, sade/salt-görsel bir trend çizgisine dönüldü. Nokta
// küçültüldü (6→3) ama "çok küçük kaldı" bulgusuyla 4'e çıkarıldı - çizgi
// kalınlaştırıldı (2→2.5). Bu boyutlar artık uygulamadaki TÜM sade (dokunma
// içermeyen) trend grafiklerinde ortak (bkz. mood-trend-chart.tsx,
// calorie-trend-chart.tsx, trend-correlation-chart.tsx) - görsel bütünlük.
function dedupeLastPerDay(logs: ProgressLog[], getValue: (log: ProgressLog) => number | null): ProgressLog[] {
  const byDate = new Map<string, ProgressLog>();
  for (const log of logs) {
    if (getValue(log) === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) {
      byDate.set(log.log_date, log);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.log_date.localeCompare(b.log_date));
}

// Y ekseni aralığı tam sayıya yuvarlandığı için bölüm sayısını aralığa TAM
// bölünen bir değerden seç - aksi halde küçük aralıklarda (ör. yağ oranı
// 16-19) "17.50 / 18.25" gibi anlaşılması zor adımlar çıkıyordu. Hiçbiri
// bölmüyorsa aralık 4'ün katına yukarı yuvarlanıyor (ör. 23 -> 24, adım 6).
function niceAxis(range: number): { range: number; sections: number } {
  for (const n of [4, 3, 5, 2]) {
    if (range % n === 0) return { range, sections: n };
  }
  return { range: Math.ceil(range / 4) * 4, sections: 4 };
}

export function MetricTrendChart({
  logs,
  getValue,
  unit,
  color,
  emptyMessage,
}: {
  logs: ProgressLog[];
  getValue: (log: ProgressLog) => number | null;
  unit: string;
  color: string;
  emptyMessage: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const c = useThemeColors();

  const dedupedLogs = dedupeLastPerDay(logs, getValue);
  const data = dedupedLogs.map((log, index) => ({
    value: getValue(log) as number,
    label: thinnedLabel(index, dedupedLogs.length, formatDate(log.log_date, language, { day: "2-digit", month: "2-digit" }), MAX_VISIBLE_LABELS),
  }));

  if (data.length === 0) {
    return <Text style={{ fontSize: 13, color: c.muted }}>{emptyMessage}</Text>;
  }

  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(1, (maxValue - minValue) * 0.15);
  const axisMin = Math.floor(minValue - padding);
  const axis = niceAxis(Math.ceil(maxValue + padding) - axisMin);

  // Tasarım turu (2026-09-19): grafik tek başına "bu ne söylüyor?" sorusunu
  // cevaplamıyordu (mobilde eksen etiketleri küçük, 8+ tarih sıkışık) -
  // artık ÜSTTE en güncel değer + ilk kayıttan bu yana fark var, eksen
  // birimi (kg/cm/%) başlığa taşındığı için Y ekseni etiketleri kısa ve
  // kesilmiyor. Fark BİLEREK nötr renkli (kırmızı/yeşil DEĞİL): kilo almak
  // da vermek de hedef olabilir, "iyi/kötü" yargısı vermemeli.
  const latest = values[values.length - 1];
  const delta = Math.round((latest - values[0]) * 10) / 10;
  const first = dedupedLogs[0];
  const last = dedupedLogs[dedupedLogs.length - 1];
  const rangeText =
    dedupedLogs.length > 1
      ? `${formatDate(first.log_date, language, { day: "numeric", month: "short" })} – ${formatDate(last.log_date, language, { day: "numeric", month: "short" })} · ${t(`${dedupedLogs.length} kayıt`, `${dedupedLogs.length} entries`)}`
      : t("1 kayıt", "1 entry");
  const unitText = unit.trim();
  const deltaText =
    delta === 0
      ? t("Değişmedi", "Unchanged")
      : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} ${unitText}`;

  const warmAxis = warmPanelAxisProps(11, c, isDark);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.header}>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: isDark ? "#FFFFFF" : c.text }]}>{latest}</Text>
          <Text style={[styles.unit, { color: isDark ? "rgba(255,255,255,0.8)" : c.muted }]}>{unitText}</Text>
        </View>
        {dedupedLogs.length > 1 ? (
          <View style={[styles.chip, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(245,162,107,0.16)" }]}>
            <Text style={[styles.chipText, { color: isDark ? "#FFFFFF" : c.text }]}>{deltaText}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.range, { color: isDark ? "rgba(255,255,255,0.8)" : c.muted }]}>{rangeText}</Text>
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        curved
        areaChart
        color={color}
        thickness={2.5}
        startFillColor={color}
        endFillColor={color}
        startOpacity={0.22}
        endOpacity={0}
        yAxisOffset={axisMin}
        maxValue={axis.range}
        noOfSections={axis.sections}
        formatYLabel={(label) => String(Math.round(Number(label) * 10) / 10)}
        {...warmAxis}
        initialSpacing={12}
        spacing={data.length > 1 ? Math.max(24, chartWidth / data.length) : 40}
        dataPointsColor={color}
        dataPointsRadius={4}
        scrollToEnd
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    flexShrink: 1,
  },
  value: {
    fontSize: 30,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 14,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  range: {
    fontSize: 12,
    marginTop: -6,
  },
});
