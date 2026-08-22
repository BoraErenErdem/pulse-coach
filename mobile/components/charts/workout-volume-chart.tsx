import { useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import type { WorkoutSession, WorkoutType } from "@/lib/api";
import { WORKOUT_TYPE_LABELS, type ThemeColors, useThemeColors, workoutTypeColors } from "@/components/ui";
import { useLanguage, useT } from "@/lib/language-context";
import { formatDate } from "@/lib/format";
import { chartAxisProps, chartWidthFor, thinnedLabel } from "./chart-utils";

// web/src/components/charts/WorkoutVolumeChart.tsx'in mobil portu.

// Redesign (2026-08-22, kullanıcı isteği): önceden bir ÇUBUK grafikti, ama
// başlığı "Trend" diyordu ve uygulamadaki DİĞER tüm "trend" grafikleri
// (Kalori, Ruh Hali, Kilo) çizgi grafik - dataviz kuralı da "zaman içindeki
// eğilim" işi için çizgiyi öneriyor (çubuk daha çok kategori KIYASLAMASI
// için). Çubuğun tek avantajı her noktanın KENDİ rengiyle antrenman türünü
// gösterebilmesiydi - bu, çizgi grafikte de KAYBOLMADI: her veri noktası
// `dataPointColor` ile kendi türünün rengini taşıyor, sadece BAĞLAYICI çizgi
// nötr (c.muted) - "genel hacim eğilimi" asıl hikaye, tür kimliği noktalarda
// ikincil bilgi olarak duruyor. `curved` KULLANILMADI: antrenman günleri
// düzensiz aralıklarla geliyor (haftada 2-3 gün, aradaki günler veri
// noktası bile değil) - eğrilmiş bir çizgi, olmayan günler arasında yumuşak
// bir geçiş VARMIŞ gibi yanıltırdı, düz segmentler daha dürüst.
//
// İKİNCİ tur (kullanıcı sorusu, 2026-08-22): "toplam günlük hacim" mi doğru
// metrik, yoksa egzersiz bazında mı olmalı? Karar: metrik AYNI kalıyor
// (toplam hacim = standart "volume load" kavramı, egzersiz bazlı ilerleme
// zaten Antrenman→Egzersizlerim→[egzersiz] ekranında AYRI/özel olarak var).
// Bunun yerine bir ORTA YOL: noktaya dokununca o günün egzersiz kırılımını
// gösteren bir detay eklendi.
//
// ÜÇÜNCÜ tur (kullanıcı bulgusu, gerçek telefonda): sürükleme-tabanlı
// `pointerConfig` (kayan tooltip) 3 ayrı sorun çıkardı: (1) dışarı basınca
// kapanmıyordu, (2) sabit boyutlu kutuda uzun egzersiz adları toplam hacmi
// GÖRÜNMEZ kılıyordu (tek satırlık metin `İsim: Xkg` uzun isimde kırpılınca
// sayı da kırpılan kısımla birlikte kayboluyordu), (3) EN ÖNEMLİSİ:
// kütüphanenin sürekli-takip eden dokunma responder'ı grafiğin kendi yatay
// KAYDIRMA jestiyle çakışıyordu - `onResponderTerminationRequest` hep
// `false` döndüğü için responder'ı asla bırakmıyor, kaydırma bir daha hiç
// çalışmıyordu.
//
// DÖRDÜNCÜ tur - KÖKTEN çözüm: `pointerConfig` TAMAMEN kaldırıldı, yerine
// HER noktanın kendi `onPress`'i (react-native-svg'nin sıradan dokunma
// olayı - sürekli-takip responder'ı YOK, bu yüzden kaydırmayla ÇAKIŞMIYOR)
// + grafiğin ALTINDA sabit bir "Seçili Gün" paneli geldi. Panel kart
// genişliğinde olduğu için kesinti/sayı sınırına hiç gerek yok (egzersiz
// adı ne kadar uzun olursa olsun ad/hacim AYRI hizalanmış sütunlarda -
// hacim asla kırpılmıyor), boyutu içeriğe göre doğal olarak büyüyüp
// küçülüyor. Varsayılan olarak EN GÜNCEL güne bakıyor (scrollToEnd ile
// tutarlı) - kullanıcı hiç dokunmasa bile panel boş kalmıyor.
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

  function pointColor(workoutTypes: WorkoutType[]): string {
    if (workoutTypes.length === 0) return c.muted;
    if (workoutTypes.length === 1) return workoutTypeColors[workoutTypes[0]];
    return workoutTypeColors.karışık;
  }

  // Kullanıcı sessions değiştirdikçe (yeni kayıt ekleyince) index hâlâ
  // geçerli aralıkta kalsın diye clamp ediliyor - varsayılan EN GÜNCEL gün
  // (scrollToEnd'in gösterdiği uçla tutarlı).
  const effectiveIndex = Math.min(selectedIndex ?? points.length - 1, points.length - 1);
  const selectedPoint = points[effectiveIndex];

  // Kullanıcı bulgusu (gerçek telefonda): görsel nokta (4-6px yarıçap) çok
  // küçük kalınca dokunuş çoğu zaman ıskalıyordu. İLK deneme:
  // `customDataPoint` ile görünmez ama büyük bir dokunma alanı bindirmek
  // - bu, dokunuşu TAMAMEN kırdı (kullanıcı bulgusu: "hiçbir şey olmuyor").
  // Kök neden muhtemelen `customDataPoint`'in native tarafta SVG içine
  // mutlak-konumlu bir View olarak (kütüphanenin kendi animasyon/opaklık
  // sarmalayıcısıyla) yerleştirilmesi - react-native-svg'nin dokunma
  // çözümlemesiyle güvenilir şekilde örtüşmüyor. GERİ ALINDI. Bunun yerine
  // basit/kanıtlanmış yol: kütüphanenin KENDİ `Circle` render'ı (zaten
  // dokunuşu güvenilir şekilde alıyordu, sadece küçüktü) - yarıçap
  // belirgin şekilde büyütüldü (4-6'dan 9-12'ye) ki hedef ~24px çapa
  // yaklaşsın, ayrı bir görünmez katmana gerek kalmadı.
  const data = points.map((p, index) => ({
    value: p.volume,
    label: thinnedLabel(index, points.length, formatDate(p.date, language, { day: "2-digit", month: "2-digit" })),
    // Kullanıcı isteği (2026-08-06, çubuk grafik döneminden kalan ilke -
    // 2026-08-22 çizgiye geçişte KORUNDU): hangi antrenman türünün ne
    // hacimde olduğu görülebilsin diye nokta rengi türe göre -
    // WorkoutTypeChart'taki AYNI palet.
    dataPointColor: pointColor(p.workoutTypes),
    // Kullanıcı bulgusu (2026-08-22, gerçek telefonda): 9-12px "kaba"
    // duruyordu görsel olarak - dokunma alanını tamamen kaybetmeden
    // (bkz. yukarıdaki customDataPoint notu) biraz küçültüldü.
    dataPointRadius: index === effectiveIndex ? 8 : 6,
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
      <LineChart
        data={data}
        width={chartWidth}
        height={200}
        thickness={2}
        color={c.muted}
        noOfSections={4}
        {...chartAxisProps(11, c)}
        initialSpacing={12}
        spacing={points.length > 1 ? Math.max(24, chartWidth / points.length) : 40}
        scrollToEnd
      />
      <View style={s.detailPanel}>
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
      </View>
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
