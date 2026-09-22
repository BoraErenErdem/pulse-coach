import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PartyPopper } from "lucide-react-native";
import type { ExerciseGoalProgress } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { type ThemeColors, useSeriesColors, useThemeColors } from "@/components/ui";
import { GoalMeter } from "@/components/goal-meter";
import { SwipeableRow } from "@/components/swipeable-row";
import { useGoalGreen } from "@/components/progress-identity";

// web/src/components/ui.tsx::ExerciseGoalsList'in mobil portu - goals.tsx ve
// workouts.tsx'te neredeyse birebir aynı kopyayla vardı (2026-08-10 mimari
// borç raporu, bulgu #8). İki ekran arasındaki tek gerçek fark: goals
// ekranı silinebilir + %100'de ayrı bir kutlama metni gösterirken, workouts
// ekranı salt-okunur (sadece küçük bir ikon) - `onDelete` prop'unun
// varlığı/yokluğu bu iki görünümü tek bileşende ayırt eder.
// Redesign (Faz M2b, 2026-08-15): statik `colors` yerine `useThemeColors()`;
// silinebilir satırlar artık diğer geçmiş listeleriyle AYNI SwipeableRow
// deseni (elle Trash2 dokunma yerine kaydırarak sil).
// 2026-08-27: iki hedef türü eklendi - süre hedefi (kardiyo/esneklik, tek
// ölçer, "kardiyo" renk kuralıyla AYNI seri rengi: `series3`) ve ağırlık
// hedefine opsiyonel tekrar alt-hedefi (ikinci, küçük bir ölçer olarak
// ağırlık ölçerinin ALTINA eklenir - `series1` kullanılır, `series2`
// (ağırlık/kuvvet) ve `series3` (süre/kardiyo) ile ÇAKIŞMASIN diye bilerek
// seçildi, bkz. proje belleği "kategorik renk asla mevcut kullanımdan
// bağımsız seçilmemeli").
export function ExerciseGoalsList({
  goals,
  onDelete,
  mutedColor,
  trackColor,
}: {
  goals: ExerciseGoalProgress[];
  onDelete?: (goalId: number) => void;
  // Sıcak panel zeminde (Antrenman sekmesi) "140/140 kg (%100)" gibi ölçer
  // metni ve boş çubuk rengi için override - bkz. goal-meter.tsx'teki AYNI
  // not. Verilmezse eski davranış (c.muted/c.surfaceMuted) sürer.
  mutedColor?: string;
  trackColor?: string;
}) {
  const t = useT();
  const c = useThemeColors();
  const seriesColors = useSeriesColors();
  const green = useGoalGreen();
  const s = useMemo(() => makeStyles(c, green), [c, green]);

  return (
    <View style={{ gap: onDelete ? 12 : 14 }}>
      {goals.map((eg) => {
        const isDurationGoal = eg.target_duration_minutes != null;
        // Kullanıcı isteği (2026-09-22): tamamlanan hedefler yeşile dönsün
        // (İlerleme sekmesindeki AYNI "hedef = yeşil" kuralı, bkz.
        // progress-identity.ts::useGoalGreen) + kullanıcıya AÇIKÇA
        // "tamamlandı" yazsın - önceden bu metin SADECE silinebilir
        // (goals.tsx) görünümünde vardı, salt-okunur (workouts.tsx)
        // görünümünde küçük bir ikondan ibaretti. Artık ikisi de aynı satırı
        // gösteriyor.
        const reached = eg.progress_pct >= 100;
        const row = (
          <View key={onDelete ? undefined : eg.id}>
            <View style={s.row}>
              <View style={{ flex: 1, gap: 8 }}>
                {isDurationGoal ? (
                  <GoalMeter
                    label={eg.exercise_name}
                    value={eg.best_duration_minutes ?? 0}
                    goal={eg.target_duration_minutes ?? 0}
                    unit={t("dk", "min")}
                    color={reached ? green : seriesColors.series3}
                    valueColor={mutedColor}
                    trackColor={trackColor}
                  />
                ) : (
                  <>
                    <GoalMeter
                      label={eg.exercise_name}
                      value={eg.best_weight_kg ?? 0}
                      goal={eg.target_weight_kg ?? 0}
                      unit="kg"
                      color={reached ? green : seriesColors.series2}
                      valueColor={mutedColor}
                      trackColor={trackColor}
                    />
                    {eg.target_reps != null ? (
                      <GoalMeter
                        label={t("Tekrar", "Reps")}
                        value={eg.best_reps ?? 0}
                        goal={eg.target_reps}
                        unit={t("tekrar", "reps")}
                        color={reached ? green : seriesColors.series1}
                        valueColor={mutedColor}
                        trackColor={trackColor}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </View>
            {reached ? (
              <View style={s.celebrateRow}>
                <PartyPopper size={13} color={green} />
                <Text style={s.celebrateText}>
                  {t(`Tebrikler, ${eg.exercise_name} hedefine ulaştın!`, `Congrats, you've reached your ${eg.exercise_name} goal!`)}
                </Text>
              </View>
            ) : null}
          </View>
        );
        return onDelete ? (
          <SwipeableRow key={eg.id} onDelete={() => onDelete(eg.id)}>
            {row}
          </SwipeableRow>
        ) : (
          row
        );
      })}
    </View>
  );
}

function makeStyles(c: ThemeColors, green: string) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    celebrateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    celebrateText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: green },
  });
}
