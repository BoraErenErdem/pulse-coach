import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import type { WorkoutType } from "@/lib/api";

// Faz M1 için minimal/işlevsel ortak UI parçaları — web'deki
// `web/src/components/ui.tsx`'in kavramsal (piksel-eşit değil) karşılığı.
// Kapsamlı görsel tasarım kullanıcının 3. adımına (web+mobil frontend
// redesign turu) bırakıldı, bu bilinçli bir kapsam kararı.

export const colors = {
  accent: "#208AEF",
  error: "#c0392b",
  errorBg: "#fdecea",
  success: "#1a7f37",
  successBg: "#eaf6ec",
  info: "#1d4ed8",
  infoBg: "#eff6ff",
  insightBg: "#fdf1e0",
  insightAccent: "#c2762b",
  celebrate: "#d97706",
  text: "#1a1a1a",
  muted: "#666",
  border: "#e2e2e2",
  surfaceMuted: "#f4f4f5",
};

// Grafikler ve StatTile'lar arasında tutarlı kategorik palet (web'deki
// --series-1..5 CSS değişkenlerinin sabit RN karşılığı - dataviz kuralı:
// asla dual-axis, seriler arasında ayırt edilebilir renkler).
export const seriesColors = {
  series1: "#208AEF", // accent mavi (kilo/mood)
  series2: "#16a34a", // yeşil (antrenman günü/kuvvet)
  series3: "#f59e0b", // amber (kardiyo)
  series4: "#8b5cf6", // mor (esneklik)
  series5: "#ef4444", // kırmızı (karışık/seri)
  series6: "#0891b2", // camgöbeği (sodyum - series2'nin yeşiliyle karışmasın)
};

// Antrenman türü etiket/renk eşlemesi - önceden progress.tsx/workouts.tsx/
// workout-type-chart.tsx'te 3 AYRI kopyası vardı (2026-08-06'da fark
// eklenirken tek yere toplandı), WorkoutTypeChart ile WorkoutVolumeChart
// arasında renk tutarlılığı sağlamak için de burada olması gerekiyordu.
export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  kuvvet: "Kuvvet",
  kardiyo: "Kardiyo",
  esneklik: "Esneklik",
  karışık: "Karışık",
};

export const workoutTypeColors: Record<WorkoutType, string> = {
  kuvvet: seriesColors.series2,
  kardiyo: seriesColors.series3,
  esneklik: seriesColors.series4,
  karışık: seriesColors.series5,
};

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.errorBg }]}>
      <Text style={{ color: colors.error, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
      <Text style={{ color: colors.success, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.infoBg }]}>
      <Text style={{ color: colors.info, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

/** Sıcak vurgu renkli özet/içgörü kartı - haftalık özet metni gibi "bunu
 * oku" denen tek bir içerik için (web'deki InsightCard'ın portu). */
export function InsightCard({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>✨ {title}</Text>
      <Text style={styles.insightMessage}>{message}</Text>
    </View>
  );
}

export function Skeleton({ height = 96 }: { height?: number }) {
  return <View style={[styles.skeleton, { height }]} />;
}

/** Grafiklerle aynı seriesColors paletinden bir renk - StatTile'ın rengini
 * sayfadaki grafiklerle tutarlı tutar (web'deki seriesVar/--series-N'in
 * portu). */
export function StatTile({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/** Web'deki checkbox+label yerine RN'de sık kullanılan dokunulabilir satır. */
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <View style={[styles.checkbox, value && styles.checkboxChecked]}>
        {value ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

/** Web'deki <Select> yerine RN'de bağımlılıksız bir çözüm: yatay çip
 * seçici (login ekranındaki tab-toggle deseniyle aynı görsel dil). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function FormInput(props: TextInputProps) {
  return <TextInput placeholderTextColor="#9ca3af" {...props} style={[styles.input, props.style]} />;
}

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        (disabled || pressed) && { opacity: 0.7 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

/** PrimaryButton'ın dolgu-değil çerçeveli karşılığı (web'deki
 * SecondaryButton'ın portu) - "Fotoğraf Seç" gibi ikincil eylemler için. */
export function SecondaryButton({
  children,
  onPress,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        (disabled || pressed) && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

/** "Diğer" sekmesinden açılan alt sayfalar (Ruh Hali/Hedefler/Check-in'ler/
 * Profil) için ortak geri-dönüş başlığı - bu proje native Stack header'ı
 * yerine (tab ekranlarıyla aynı) kendi minimal UI'ını kuruyor, tutarlılık
 * için burada da aynı yaklaşım. `router.back()` her zaman "Diğer"e döner
 * çünkü bu sayfalar SADECE oradan push ediliyor. */
export function DetailScreen({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.detailSafe} edges={["top"]}>
      <View style={styles.detailHeader}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.detailBack}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.detailTitle}>{title}</Text>
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  banner: {
    borderRadius: 8,
    padding: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fff",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
  },
  insightCard: {
    borderRadius: 14,
    padding: 16,
    backgroundColor: colors.insightBg,
    gap: 6,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.insightAccent,
  },
  insightMessage: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  skeleton: {
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    width: "100%",
  },
  statTile: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  statHint: {
    fontSize: 11,
    color: colors.muted,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.text,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  chipTextActive: {
    color: "#fff",
  },
  detailSafe: { flex: 1 },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailBack: { padding: 4 },
  detailTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
});
