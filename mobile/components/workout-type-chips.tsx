// Antrenman türü çipleri (2026-09-26, app/(tabs)/workouts.tsx'ten taşındı - mantık aynı).
// "Antrenman Kaydet" formundaki "Antrenman Türü" seçici (2026-09-22, üçüncü
// oturum, kullanıcı isteği: her tür seçilince KENDİ rengiyle vurgulansın -
// kuvvet kırmızı, kardiyo sarı, esneklik yeşil, karışık mor, bkz.
// workout-identity.ts::useWorkoutTypeChipColors). Paylaşımlı `ChipSelect`
// (ui.tsx) HER seçenek için AYNI tek accent rengini kullanıyor, kategori
// başına renk desteklemiyor - onu app genelinde değiştirmek yerine (10+
// kullanım yeri, aşırı geniş etki alanı) SADECE bu forma özel, küçük bir
// yerel bileşen yazıldı (görsel kalıp - hap, dolgu/kenarlık - `ChipSelect`
// ile AYNI, sadece renk kaynağı seçeneğe göre değişiyor).
import { useThemeColors } from "@/components/ui";
import { useWorkoutTypeChipColors } from "@/components/workout-identity";
import { WORKOUT_TYPES, type WorkoutType } from "@/lib/api";
import { Pressable, Text, View } from "react-native";
export function WorkoutTypeChips({
  value,
  onChange,
  labels,
}: {
  value: WorkoutType;
  onChange: (next: WorkoutType) => void;
  labels: Record<WorkoutType, string>;
}) {
  const c = useThemeColors();
  const chipColors = useWorkoutTypeChipColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {WORKOUT_TYPES.map((type) => {
        const active = type === value;
        const color = chipColors[type];
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: active ? `${color}26` : c.surfaceMuted,
              borderWidth: 1,
              borderColor: active ? color : "transparent",
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? color : c.muted }}>
              {labels[type]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
