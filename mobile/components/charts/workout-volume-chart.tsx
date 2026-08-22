import { useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { BarChart } from "react-native-gifted-charts";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, type ThemeColors, useThemeColors, workoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, thinnedLabel } from "./chart-utils";

// web/src/components/charts/WorkoutVolumeChart.tsx'in mobil portu.
//
// BİRİNCİ redesign (2026-08-22): çubuktan çizgiye çevrildi - başlığı
// "Trend" diyordu, diğer trend grafikleri çizgiydi, dataviz kuralı da
// "zaman içindeki eğilim" için çizgiyi öneriyordu.
//
// İKİNCİ redesign (aynı gün, kullanıcı geri bildirimi): kullanıcı çizgi
// grafiğin MANTIĞINI sevdi (her noktada o günün hacmini kolayca görüp
// takip edebiliyordu) ama "mobilde çok kullanıcı dostu değil" buldu - kök
// neden bir NOKTAYA (5-7px yarıçap) parmakla isabet ettirmenin doğası
// gereği zor olması, büyütülünce de görsel olarak "kaba" durması (bkz. bu
// dosyanın önceki sürümündeki notlar). ÇÖZÜM: çubuğa GERİ DÖNÜLDÜ - bir
// çubuğun dokunma alanı (20-30px genişlik) bir noktadan doğal olarak çok
// daha büyük, hiçbir büyütme/küçültme ayarına gerek kalmadan mobilde kolay
// hedeflenir. MANTIK (metrik, günlük birleşim, tür rengi, dokununca altta
// "Seçili Gün" paneli) TAMAMEN AYNI kaldı - sadece görsel form değişti.
// Antrenman günleri düzensiz aralıklarla geldiği için (haftada 2-3 gün)
// ayrık çubuklar bu "süreklilik yok" gerçeğini çizgiden bile daha dürüst
// yansıtıyor.
//
// Boyutlandırma: BAR_WIDTH sabit, `spacing` chartWidth'e göre hesaplanıyor
// (`Math.max(taban, ...)` - az günde barlar kartı doldurur, çok günde
// tabana düşüp grafik doğal olarak yatay kaydırılabilir kalır - bu durumda
// kaydırma BEKLENEN bir davranış, onlarca günü tek ekrana sıkıştırmak
// zaten okunaksız olurdu). `endSpacing={0}`: BarChart bunu açıkça
// vermezsen `spacing`'e düşüyor, son çubuktan sonra hesaba katılmamış
// fazladan boşluk ekliyordu (bkz. chart-utils.ts::chartWidthFor'daki AYNI
// bulgu notu, workout-type-chart.tsx'te de aynı düzeltme var).
const BAR_WIDTH = 22;
const MIN_BAR_SPACING = 18;

export function WorkoutVolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const byDate = new Map<
    string,
    { volume: number; workoutTypes: Set<WorkoutType>; byExercise: Map<string, number> }
  >();
  for (const session of sessions) {
    const sessionVolume = session.sets.reduce(
      (sum, set) => sum + (set.weight_kg && set.reps ? set.weight_kg * set.reps : 0),
      0
    );
    if (sessionVolume <= 0) continue;
    const entry = byDate.get(session.session_date) ?? {
      volume: 0,
      workoutTypes: new Set<WorkoutType>(),
      byExercise: new Map<string, number>(),
    };
    entry.volume += sessionVolume;
    if (session.workout_type) entry.workoutTypes.add(session.workout_type as WorkoutType);
    for (const set of session.sets) {
      if (set.weight_kg && set.reps) {
        const name = set.exercise_name_snapshot;
        entry.byExercise.set(name, (entry.byExercise.get(name) ?? 0) + set.weight_kg * set.reps);
      }
    }
    byDate.set(session.session_date, entry);
  }

  const points = Array.from(byDate.entries())
    .map(([date, entry]) => ({
      date,
      volume: entry.volume,
      workoutTypes: Array.from(entry.workoutTypes),
      byExercise: Array.from(entry.byExercise.entries()).sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return (
      <Text style={{ fontSize: 13, color: c.muted }}>
        {t(
          "Henüz ağırlıklı set verisi yok. Antrenman kaydettikçe hacim trendi burada görünecek.",
          "No weighted set data yet. The volume trend will show up here as you log workouts."
        )}
      </Text>
    );
  }

  const usedTypes = Array.from(new Set(points.flatMap((p) => p.workoutTypes))) as WorkoutType[];

  function barColor(workoutTypes: WorkoutType[]): string {
    if (workoutTypes.length === 0) return c.muted;
    if (workoutTypes.length === 1) return workoutTypeColors[workoutTypes[0]];
    return workoutTypeColors.karışık;
  }

  // Kullanıcı sessions değiştirdikçe (yeni kayıt ekleyince) index hâlâ
  // geçerli aralıkta kalsın diye clamp ediliyor - varsayılan EN GÜNCEL gün
  // (scrollToEnd'in gösterdiği uçla tutarlı).
  const effectiveIndex = Math.min(selectedIndex ?? points.length - 1, points.length - 1);
  const selectedPoint = points[effectiveIndex];

  const initialSpacing = 12;
  const spacing = Math.max(MIN_BAR_SPACING, (chartWidth - initialSpacing) / points.length - BAR_WIDTH);

  const data = points.map((p, index) => ({
    value: p.volume,
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
    // Kullanıcı isteği (2026-08-06): hangi antrenman türünün ne hacimde
    // olduğu görülebilsin diye çubuk rengi türe göre - WorkoutTypeChart'
    // taki AYNI palet.
    frontColor: barColor(p.workoutTypes),
    // Seçili çubuk ince bir kenarlıkla vurgulanıyor - kullanıcı bulgusu:
    // c.text (koyu modda neredeyse beyaz) yabancı/keskin bir çizgi gibi
    // duruyordu - uygulamanın kendi "bu seçili/vurgulu" rengi olan
    // c.accent'e çevrildi, markayla tutarlı.
    barBorderWidth: index === effectiveIndex ? 2 : 0,
    barBorderColor: c.accent,
    onPress: () => setSelectedIndex(index),
  }));

  const typeLabel =
    selectedPoint.workoutTypes.length === 1
      ? WORKOUT_TYPE_LABELS[language][selectedPoint.workoutTypes[0]]
      : selectedPoint.workoutTypes.length > 1
        ? WORKOUT_TYPE_LABELS[language].karışık
        : "";

  return (
    <View>
      <BarChart
        data={data}
        width={chartWidth}
        height={200}
        barWidth={BAR_WIDTH}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={0}
        barBorderRadius={4}
        noOfSections={4}
        {...chartAxisProps(11, c)}
        scrollToEnd
        // Kullanıcı bulgusu (gerçek telefonda): yüksek hacimli günlerin
        // yanında hacmi düşük günlerin çubuğu görsel olarak çok kısa
        // kalıyordu - kütüphanede dokunma alanı ÇUBUĞUN GERÇEK yüksekliğine
        // bağlı (kısa çubuk = küçük dokunma alanı), bu yüzden düşük hacimli
        // günlere basmak zorlaşıyordu. `minHeight`: SADECE görsel/dokunma
        // yüksekliğine bir taban koyuyor - gerçek değeri/etiketi/eksen
        // ölçeğini DEĞİŞTİRMİYOR (bkz. RenderBars.js:
        // `Math.max(minHeight, value*heightFactor)`), en düşük hacimli gün
        // bile en az birkaç piksel yükseklikte ve dokunulabilir kalıyor.
        minHeight={8}
      />
      {/* Kullanıcı isteği: dokununca "hafif ve akıcı bir animasyon girsin" -
          çubuğun kendi renk/kenarlık değişimi SVG tarafında anlık (kütüphane
          bunu animasyonlu geçiş olarak desteklemiyor), ama bu panel
          TAMAMEN bizim kontrolümüzde - `key={effectiveIndex}` her seçim
          değişiminde YENİDEN mount ettirip `FadeIn`'i tekrar oynatıyor,
          uygulamanın her yerinde kullanılan AYNI (200ms) yumuşak geçiş. */}
      <Animated.View key={effectiveIndex} entering={FadeIn.duration(200)} style={s.detailPanel}>
        <Text style={s.detailDate}>
          {formatDate(selectedPoint.date, language, { day: "2-digit", month: "long" })}
          {typeLabel ? ` · ${typeLabel}` : ""}
        </Text>
        {selectedPoint.byExercise.map(([name, volume]) => (
          <View key={name} style={s.detailRow}>
            <Text style={s.detailExercise} numberOfLines={1}>
              {name}
            </Text>
            <Text style={s.detailVolume}>{volume.toFixed(0)}kg</Text>
          </View>
        ))}
        <View style={s.detailTotalRow}>
          <Text style={s.detailTotalLabel}>{t("Toplam", "Total")}</Text>
          <Text style={s.detailTotalVolume}>{selectedPoint.volume.toFixed(0)}kg</Text>
        </View>
      </Animated.View>
      {usedTypes.length > 0 ? (
        <View style={s.legend}>
          {usedTypes.map((type) => (
            <View key={type} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: workoutTypeColors[type] }]} />
              <Text style={s.legendText}>{WORKOUT_TYPE_LABELS[language][type]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginTop: 10,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 11,
      color: c.muted,
    },
    // "Seçili Gün" paneli - kart genişliğinde, kesinti/sayı sınırı yok
    // (bkz. yukarıdaki not) - ad/hacim AYRI sütunlar (`detailRow` içinde
    // flex ile ayrılmış) sayesinde ad ne kadar uzun olursa olsun hacim
    // HİÇBİR ZAMAN kırpılmıyor.
    detailPanel: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 4,
    },
    detailDate: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: c.text,
      marginBottom: 2,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    detailExercise: {
      flex: 1,
      fontSize: 12,
      color: c.muted,
    },
    detailVolume: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    detailTotalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    detailTotalLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
    },
    detailTotalVolume: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
  });
}
