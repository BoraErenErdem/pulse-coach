import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { type ThemeColors, useThemeColors } from "@/components/ui";
import { FormInput } from "@/components/ui";
import { tapLight } from "@/lib/haptics";

/** Sayısal alanlar için +/- kademeli giriş (Redesign, ChatGPT'nin mockup'ından
 * uyarlanan 3 fikirden biri, kullanıcı onayı: "Evet, bu üçünü uygula").
 * Tekrar/kilo/süre gibi antrenman değerleri için hem hızlı dokunuşla
 * ayarlamayı (+/-) HEM de klavyeyle tam değer girmeyi (ortadaki alan hâlâ
 * düzenlenebilir) destekler - salt +/- olsaydı 82.5 kg gibi hassas bir
 * değeri girmek can sıkıcı olurdu. Değer string olarak tutulur (var olan
 * `parseLocaleNumber` akışıyla uyumlu kalsın diye), adım/min/basamak
 * ayarlanabilir. */
export function Stepper({
  value,
  onChangeText,
  step = 1,
  min = 0,
  max,
  allowDecimal = false,
  placeholder,
  keyboardType,
}: {
  value: string;
  onChangeText: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  placeholder?: string;
  keyboardType?: "number-pad" | "numeric";
}) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);

  function currentNumber(): number {
    const normalized = value.replace(",", ".");
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : min;
  }

  function formatNumber(n: number): string {
    if (allowDecimal) {
      // 82.50 yerine 82.5, 82.0 yerine 82 - gereksiz sıfırları at.
      return String(Math.round(n * 100) / 100);
    }
    return String(Math.round(n));
  }

  function adjust(delta: number) {
    const next = currentNumber() + delta;
    const clamped = Math.max(min, max != null ? Math.min(max, next) : next);
    tapLight();
    onChangeText(formatNumber(clamped));
  }

  const canDecrement = value !== "" && currentNumber() > min;

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => adjust(-step)}
        disabled={!canDecrement}
        style={({ pressed }) => [s.btn, pressed && s.btnPressed, !canDecrement && s.btnDisabled]}
      >
        <Minus size={16} color={canDecrement ? c.text : c.muted} />
      </Pressable>
      <FormInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? (allowDecimal ? "numeric" : "number-pad")}
        placeholder={placeholder}
        style={s.input}
        textAlign="center"
      />
      <Pressable
        onPress={() => adjust(step)}
        disabled={max != null && currentNumber() >= max}
        style={({ pressed }) => [s.btn, pressed && s.btnPressed]}
      >
        <Plus size={16} color={c.text} />
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    btn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    btnPressed: {
      opacity: 0.7,
    },
    btnDisabled: {
      opacity: 0.4,
    },
    input: {
      flex: 1,
    },
  });
}
