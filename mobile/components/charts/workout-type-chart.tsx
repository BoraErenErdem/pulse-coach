import { memo, useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import Animated, { FadeIn } from "react-native-reanimated";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { type ThemeColors, WORKOUT_TYPE_LABELS, useThemeColors, useWorkoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { chartWidthFor } from "./chart-utils";

// web/src/components/charts/WorkoutTypeChart.tsx'in mobil portu - 2026-08-06:
// İlerleme sekmesinden Antrenman sekmesine taşındı (Faz B, İlerleme↔Antrenman
// tekrarını giderme kararı), veri kaynağı ProgressLog.workout_type yerine
// WorkoutSession.workout_type oldu - gerçek antrenman kayıtlarını yansıtır.
//
// Perf taraması bulgusu (2026-09-21) - bkz. workout-volume-chart.tsx'teki
// AYNI not: `memo` react-native-gifted-charts'ın SVG render maliyetini
// SADECE `sessions` gerçekten değiştiğinde ödetir.
//
// `themeColors` (2026-09-22 redesign): Antrenman sekmesi bu grafiği artık
// sıcak kahve panelin (ProgressSectionCard) İÇİNE koyuyor - ortak `c.muted`
// (soğuk teal-gri) o zeminde SOLUK kalıyordu (İlerleme'deki AYNI bulgu, bkz.
// progress.tsx::panelMuted). Opsiyonel override YOKSA normal ekran zemini
// varsayılanına düşer (geri uyumlu).
export const WorkoutTypeChart = memo(function WorkoutTypeChart({
  sessions,
  themeColors,
}: {
  sessions: WorkoutSession[];
  themeColors?: ThemeColors;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = chartWidthFor(width);
  const { language } = useLanguage();
  const t = useT();
  const defaultColors = useThemeColors();
  const c = themeColors ?? defaultColors;
  const workoutTypeColors = useWorkoutTypeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  // Kullanıcı isteği (2026-09-22): bir bara dokununca altta o türe dair kısa
  // bir özet çıksın - WorkoutVolumeChart'taki "Seçili Gün" panelinin AYNI
  // deseni. Set/hacim/süre/kalori toplamları `sessions`'tan (backend'in
  // hazır sayaçlarına gerek yok - zaten sayfada yüklü ham veri) çıkarılıyor.
  const typeStats = useMemo(() => {
    const stats = new Map<WorkoutType, { sets: number; volumeKg: number; durationMinutes: number; calories: number }>();
    for (const session of sessions) {
      if (!session.workout_type) continue;
      const type = session.workout_type as WorkoutType;
      const entry = stats.get(type) ?? { sets: 0, volumeKg: 0, durationMinutes: 0, calories: 0 };
      for (const set of session.sets) {
        entry.sets += 1;
        if (set.weight_kg && set.reps) entry.volumeKg += set.weight_kg * set.reps;
        if (set.duration_minutes) entry.durationMinutes += set.duration_minutes;
        if (set.estimated_calories) entry.calories += set.estimated_calories;
      }
      stats.set(type, entry);
    }
    return stats;
  }, [sessions]);
  const [selectedType, setSelectedType] = useState<WorkoutType | null>(null);

  const data = useMemo(() => {
    const counts: Partial<Record<WorkoutType, number>> = {};
    for (const session of sessions) {
      if (session.workout_type) {
        const type = session.workout_type as WorkoutType;
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    return (Object.keys(WORKOUT_TYPE_LABELS[language]) as WorkoutType[])
      .map((key) => ({
        type: key,
        value: counts[key] ?? 0,
        label: WORKOUT_TYPE_LABELS[language][key],
        frontColor: workoutTypeColors[key],
      }))
      .filter((item) => item.value > 0);
  }, [sessions, language, workoutTypeColors]);

  // En kalabalık tür varsayılan seçili (WorkoutVolumeChart'ın "en güncel gün"
  // varsayılanıyla AYNI ilke - dokunma affordance'ı ilk açılışta da bir
  // örnekle görünsün). Hooks kuralı (koşulsuz çağrı) nedeniyle bu ve
  // `chartData` aşağıdaki "veri yok" erken dönüşünden ÖNCE - `data` boşsa da
  // güvenli (undefined/[] düşer), sonucu zaten hiç okunmaz.
  const mostCommon = data.length > 0 ? data.reduce((max, item) => (item.value > max.value ? item : max), data[0]) : undefined;
  const effectiveType = selectedType && typeStats.has(selectedType) ? selectedType : mostCommon?.type;
  const effectiveStat = effectiveType ? typeStats.get(effectiveType) : undefined;
  const effectiveLabel = effectiveType ? WORKOUT_TYPE_LABELS[language][effectiveType] : "";
  const effectiveColor = effectiveType ? workoutTypeColors[effectiveType] : c.text;

  // Seçili çubuk vurgusu - WorkoutVolumeChart'taki AYNI token (`c.text`
  // kenarlık, bkz. o dosyadaki gerekçe notu: paletten bağımsız, hiçbir
  // türle çakışmıyor).
  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        barBorderWidth: item.type === effectiveType ? 3 : 0,
        barBorderColor: c.text,
        onPress: () => setSelectedType(item.type),
      })),
    [data, effectiveType, c.text]
  );

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

  // Kullanıcı bulgusu (2026-09-22): "Kuvvet" için "28 dk toplam süre"
  // görünmesi bug SANILDI - kontrol edildi, veri DOĞRU (o Kuvvet etiketli
  // oturumların içinde gerçekten bir koşu bandı + birkaç Plank seti vardı,
  // set bazında `duration_minutes` taşıyorlar). Sorun hesaplama değil, HANGİ
  // özetin gösterildiğiydi - Kuvvet/Karışık ağırlık-öncelikli, Kardiyo/
  // Esneklik süre-öncelikli; türe YABANCI bir metriği (ör. Kuvvet'te süre)
  // göstermek doğru olsa da kafa karıştırıyordu. Artık her tür SADECE kendi
  // doğal metriğini gösteriyor - Karışık (bilerek "hepsi") istisna.
  const relevantMetrics: Record<WorkoutType, ("volume" | "duration" | "calories")[]> = {
    kuvvet: ["volume"],
    kardiyo: ["duration", "calories"],
    esneklik: ["duration", "calories"],
    karışık: ["volume", "duration", "calories"],
  };
  const detailParts: string[] = [];
  if (effectiveStat && effectiveType) {
    const allowed = relevantMetrics[effectiveType];
    if (allowed.includes("volume") && effectiveStat.volumeKg > 0) {
      detailParts.push(t(`${effectiveStat.volumeKg.toFixed(0)} kg toplam hacim`, `${effectiveStat.volumeKg.toFixed(0)} kg total volume`));
    }
    if (allowed.includes("duration") && effectiveStat.durationMinutes > 0) {
      detailParts.push(t(`${effectiveStat.durationMinutes} dk toplam süre`, `${effectiveStat.durationMinutes} min total duration`));
    }
    if (allowed.includes("calories") && effectiveStat.calories > 0) {
      detailParts.push(t(`~${effectiveStat.calories.toFixed(0)} kcal`, `~${effectiveStat.calories.toFixed(0)} kcal`));
    }
  }

  return (
    <View>
      <BarChart
        data={chartData}
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
      {/* Kullanıcı isteği (2026-09-22): bara dokununca altta o türe dair kısa
          bir özet - WorkoutVolumeChart'taki "Seçili Gün" panelinin AYNI deseni
          (`key`'e bağlı FadeIn - seçim değişince yeniden oynar). */}
      <Animated.View key={effectiveType} entering={FadeIn.duration(200)} style={s.detailPanel}>
        <View style={s.detailHeader}>
          <View style={[s.detailDot, { backgroundColor: effectiveColor }]} />
          <Text style={[s.detailTitle, { color: c.text }]}>
            {effectiveLabel} · {t(`${effectiveStat?.sets ?? 0} set`, `${effectiveStat?.sets ?? 0} sets`)}
          </Text>
        </View>
        {detailParts.length > 0 ? <Text style={[s.detailText, { color: c.muted }]}>{detailParts.join(" · ")}</Text> : null}
      </Animated.View>
    </View>
  );
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    detailPanel: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 4,
    },
    detailHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
    detailDot: { width: 8, height: 8, borderRadius: 4 },
    detailTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
    detailText: { fontSize: 12 },
  });
}
