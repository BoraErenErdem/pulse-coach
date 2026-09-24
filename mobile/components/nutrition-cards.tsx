import { memo, useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Cookie, Moon, Pencil, Sun, Sunrise, Target, UtensilsCrossed } from "lucide-react-native";
import { GlassShell } from "@/components/progress-cards";
import { useGoalGreen } from "@/components/progress-identity";
import { useThemeColors } from "@/components/ui";
import {
  NUTRITION_HERO_GRADIENT_DARK,
  useCalorieOverColor,
  useNutrientColors,
  useNutritionAccent,
  type NutrientKey,
} from "@/components/nutrition-identity";
import { MEAL_TYPES, type DailyNutritionSummary, type FoodCatalogItem, type MealType, type PreferredLanguage } from "@/lib/api";
import { tapLight } from "@/lib/haptics";
import { useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";

// Beslenme sekmesi kartları (2026-09-24 redesign) -
// [[reference-pulsecoach-design-language]]'a göre: aynı yüzey dili (GlassShell,
// progress-cards.tsx'ten), sayfaya ÖZEL bileşenler, kendi kimlik paletiyle
// (nutrition-identity.ts). Ortak `StatTile`/`Card` (ui.tsx) DOKUNULMADI.

export const MEAL_TYPE_LABELS: Record<PreferredLanguage, Record<MealType, string>> = {
  tr: { kahvaltı: "Kahvaltı", öğle: "Öğle", akşam: "Akşam", atıştırmalık: "Atıştırmalık" },
  en: { kahvaltı: "Breakfast", öğle: "Lunch", akşam: "Dinner", atıştırmalık: "Snack" },
};

export function MealTypeIcon({ type, size = 15, color }: { type: MealType; size?: number; color: string }) {
  switch (type) {
    case "kahvaltı":
      return <Sunrise size={size} color={color} />;
    case "öğle":
      return <Sun size={size} color={color} />;
    case "akşam":
      return <Moon size={size} color={color} />;
    default:
      return <Cookie size={size} color={color} />;
  }
}

/** Formun varsayılan öğünü saate göre (önceden HER ZAMAN "öğle" başlıyordu -
 * sabah kahvaltı girerken her seferinde elle değiştirmek gerekiyordu). */
export function mealTypeForNow(date = new Date()): MealType {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "kahvaltı";
  if (h >= 11 && h < 16) return "öğle";
  if (h >= 18 && h < 22) return "akşam";
  return "atıştırmalık";
}

function usePalette() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return {
    isDark,
    c,
    text: isDark ? "#FFFFFF" : c.text,
    muted: isDark ? "rgba(255,255,255,0.82)" : c.muted,
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("tr-TR");
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Kalori halkası. İlk mount'ta SON değeriyle çizilir (§6: odaklanışta replay
 * yok); yalnızca değer GERÇEKTEN değişince (öğün eklendi/silindi) yumuşakça
 * yeni konumuna akar. */
function CalorieRing({
  fraction,
  color,
  trackColor,
  size,
  stroke,
}: {
  fraction: number;
  color: string;
  trackColor: string;
  size: number;
  stroke: number;
}) {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  const progress = useSharedValue(clamped);
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current || reduced) {
      isFirst.current = false;
      progress.value = clamped;
      return;
    }
    progress.value = withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduced, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={[circumference, circumference]}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

function MacroRow({
  label,
  color,
  value,
  goal,
  trackColor,
}: {
  label: string;
  color: string;
  value: number;
  goal: number | null;
  trackColor: string;
}) {
  const p = usePalette();
  const pct = goal ? Math.min(1, value / goal) : 0;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.macroLabel, { color: p.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.macroValue, { color: p.text }]} numberOfLines={1}>
          {fmt(value)}
          <Text style={{ color: p.muted }}>{goal ? ` / ${fmt(goal)} g` : " g"}</Text>
        </Text>
      </View>
      {goal ? (
        <View style={[styles.macroTrack, { backgroundColor: trackColor }]}>
          <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

/** Sayfanın kahramanı - "Bugün" kartı. Eski 6 ayrı istatistik kutusunun +
 * "Günlük Hedef Karşılaştırma" kartının yerini alıyor: aynı bilgi (kalori,
 * makrolar, lif/şeker/sodyum, kayıt sayısı, hedefler) TEK bakışta, hedefe
 * uzaklık halkayla. Koyu modda altın kimlik gradyanı (Antrenman'ın kırmızı
 * Haftalık Hedef kartının ikizi), açık modda altın tonlu beyaz cam. */
export const NutritionHeroCard = memo(function NutritionHeroCard({
  summary,
  onEditGoals,
}: {
  summary: DailyNutritionSummary;
  onEditGoals: () => void;
}) {
  const t = useT();
  const p = usePalette();
  const colors = useNutrientColors();
  const accent = useNutritionAccent();
  const green = useGoalGreen();
  const over = useCalorieOverColor();

  const kcal = summary.total_calories_kcal;
  const goal = summary.calorie_goal;
  const ratio = goal ? kcal / goal : 0;
  // Hedef bir tavan DA olabilir (kilo verme) bir taban DA (kas kazanımı) - bu
  // yüzden dil nötr: aralığa girince yeşil (hedef rengi), belirgin aşınca
  // yargısız mercan (kırmızı "hata" DEĞİL).
  const state: "none" | "under" | "reached" | "over" = !goal
    ? "none"
    : ratio > 1.1
      ? "over"
      : ratio >= 0.9
        ? "reached"
        : "under";
  const ringColor =
    state === "reached" ? green : state === "over" ? over : p.isDark ? "#FFFFFF" : accent;
  const trackColor = p.isDark ? "rgba(255,255,255,0.22)" : `${accent}26`;
  const barTrack = p.isDark ? "rgba(0,0,0,0.22)" : "rgba(36,29,20,0.08)";

  const status =
    state === "none"
      ? t("Kalori hedefi yok", "No calorie goal")
      : state === "under"
        ? t(`${fmt(goal! - kcal)} kcal kaldı`, `${fmt(goal! - kcal)} kcal left`)
        : state === "reached"
          ? t("Hedef aralığındasın", "You're in your goal range")
          : t(`Hedefi ${fmt(kcal - goal!)} kcal aştın`, `${fmt(kcal - goal!)} kcal over goal`);

  const micro: { key: NutrientKey | "kayıt"; label: string; value: string; color: string }[] = [
    { key: "lif", label: t("Lif", "Fiber"), value: `${fmt(summary.total_fiber_g)} g`, color: colors.lif },
    { key: "şeker", label: t("Şeker", "Sugar"), value: `${fmt(summary.total_sugar_g)} g`, color: colors.şeker },
    { key: "sodyum", label: t("Sodyum", "Sodium"), value: `${fmt(summary.total_sodium_mg)} mg`, color: colors.sodyum },
  ];
  const hasAnyGoal = !!(goal || summary.protein_goal_g || summary.carbs_goal_g || summary.fat_goal_g);

  return (
    <GlassShell
      gradient={NUTRITION_HERO_GRADIENT_DARK}
      lightFill="rgba(255,255,255,0.82)"
      lightGradient={[`${accent}33`, "rgba(255,255,255,0.88)"]}
      glow={p.isDark ? NUTRITION_HERO_GRADIENT_DARK[0] : accent}
      radius={22}
    >
      <View style={styles.heroBody}>
        <View style={styles.heroHead}>
          <View
            style={[
              styles.headIcon,
              p.isDark
                ? { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.35)" }
                : { backgroundColor: `${accent}1F`, borderColor: `${accent}66` },
            ]}
          >
            <UtensilsCrossed size={17} color={p.isDark ? "#FFFFFF" : accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: p.text }]}>{t("Bugün", "Today")}</Text>
            <Text style={[styles.heroSub, { color: p.muted }]}>
              {summary.entry_count > 0
                ? t(`${summary.entry_count} kayıt`, `${summary.entry_count} entr${summary.entry_count === 1 ? "y" : "ies"}`)
                : t("Henüz kayıt yok", "Nothing logged yet")}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              tapLight();
              onEditGoals();
            }}
            style={styles.iconHit}
            accessibilityRole="button"
            accessibilityLabel={t("Beslenme hedeflerini düzenle", "Edit nutrition goals")}
          >
            <Pencil size={17} color={p.muted} />
          </Pressable>
        </View>

        <View style={styles.heroMain}>
          <View style={styles.ringWrap}>
            <CalorieRing fraction={goal ? ratio : kcal > 0 ? 1 : 0} color={ringColor} trackColor={trackColor} size={132} stroke={11} />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={[styles.ringValue, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {fmt(kcal)}
              </Text>
              <Text style={[styles.ringUnit, { color: p.muted }]} numberOfLines={1}>
                {goal ? `/ ${fmt(goal)} kcal` : "kcal"}
              </Text>
            </View>
          </View>
          <View style={styles.macroCol}>
            <MacroRow label={t("Protein", "Protein")} color={colors.protein} value={summary.total_protein_g} goal={summary.protein_goal_g} trackColor={barTrack} />
            <MacroRow label={t("Karb.", "Carbs")} color={colors.karbonhidrat} value={summary.total_carbs_g} goal={summary.carbs_goal_g} trackColor={barTrack} />
            <MacroRow label={t("Yağ", "Fat")} color={colors.yağ} value={summary.total_fat_g} goal={summary.fat_goal_g} trackColor={barTrack} />
          </View>
        </View>

        <View style={styles.statusRow}>
          {state === "reached" || state === "over" ? (
            <View style={[styles.statusChip, { backgroundColor: `${ringColor}2E`, borderColor: `${ringColor}80` }]}>
              <Text style={[styles.statusChipText, { color: p.isDark ? "#FFFFFF" : ringColor }]}>{status}</Text>
            </View>
          ) : (
            <Text style={[styles.statusText, { color: p.text }]}>{status}</Text>
          )}
        </View>

        <View style={styles.microRow}>
          {micro.map((m) => (
            <View
              key={m.key}
              style={[
                styles.microChip,
                p.isDark
                  ? { backgroundColor: "rgba(0,0,0,0.20)", borderColor: "rgba(255,255,255,0.18)" }
                  : { backgroundColor: `${m.color}12`, borderColor: `${m.color}40` },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <Text style={[styles.microText, { color: p.text }]} numberOfLines={1}>
                {m.label} <Text style={styles.microValue}>{m.value}</Text>
              </Text>
            </View>
          ))}
        </View>

        {!hasAnyGoal ? (
          <Pressable
            onPress={() => {
              tapLight();
              onEditGoals();
            }}
            style={[styles.goalButton, { backgroundColor: green }]}
            accessibilityRole="button"
          >
            <Target size={16} color={p.isDark ? "#0F3A21" : "#FFFFFF"} strokeWidth={2.4} />
            <Text style={[styles.goalButtonText, { color: p.isDark ? "#0F3A21" : "#FFFFFF" }]}>
              {t("Günlük hedef belirle", "Set a daily goal")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </GlassShell>
  );
});

/** Öğün türü seçici - paylaşımlı `ChipSelect`in görsel kalıbı + öğün ikonu,
 * sayfanın altın kimliğinde (workouts.tsx::WorkoutTypeChips ile aynı yöntem:
 * ortak bileşeni değiştirmek yerine sayfaya özel küçük bileşen). */
export function MealTypeChips({
  value,
  onChange,
  labels,
}: {
  value: MealType;
  onChange: (next: MealType) => void;
  labels: Record<MealType, string>;
}) {
  const p = usePalette();
  const accent = useNutritionAccent();
  return (
    <View style={styles.chipRow}>
      {MEAL_TYPES.map((type) => {
        const active = type === value;
        const color = active ? (p.isDark ? "#FFFFFF" : accent) : p.muted;
        return (
          <Pressable
            key={type}
            onPress={() => {
              tapLight();
              onChange(type);
            }}
            style={[
              styles.mealChip,
              active
                ? { backgroundColor: `${accent}${p.isDark ? "40" : "22"}`, borderColor: accent }
                : { backgroundColor: p.isDark ? "rgba(255,255,255,0.07)" : "rgba(245,162,107,0.10)", borderColor: "transparent" },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <MealTypeIcon type={type} size={14} color={color} />
            <Text style={[styles.mealChipText, { color }]}>{labels[type]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sayfanın segment seçicisi (kayıt modu, Kalori Trendi aralığı) - ortak
 * `ChipSelect` sıcak panelde soğuk gri/turuncu kalıyordu (canlı testte
 * görüldü); İlerleme'nin SegmentedTabs'ıyla AYNI hap-içinde-hap kalıbı,
 * seçili dilim altın kimlikte. */
export function SegmentToggle<K extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: readonly { key: K; label: string; icon?: (color: string) => ReactNode }[];
  value: K;
  onChange: (next: K) => void;
  compact?: boolean;
}) {
  const p = usePalette();
  const accent = useNutritionAccent();
  return (
    <View
      style={[styles.segment, { backgroundColor: p.isDark ? "rgba(255,255,255,0.08)" : "rgba(245,162,107,0.14)" }, compact && styles.segmentCompact]}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const on = o.key === value;
        const color = on ? (p.isDark ? "#FFFFFF" : accent) : p.muted;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (on) return;
              tapLight();
              onChange(o.key);
            }}
            style={[
              styles.segmentTab,
              compact && styles.segmentTabCompact,
              on && { backgroundColor: `${accent}${p.isDark ? "40" : "22"}`, borderColor: accent },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            {o.icon ? o.icon(color) : null}
            <Text style={[styles.segmentText, { color }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Formda besin + miktar seçilince "bu kayıt ne getirecek" önizlemesi -
 * kaydetmeden önce kalori/makroyu görmek (önceden ancak kaydettikten sonra
 * kutulara bakınca anlaşılıyordu). Katalog değerleri 100 g içindir. */
export function FoodPreview({ food, grams }: { food: FoodCatalogItem; grams: number }) {
  const t = useT();
  const p = usePalette();
  const colors = useNutrientColors();
  const f = grams / 100;
  const parts: { key: NutrientKey; label: string; value: string }[] = [
    { key: "kalori", label: "", value: `${fmt(food.calories_kcal * f)} kcal` },
    { key: "protein", label: t("P", "P"), value: `${fmt(food.protein_g * f)} g` },
    { key: "karbonhidrat", label: t("K", "C"), value: `${fmt(food.carbs_g * f)} g` },
    { key: "yağ", label: t("Y", "F"), value: `${fmt(food.fat_g * f)} g` },
  ];
  return (
    <View
      style={[styles.preview, { backgroundColor: p.isDark ? "rgba(0,0,0,0.22)" : "rgba(245,162,107,0.10)" }]}
      accessible
      accessibilityLabel={t(
        `Bu kayıt: ${parts[0].value}, protein ${parts[1].value}, karbonhidrat ${parts[2].value}, yağ ${parts[3].value}`,
        `This entry: ${parts[0].value}, protein ${parts[1].value}, carbs ${parts[2].value}, fat ${parts[3].value}`
      )}
    >
      {parts.map((part) => (
        <View key={part.key} style={styles.previewItem}>
          <View style={[styles.dot, { backgroundColor: colors[part.key] }]} />
          <Text style={[part.key === "kalori" ? styles.previewKcal : styles.previewText, { color: p.text }]}>
            {part.label ? `${part.label} ` : ""}
            {part.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heroBody: { padding: 18, gap: 14 },
  heroHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 18, fontFamily: "Inter_500Medium" },
  heroSub: { fontSize: 12 },
  iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10, marginVertical: -6 },
  heroMain: { flexDirection: "row", alignItems: "center", gap: 16 },
  ringWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  ringValue: { fontSize: 30, fontFamily: "Inter_500Medium", letterSpacing: -0.6 },
  ringUnit: { fontSize: 12, fontFamily: "Inter_500Medium" },
  macroCol: { flex: 1, minWidth: 0, gap: 12 },
  macroRow: { gap: 6 },
  macroHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: 13, fontFamily: "Inter_500Medium", flexShrink: 1 },
  macroValue: { marginLeft: "auto", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  macroTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  macroFill: { height: "100%", borderRadius: 3 },
  statusRow: { flexDirection: "row" },
  statusText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  statusChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  microRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  microChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  microText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  microValue: { fontFamily: "Inter_700Bold" },
  goalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 14,
  },
  goalButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
  },
  mealChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  segment: { flexDirection: "row", gap: 4, padding: 3, borderRadius: 16 },
  segmentCompact: { alignSelf: "flex-start", borderRadius: 999 },
  segmentTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "transparent",
  },
  // `flex: 0` RN Web'de flex-basis:0 olup "7 gün"ü iki satıra kırıyordu -
  // içerik genişliğinde, küçülmeyen hap.
  segmentTabCompact: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", minHeight: 34, paddingHorizontal: 14, borderRadius: 999 },
  segmentText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  preview: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  previewKcal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  previewText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
