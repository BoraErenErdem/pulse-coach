import { type ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, ChevronDown, ChevronUp, Flame, Plus, Target } from "lucide-react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme-context";
import { TILE_GRADIENT_DARK, useIdentityColors, type IdentityKey } from "@/components/progress-identity";
import { ConfettiBurst, CountUp, useAnimatedNumber } from "@/components/progress-motion";
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
  accentBorder,
}: {
  // Vurgulu kenarlık (birincil eylem çubuğu): iki temada da bu renkte, 1.5px.
  accentBorder?: string;
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
    borderWidth: accentBorder || (isDark && !subtle) ? 1.5 : 1,
    borderColor: accentBorder
      ? `${accentBorder}B3`
      : isDark
        ? subtle
          ? DARK_PANEL_BORDER
          : DARK_BORDER
        : glow
          ? `${glow}45`
          : "rgba(245,162,107,0.2)",
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
  overlay,
  countUp,
  replayKey = 0,
  tapAnimation,
  autoPlayKey = 0,
}: {
  // Sayı 0'dan (ya da `from`dan) akarak gelir; `replayKey` (sayfa girişi) veya
  // dokunma artınca baştan (A/B katmanı, 2026-09-19).
  countUp?: { value: number; decimals?: number; suffix?: string; from?: number };
  replayKey?: number;
  // Dokununca kutuya özgü ikon animasyonu (B katmanı). Seri kendi FlameBurst'ünü kullanıyor.
  tapAnimation?: "weight" | "workout" | "entries";
  // Dokunmadan tetiklemek için (C katmanı: kutlama) - artınca dokunma animasyonu oynar.
  autoPlayKey?: number;
  // Kutunun üstüne binen dekoratif katman (ör. Seri'nin alev animasyonu).
  overlay?: ReactNode;
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
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // ---- B katmanı: dokununca kutuya özgü ikon animasyonu
  const [tapKey, setTapKey] = useState(0);
  const [stamp, setStamp] = useState(false);
  const playKey = tapKey + autoPlayKey;
  const iconRot = useSharedValue(0);
  const iconY = useSharedValue(0);
  const iconScale = useSharedValue(1);
  // 1 = bitmiş/görünmez (opaklık (1-ring)); oynarken 0'dan 1'e gider.
  const ring = useSharedValue(1);
  useEffect(() => {
    if (playKey === 0 || reduced || !tapAnimation) return;
    if (tapAnimation === "weight") {
      // Tartıya basmış gibi sallanma
      iconRot.value = withSequence(
        withTiming(18, { duration: 90 }),
        withTiming(-16, { duration: 140 }),
        withTiming(10, { duration: 110 }),
        withTiming(-5, { duration: 100 }),
        withTiming(0, { duration: 90 })
      );
    } else if (tapAnimation === "workout") {
      // Dambıl iki kez kalkıp iner + kırmızı nabız halkası
      iconY.value = withSequence(
        withTiming(-7, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }),
        withTiming(-7, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) })
      );
      iconScale.value = withSequence(withTiming(1.3, { duration: 150 }), withTiming(1, { duration: 400 }));
      ring.value = 0;
      ring.value = withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) });
    } else {
      // Takvim -> tik "damgalanır"
      setStamp(true);
      iconScale.value = withSequence(withTiming(0.2, { duration: 1 }), withTiming(1.5, { duration: 200 }), withTiming(1, { duration: 160 }));
      const timer = setTimeout(() => setStamp(false), 800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: iconY.value }, { rotate: `${iconRot.value}deg` }, { scale: iconScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.7,
    transform: [{ scale: 0.6 + ring.value * 6 }],
  }));

  function handlePress() {
    scale.value = withSequence(
      withTiming(1.04, { duration: 100, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 })
    );
    setTapKey((k) => k + 1);
    onPress?.();
  }

  const body = (
    <View style={s.tileBody}>
      <View style={s.tileLabelRow}>
        <Animated.View style={iconStyle}>
          {stamp ? (
            <Check size={15} color={p.isDark ? p.iconColor : solid} strokeWidth={3} />
          ) : (
            icon(p.isDark ? p.iconColor : solid)
          )}
        </Animated.View>
        <Text style={[s.tileLabel, { color: p.text }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={s.tileValueRow}>
        {countUp ? (
          <CountUp
            value={countUp.value}
            decimals={countUp.decimals}
            suffix={countUp.suffix}
            from={countUp.from}
            replayKey={replayKey + playKey}
            style={[s.tileValue, { color: valueColor ?? p.text }]}
          />
        ) : typeof value === "string" ? (
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
            lightGradient={[`${solid}40`, "rgba(255,255,255,0.86)"]}
            glow={p.isDark ? TILE_GRADIENT_DARK[identity][0] : solid}
            radius={20}
          >
            {body}
            {tapAnimation === "workout" ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    left: 22,
                    top: 20,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: "#FFFFFF",
                  },
                  ringStyle,
                ]}
              />
            ) : null}
            {overlay}
          </GlassShell>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ---- Seri kutusu "alev" animasyonu ------------------------------------
// Kutuya dokununca (replayKey artar) alttan yükselen alev/kıvılcımlar + kısa
// bir sıcak parıltı (2026-09-19, kullanıcı isteği: teşvik edici olsun).
// Ekran boyunca sürekli DEĞİL, sadece dokunmada ~1 sn; "hareketi azalt"
// açıksa hiç oynamaz. Sabit dizi (rastgele değil) - her dokunuş aynı,
// tutarlı bir desen.
const EMBERS = [
  { x: 0.08, size: 15, delay: 0, rise: 0.78, color: "#FFD23F", sway: 5 },
  { x: 0.26, size: 24, delay: 90, rise: 0.98, color: "#FF9F0A", sway: 7 },
  { x: 0.44, size: 17, delay: 40, rise: 0.82, color: "#FF5A1F", sway: 5 },
  { x: 0.6, size: 28, delay: 140, rise: 1.05, color: "#FFB020", sway: 8 },
  { x: 0.78, size: 18, delay: 60, rise: 0.86, color: "#FF7A1A", sway: 6 },
  { x: 0.9, size: 14, delay: 190, rise: 0.72, color: "#FFE27A", sway: 4 },
];

function Ember({ e, replayKey, height }: { e: (typeof EMBERS)[number]; replayKey: number; height: number }) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (replayKey === 0 || reduced) return;
    progress.value = 0;
    progress.value = withDelay(e.delay, withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.65, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateY: -progress.value * height * e.rise },
      { translateX: Math.sin(progress.value * Math.PI * 2 + e.x * 9) * e.sway },
      { scale: 0.55 + progress.value * 0.65 },
    ],
  }));
  return (
    <Animated.View style={[{ position: "absolute", bottom: -e.size, left: `${e.x * 100}%` }, style]}>
      <Flame size={e.size} color={e.color} fill={e.color} strokeWidth={1.5} />
    </Animated.View>
  );
}

export function FlameBurst({ replayKey }: { replayKey: number }) {
  const [height, setHeight] = useState(120);
  const glow = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (replayKey === 0 || reduced) return;
    glow.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 750 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(ev) => setHeight(ev.nativeEvent.layout.height)}
    >
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <LinearGradient
          colors={["rgba(255,210,63,0)", "rgba(255,190,40,0.42)"]}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {EMBERS.map((e) => (
        <Ember key={e.x} e={e} replayKey={replayKey} height={height} />
      ))}
    </View>
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

/** "Kilo Hedefi" - nötr cam kart (koyu: sıcak kahve panel, açık: beyaz) +
 * ÜÇ işaretçili ilerleme çubuğu: Başlangıç -> Güncel -> Hedef (2026-09-19).
 * Önceki sürüm koyu modda Güncel Kilo kutusuyla aynı büyük turuncu blokta
 * duruyor ve "Güncel" değerini tekrar ediyordu. Turuncu (kilo kimliği) artık
 * sadece çubuk/işaretçide. Başlangıç bilinmiyorsa (`progress` yok) çubuk
 * yerine iki sütunlu düz gösterim. */
export function WeightGoalCard({
  icon,
  title,
  remainingText,
  current,
  goal,
  progress,
  animateKey = 0,
  reached = false,
  celebrateKey = 0,
}: {
  // Sayfa girişinde artar: çubuk sıfırdan dolar, işaretçi kayar (A katmanı).
  animateKey?: number;
  // Hedefe ulaşıldı: rozet "Hedefte!" olur; `celebrateKey` artınca konfeti (C katmanı).
  reached?: boolean;
  celebrateKey?: number;
  icon: (color: string) => ReactNode;
  title: string;
  remainingText: string;
  current: { label: string; value: string };
  goal: { label: string; value: string };
  progress?: { pct: number; start: { label: string; value: string } };
}) {
  const p = useCardPalette();
  const ids = useIdentityColors();
  const accent = ids.weight;
  const [trackW, setTrackW] = useState(0);
  const [bubbleW, setBubbleW] = useState(0);
  const pctTarget = progress ? Math.max(0, Math.min(100, progress.pct)) : 0;
  // Çubuk/işaretçi/rozet 0'dan hedef yüzdeye akar (rAF tabanlı, bkz. progress-motion).
  const pct = useAnimatedNumber(pctTarget, animateKey, { duration: 900, delay: 150 });
  const x = (trackW * pct) / 100;
  // Baloncuk işaretçiyi izler ama kartın kenarından taşmaz.
  const bubbleLeft = Math.max(0, Math.min(Math.max(trackW - bubbleW, 0), x - bubbleW / 2));
  const ready = trackW > 0 && bubbleW > 0;

  return (
    <GlassShell
      gradient={[rampColor(0), rampColor(0.14)]}
      lightFill="rgba(255,255,255,0.82)"
      radius={22}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      subtle
    >
      <View style={s.goalBody}>
        <View style={s.goalHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.tileLabelRow}>
              {icon(p.isDark ? p.iconColor : accent)}
              <Text style={[s.goalTitle, { color: p.text }]}>{title}</Text>
            </View>
            <Text style={[s.goalRemaining, { color: p.subtleText }]}>{remainingText}</Text>
          </View>
          {progress ? (
            <View style={[s.goalChip, { backgroundColor: `${accent}${p.isDark ? "2E" : "22"}`, borderColor: `${accent}${p.isDark ? "70" : "66"}` }]}>
              <Text style={[s.goalChipText, { color: p.text }]}>{reached ? "🎉 %100" : `%${Math.round(pct)}`}</Text>
            </View>
          ) : null}
        </View>

        {progress ? (
          <View>
            {/* Güncel değer baloncuğu (işaretçinin üstünde) */}
            <View style={{ height: 34 }}>
              <View
                onLayout={(e) => setBubbleW(e.nativeEvent.layout.width)}
                style={[
                  s.goalBubble,
                  {
                    left: bubbleLeft,
                    opacity: ready ? 1 : 0,
                    backgroundColor: p.isDark ? "#FFFFFF" : accent,
                  },
                ]}
              >
                <Text style={[s.goalBubbleText, { color: p.isDark ? "#3A1D0C" : "#FFFFFF" }]}>
                  {current.label} {current.value}
                </Text>
              </View>
            </View>

            {/* Çubuk + üç işaretçi */}
            <View style={s.goalTrackWrap} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
              <View style={[s.goalTrack, { backgroundColor: p.isDark ? "rgba(255,255,255,0.20)" : "rgba(232,99,10,0.16)" }]} />
              <View style={[s.goalFill, { width: x, backgroundColor: accent }]} />
              {/* başlangıç: içi boş halka */}
              <View
                style={[
                  s.goalStartDot,
                  { borderColor: p.isDark ? "#FFFFFF" : accent, backgroundColor: p.isDark ? "#5A2F1B" : "#FFFFFF" },
                ]}
              />
              {/* hedef */}
              <View style={s.goalTarget}>
                <Target size={18} color={p.isDark ? "#FFFFFF" : p.c.text} strokeWidth={2.2} />
              </View>
              {/* güncel: dolu, beyaz halkalı, parıltılı */}
              <View
                style={[
                  s.goalNowDot,
                  { left: x - 9, backgroundColor: accent, shadowColor: accent, opacity: trackW > 0 ? 1 : 0 },
                ]}
              />
            </View>

            {/* uç etiketleri */}
            <View style={s.goalEnds}>
              <View>
                <Text style={[s.goalEndCaption, { color: p.subtleText }]}>{progress.start.label}</Text>
                <Text style={[s.goalEndValue, { color: p.text }]}>{progress.start.value}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.goalEndCaption, { color: p.subtleText }]}>{goal.label}</Text>
                <Text style={[s.goalEndValue, { color: p.text }]}>{goal.value}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={s.goalEnds}>
            <View>
              <Text style={[s.goalEndCaption, { color: p.subtleText }]}>{current.label}</Text>
              <Text style={[s.goalEndValue, { color: p.text }]}>{current.value}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[s.goalEndCaption, { color: p.subtleText }]}>{goal.label}</Text>
              <Text style={[s.goalEndValue, { color: p.text }]}>{goal.value}</Text>
            </View>
          </View>
        )}
      </View>
      <ConfettiBurst replayKey={celebrateKey} />
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
  const accent = useIdentityColors().weight;
  // Birincil eylem (kilo kaydetmek en sık yapılan iş): dolu turuncu "+" dairesi
  // + turuncu kenarlık/parıltı - katlıyken de bir düğme gibi okunuyor.
  const onAccent = p.isDark ? "#3A1D0C" : "#FFFFFF";
  return (
    <GlassShell
      gradient={[rampColor(toneFrom), rampColor(toneTo)]}
      lightFill="rgba(255,255,255,0.82)"
      radius={28}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      innerStyle={s.formCard}
      subtle
      accentBorder={accent}
      glow={accent}
    >
      <Pressable onPress={onToggle} style={s.formHeader} hitSlop={6}>
        <View style={[s.formPlus, { backgroundColor: accent }]}>
          {open ? (
            <ChevronUp size={18} color={onAccent} strokeWidth={2.6} />
          ) : (
            <Plus size={18} color={onAccent} strokeWidth={2.8} />
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
    padding: 20,
    gap: 14,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  goalTitle: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  goalRemaining: {
    fontSize: 13,
  },
  goalChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  goalChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  goalBubble: {
    position: "absolute",
    top: 0,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  goalBubbleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  goalTrackWrap: { height: 20, justifyContent: "center" },
  goalTrack: { height: 10, borderRadius: 5 },
  goalFill: { position: "absolute", left: 0, top: 5, height: 10, borderRadius: 5 },
  goalStartDot: {
    position: "absolute",
    left: -1,
    top: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  goalTarget: { position: "absolute", right: -2, top: 1 },
  goalNowDot: {
    position: "absolute",
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  goalEnds: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6 },
  goalEndCaption: { fontSize: 12 },
  goalEndValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
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
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  formTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
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
