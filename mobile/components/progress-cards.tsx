import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronDown, ChevronUp, Plus } from "lucide-react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { TILE_GRADIENT_DARK, useIdentityColors, type IdentityKey } from "@/components/progress-identity";
import { useThemeColors } from "@/components/ui";

// Arkadaşın "İlerleme" sayfası tasarımının (pulsecoach pngler/ilerleme,
// 2026-09-19) kart dili: sayfa ZEMİNİ uygulamanın kendi zemini (açık: düz
// krem, koyu: antrasit) - mockup'ın kendi turuncu parıltılı zemini
// KULLANILMADI, tasarımcı bunun için ayrıca sadece-bileşen PNG'leri
// (`*png.png`) verdi (kartlar üzerine oturuyor). Renkler bu PNG'lerden
// piksel örneklemesiyle alındı. Ortak `Card`/`StatTile`/`InsightCard`
// bileşenlerine DOKUNULMADI (Antrenman/Beslenme/Ruh Hali sekmeleri de
// kullanıyor) - bu dosya SADECE İlerleme sekmesinin yeni tasarımı içindir.

// Koyu mod kutu gradyanları - mockup'ta 4 kutu zeminin turuncu parıltısı
// yüzünden FARKLI parlaklıkta (sol-alt en parlak). Beyaz metin kontrastı
// için en parlak kutu (3.) mockup'a göre (#EE8E48) biraz kısıldı.
const DARK_GOAL_GRADIENT: [string, string] = ["#D0632B", "#56250F"];
const DARK_INSIGHT_GRADIENT: [string, string, string] = ["#A8663F", "#5E3214", "#75431E"];
const DARK_GLOW = "#E8792F";
const DARK_BORDER = "rgba(255,255,255,0.32)";
// Alt bölüm panelleri (grafikler/geçmiş): sıcak koyu kahve - üstteki turuncu
// kutularla AYNI renk ailesi, ama çok daha sakin (metin/grafik okunurluğu için).
const DARK_PANEL_BORDER = "rgba(255,255,255,0.15)";

// Koyu modda alt paneller TEK bir renk değil, sayfa boyunca yukarıdan aşağıya
// akan bir RAMPA: en üstteki panel (Kilo Kaydet) üstteki turuncu kutulara yakın
// bir "turuncu-kahve"den başlıyor, en alttaki panel açık bir kahveye iniyor
// (2026-09-19, kullanıcı geri bildirimi: ilk sürüm koyu kahveye ANİDEN
// geçiyordu, boğucu ve kopuk duruyordu). Her panel rampanın kendi dilimini
// gradyan olarak alıyor, bir panelin bitişi bir sonrakinin başlangıcı -
// böylece panel araları da kesintisiz. `t`: 0 (sayfada en üst) .. 1 (en alt).
const DARK_PANEL_RAMP: { t: number; color: string }[] = [
  { t: 0, color: "#7E4023" },
  { t: 0.35, color: "#6A3922" },
  { t: 0.7, color: "#583123" },
  { t: 1, color: "#4A2D22" },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < DARK_PANEL_RAMP.length; i += 1) {
    const a = DARK_PANEL_RAMP[i - 1];
    const b = DARK_PANEL_RAMP[i];
    if (clamped <= b.t) {
      const f = (clamped - a.t) / (b.t - a.t || 1);
      const [ar, ag, ab] = hexToRgb(a.color);
      const [br, bg, bb] = hexToRgb(b.color);
      const ch = (x: number, y: number) => Math.round(x + (y - x) * f).toString(16).padStart(2, "0");
      return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
    }
  }
  return DARK_PANEL_RAMP[DARK_PANEL_RAMP.length - 1].color;
}

/** Alt panellerin sayfa sırasına göre rampadaki dilimi: `index`. panel / `total`. */
export function stackTone(index: number, total: number): { toneFrom: number; toneTo: number } {
  return { toneFrom: index / total, toneTo: (index + 1) / total };
}
const LIGHT_GLOW = "#F5A26B";
const LIGHT_FILL = "rgba(255,255,255,0.75)";
// Açık modda "Bu Haftadaki İçgörün" - mockup'ta #F2944A %76 opaklık.
const LIGHT_INSIGHT_FILL = "rgba(242,148,74,0.76)";
const DOT_ORANGE = "#F26B1D";

function useCardPalette() {
  const { theme } = useTheme();
  const c = useThemeColors();
  const isDark = theme === "dark";
  return {
    isDark,
    c,
    text: isDark ? "#FFFFFF" : c.text,
    subtleText: isDark ? "rgba(255,255,255,0.88)" : c.text,
    iconColor: isDark ? "rgba(255,255,255,0.85)" : LIGHT_GLOW,
  };
}

/** Kutu içeriğini (kenarlık+gradyan+gölge) saran ortak kabuk. Gölge için dış
 * View `overflow:hidden` OLAMAZ (gölgeyi keser), gradyan/köşe kırpma iç
 * View'da. */
function GlassShell({
  gradient,
  lightFill,
  radius,
  style,
  innerStyle,
  children,
  end = { x: 1, y: 0 },
  start = { x: 0, y: 1 },
  subtle = false,
  glow,
  lightGradient,
}: {
  // Kimlik rengi (kutular): dış parıltı/gölge ve açık mod kenarlığı bu renkten.
  glow?: string;
  // Açık modda düz dolgu yerine hafif tonlu gradyan (kimlik renkli kutular).
  lightGradient?: string[];
  // Büyük bölüm panelleri (grafik/geçmiş) için: kenarlık ve parıltı kutulara
  // göre çok daha hafif - aksi halde uzun paneller sayfada "bağırıyor".
  subtle?: boolean;
  gradient: string[];
  lightFill: string;
  radius: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  const { isDark } = useCardPalette();
  const outer: ViewStyle = {
    borderRadius: radius,
    shadowColor: glow ?? (isDark ? DARK_GLOW : LIGHT_GLOW),
    shadowOpacity: subtle ? (isDark ? 0.18 : 0.25) : isDark ? 0.4 : 0.35,
    shadowRadius: isDark ? 12 : 12,
    shadowOffset: { width: 0, height: isDark ? 0 : 4 },
    elevation: isDark ? 0 : 2,
  };
  const border: ViewStyle = {
    borderRadius: radius,
    borderWidth: isDark && !subtle ? 1.5 : 1,
    borderColor: isDark ? (subtle ? DARK_PANEL_BORDER : DARK_BORDER) : glow ? `${glow}45` : "rgba(245,162,107,0.2)",
    overflow: "hidden",
  };
  if (isDark) {
    return (
      <View style={[outer, style]}>
        <LinearGradient
          colors={gradient as [string, string, ...string[]]}
          start={start}
          end={end}
          style={[border, innerStyle]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }
  if (lightGradient) {
    return (
      <View style={[outer, style]}>
        <LinearGradient
          colors={lightGradient as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[border, innerStyle]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }
  return (
    <View style={[outer, style]}>
      <View style={[border, { backgroundColor: lightFill }, innerStyle]}>{children}</View>
    </View>
  );
}

/** 2x2 ızgaradaki istatistik kutusu. Dokunulunca hafif sıçrar (eski
 * `StatTile`'ın davranışı korundu). `children` verilirse değer satırının
 * yanına (Seri'nin nokta dizisi) eklenir. */
export function ProgressTile({
  identity,
  icon,
  label,
  value,
  hint,
  onPress,
  containerStyle,
  valueAccessory,
  valueColor,
}: {
  // Kutunun renk kimliği (bkz. progress-identity.ts): koyu modda gradyan,
  // açık modda hafif tonlu beyaz + o renkte ikon/gölge.
  identity: "weight" | "workout" | "entries" | "streak";
  icon: (color: string) => ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  onPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  valueAccessory?: ReactNode;
  valueColor?: string;
}) {
  const p = useCardPalette();
  const ids = useIdentityColors();
  const solid = ids[identity as IdentityKey];
  const scale = useSharedValue(1);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handlePress() {
    scale.value = withSequence(
      withTiming(1.04, { duration: 100, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 })
    );
    onPress?.();
  }

  const body = (
    <View style={s.tileBody}>
      <View style={s.tileLabelRow}>
        {icon(p.isDark ? p.iconColor : solid)}
        <Text style={[s.tileLabel, { color: p.text }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={s.tileValueRow}>
        {typeof value === "string" ? (
          <Text style={[s.tileValue, { color: valueColor ?? p.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        ) : (
          value
        )}
        {valueAccessory}
      </View>
      <Text style={[s.tileHint, { color: p.subtleText }]} numberOfLines={1}>
        {hint ?? " "}
      </Text>
    </View>
  );

  return (
    <Pressable onPress={handlePress} hitSlop={4} style={containerStyle}>
      {({ pressed }) => (
        <Animated.View entering={FadeIn.duration(300)} style={[bounceStyle, pressed && { opacity: 0.85 }]}>
          <GlassShell
            gradient={TILE_GRADIENT_DARK[identity]}
            lightFill={LIGHT_FILL}
            lightGradient={[`${solid}30`, "rgba(255,255,255,0.88)"]}
            glow={solid}
            radius={20}
          >
            {body}
          </GlassShell>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** "Bu Haftadaki İçgörün" - solda başlık+özet, (varsa) sağda ek liste
 * (ör. "Antrenman Türü Dağılımı"). */
export function ProgressInsight({
  title,
  message,
  aside,
}: {
  title: string;
  message: string;
  aside?: { title: string; lines: string[] };
}) {
  const p = useCardPalette();
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <GlassShell
        gradient={DARK_INSIGHT_GRADIENT}
        lightFill={LIGHT_INSIGHT_FILL}
        radius={18}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={s.insightBody}>
          <View style={[s.insightMain, aside ? { flex: 1.1 } : { flex: 1 }]}>
            <Text style={[s.insightTitle, { color: p.text }]}>✨ {title}</Text>
            <Text style={[s.insightMessage, { color: p.text }]}>{message}</Text>
          </View>
          {aside ? (
            <View style={s.insightAside}>
              <Text style={[s.insightAsideTitle, { color: p.text }]}>{aside.title}</Text>
              {aside.lines.map((line) => (
                <Text key={line} style={[s.insightAsideLine, { color: p.text }]}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </GlassShell>
    </Animated.View>
  );
}

/** "Kilo Hedefi" - iki sütun (hedef / güncel) + altta kalan miktar notu. */
export function WeightGoalCard({
  icon,
  goalLabel,
  goalValue,
  currentLabel,
  currentValue,
  remainingText,
  progress,
}: {
  icon: (color: string) => ReactNode;
  goalLabel: string;
  goalValue: string;
  currentLabel: string;
  currentValue: string;
  remainingText: string;
  // Hedefe ilerleme (0-100) + başlangıç notu. Başlangıç bilinmiyorsa/hedefe
  // uzaklık yoksa verilmez, çubuk gösterilmez.
  progress?: { pct: number; startText: string };
}) {
  const p = useCardPalette();
  return (
    <GlassShell gradient={DARK_GOAL_GRADIENT} lightFill="rgba(255,255,255,0.82)" radius={14} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={s.goalBody}>
        <View style={s.goalColumns}>
          <View style={s.goalColumn}>
            <View style={s.tileLabelRow}>
              {icon(p.iconColor)}
              <Text style={[s.goalLabel, { color: p.text }]}>{goalLabel}</Text>
            </View>
            <View style={s.goalValueRow}>
              <View style={[s.goalDot, p.isDark && s.goalDotDark]} />
              <Text style={[s.goalValue, { color: p.text }]}>{goalValue}</Text>
            </View>
          </View>
          <View style={s.goalColumn}>
            <Text style={[s.goalLabel, { color: p.text }]}>{currentLabel}</Text>
            <View style={s.goalValueRow}>
              <View style={[s.goalDot, p.isDark && s.goalDotDark]} />
              <Text style={[s.goalValue, { color: p.text }]}>{currentValue}</Text>
            </View>
          </View>
        </View>
        <Text style={[s.goalRemaining, { color: p.subtleText }]}>{remainingText}</Text>
        {progress ? (
          <View style={{ gap: 6 }}>
            <View style={s.progressRow}>
              <View style={[s.progressTrack, { backgroundColor: p.isDark ? "rgba(255,255,255,0.22)" : "rgba(232,99,10,0.16)" }]}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${Math.max(3, Math.min(100, progress.pct))}%`, backgroundColor: p.isDark ? "#FFFFFF" : "#E8630A" },
                  ]}
                />
              </View>
              <Text style={[s.progressPct, { color: p.text }]}>%{Math.round(progress.pct)}</Text>
            </View>
            <Text style={[s.progressStart, { color: p.subtleText }]}>{progress.startText}</Text>
          </View>
        ) : null}
      </View>
    </GlassShell>
  );
}

/** "Kilo Kaydet" gibi form kartı. Mockup'ta yarı saydam gri (#535353) bir
 * katman - mockup'ta bu katman turuncu parıltılı zeminin üstünde SICAK
 * kahverengi-gri görünüyor, bizim soğuk antrasit zeminimizde ise soğuk gri
 * kalıp alttaki sıcak panellerle uyuşmuyordu (kullanıcı bulgusu), o yüzden
 * alt bölüm panelleriyle AYNI sıcak kahve/beyaz yüzey kullanılıyor. Açık modda
 * mockup'un grisi üzerinde açık renk metin ~2.3:1 kontrast verdiği için
 * (WCAG AA altı) beyaz yüzey. */
export function ProgressFormCard({
  children,
  title,
  open,
  onToggle,
  toneFrom = 0,
  toneTo = 0.2,
}: {
  children: ReactNode;
  // Başlık + aç/kapa: kapalıyken sadece tek satırlık "+ başlık" çubuğu
  // (sayfayı kısaltır, 2026-09-19); açıkken form (children) görünür.
  title: string;
  open: boolean;
  onToggle: () => void;
  toneFrom?: number;
  toneTo?: number;
}) {
  const p = useCardPalette();
  return (
    <GlassShell
      gradient={[rampColor(toneFrom), rampColor(toneTo)]}
      lightFill="rgba(255,255,255,0.82)"
      radius={28}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      innerStyle={s.formCard}
      subtle
    >
      <Pressable onPress={onToggle} style={s.formHeader} hitSlop={6}>
        <View style={[s.formPlus, { backgroundColor: p.isDark ? "rgba(255,255,255,0.14)" : "rgba(232,99,10,0.14)" }]}>
          {open ? (
            <ChevronUp size={16} color={p.isDark ? "#FFFFFF" : "#E8630A"} strokeWidth={2.4} />
          ) : (
            <Plus size={16} color={p.isDark ? "#FFFFFF" : "#E8630A"} strokeWidth={2.6} />
          )}
        </View>
        <Text style={[s.formTitle, { color: p.text }]}>{title}</Text>
        {open ? null : <ChevronDown size={18} color={p.isDark ? "rgba(255,255,255,0.7)" : p.c.muted} />}
      </Pressable>
      {open ? children : null}
    </GlassShell>
  );
}

/** Alt bölümler (Geçmiş Kayıtlar, grafikler) için ortak panel: başlık +
 * (opsiyonel) alt başlık + içerik. Yatay dolgu 20 - grafik genişliği hesabı
 * (`chart-utils.ts::SCREEN_HORIZONTAL_INSETS`) bu değere dayanıyor. */
export function ProgressSectionCard({
  title,
  subtitle,
  children,
  toneFrom = 0.5,
  toneTo = 0.75,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  toneFrom?: number;
  toneTo?: number;
}) {
  const p = useCardPalette();
  return (
    <GlassShell
      gradient={[rampColor(toneFrom), rampColor(toneTo)]}
      lightFill="rgba(255,255,255,0.82)"
      radius={22}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      subtle
    >
      <View style={s.sectionBody}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: p.text }]}>{title}</Text>
          {subtitle ? <Text style={[s.sectionSubtitle, { color: p.isDark ? "rgba(255,255,255,0.92)" : p.c.muted }]}>{subtitle}</Text> : null}
        </View>
        {children}
      </View>
    </GlassShell>
  );
}

/** Panel içindeki küçük açıklama/not kutusu (ör. korelasyon yorumu). */
export function ProgressNote({ children }: { children: ReactNode }) {
  const p = useCardPalette();
  return (
    <View
      style={[
        s.note,
        { backgroundColor: p.isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.12)" },
      ]}
    >
      <Text style={[s.noteText, { color: p.text }]}>{children}</Text>
    </View>
  );
}

/** "Daha Fazla Göster" gibi panel içi ikincil eylem - turuncu çerçeveli hap. */
export function ProgressTextButton({
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
  const p = useCardPalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.textButton,
        { borderColor: `${p.c.accent}80` },
        (disabled || loading || pressed) && { opacity: 0.7 },
      ]}
    >
      {loading ? <ActivityIndicator color={p.c.accent} size="small" /> : null}
      <Text style={[s.textButtonLabel, { color: p.c.accent }]}>{children}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tileBody: {
    minHeight: 124,
    padding: 13,
    justifyContent: "space-between",
  },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  tileValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tileValue: {
    fontSize: 30,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  tileHint: {
    fontSize: 12,
  },
  insightBody: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  insightMain: {
    gap: 8,
    minWidth: 0,
  },
  insightTitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  insightMessage: {
    fontSize: 12,
    lineHeight: 18,
  },
  insightAside: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: "center",
  },
  insightAsideTitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  insightAsideLine: {
    fontSize: 12,
  },
  goalBody: {
    padding: 16,
    gap: 10,
  },
  goalColumns: {
    flexDirection: "row",
    gap: 16,
  },
  goalColumn: {
    gap: 8,
    minWidth: 0,
  },
  goalLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  goalValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  goalDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: DOT_ORANGE,
  },
  // Koyu modda kart turuncu gradyan - turuncu nokta zeminde kayboluyordu
  // (kullanıcı bulgusu): beyaz + hafif parıltı.
  goalDotDark: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  goalValue: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  goalRemaining: {
    fontSize: 13,
  },
  formCard: {
    padding: 20,
    gap: 14,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  formPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  formTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  progressPct: { fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 38, textAlign: "right" },
  progressStart: { fontSize: 12 },
  sectionBody: {
    padding: 20,
    gap: 16,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
  },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
  },
  textButtonLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
