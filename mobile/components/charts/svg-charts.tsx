import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/lib/theme-context";
import { useIdentityColors } from "@/components/progress-identity";

// İlerleme sekmesinin kendi SVG grafik çekirdeği (2026-09-19). react-native-
// gifted-charts'tan ayrılma nedenleri (bkz. proje notları):
// - noktaları TARİHTEN bağımsız EŞİT aralıkla çiziyordu (1 gün ile 18 gün aynı
//   mesafe -> eğim yanıltıcı) - burada x ekseni gerçek zaman (ms) ile ölçekli;
// - `curved` seyrek veride ölçülmemiş değerler uyduruyor/tepeyi aşıyordu -
//   burada sade (düz segmentli) çizgi;
// - hedef çizgisi, dokunarak nokta seçme (üstteki başlıkla eşzamanlı) ve
//   tema-belirli renkler üzerinde tam kontrol için.
// Diğer sekmelerin grafikleri (Beslenme/Antrenman/Ruh Hali) HÂLÂ gifted-charts.

export interface ChartPoint {
  t: number; // ms
  value: number | null;
}

/** Bu sekmeye özel, tema-belirli grafik renkleri (tek kaynak). Koyu modda
 * kahve panel üzerinde parlak/doygun, açık modda krem/beyaz üzerinde daha
 * derin tonlar - iki tema için AYRI ayarlandı (aynı hex iki zeminde birden
 * iyi durmuyordu). */
export function useProgressChartColors() {
  const { theme } = useTheme();
  const id = useIdentityColors();
  // Perf profili bulgusu (2026-09-21): bu her çağrıda YENİ bir nesne
  // döndürüyordu - İlerleme sekmesindeki grafik panellerinin kendi
  // memoizasyonlarını (bkz. progress-charts.tsx::BodyMetricsPanel) bu
  // nesneyi bağımlılık olarak kullandıkları için sessizce geçersiz
  // kılıyordu. `id`/`theme` değişmedikçe AYNI referansı döndür.
  return useMemo(() => (theme === "dark"
    ? {
        // Seri renkleri sayfanın renk kimliklerinden (progress-identity.ts).
        // Koyu modda turuncu-kahve panelde turuncu kilo çizgisi kaybolduğu
        // için grafikler koyu bir "kuyu" içinde çiziliyor (bkz.
        // progress-charts.tsx::ChartWell), renk kimliği korunuyor.
        weight: id.weight,
        waist: id.waist,
        fat: id.fat,
        mood: id.mood,
        workout: id.workout,
        grid: "rgba(255,255,255,0.10)",
        axisText: "rgba(255,255,255,0.66)",
        // Hedef = yeşil (bkz. progress-identity.ts::GOAL_GREEN_*).
        goal: "#5EDC8B",
        // Rozetler renge hex alfa ekliyor (`${color}2E`) - rgba() dizesine
        // eklenemez, o yüzden düz hex.
        goalBase: "#5EDC8B",
        ring: "#FFFFFF",
      }
    : {
        weight: id.weight,
        waist: id.waist,
        fat: id.fat,
        mood: id.mood,
        workout: id.workout,
        grid: "rgba(36,29,20,0.10)",
        axisText: "#7D6F56",
        goal: "#2E9E5B",
        goalBase: "#2E9E5B",
        ring: "#FFFFFF",
      }), [theme, id]);
}

export type ProgressChartColors = ReturnType<typeof useProgressChartColors>;

/** [lo, hi] içine düşen "güzel" (1/2/5 x 10^k) adımlı eksen değerleri. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const range = hi - lo;
  if (!(range > 0)) return [lo];
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

/** 0'dan 1'e giden giriş ilerlemesi - `animateKey` (sayfa girişi) ya da veri
 * imzası değişince baştan oynar; "hareketi azalt"ta doğrudan 1. */
function useDrawProgress(animateKey: number, signature: string, ready: boolean, delay = 0) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    // Ölçüm (genişlik) gelmeden çizilecek bir şey yok - animasyon boşa bitmesin.
    if (!ready) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateKey, signature, ready]);
  return progress;
}

/** Çizgi segmenti: çizgi soldan sağa "çizilir", alan dolgusu belirir. */
function AnimatedSegment({
  seg,
  gradientId,
  color,
  bottom,
  progress,
}: {
  seg: { x: number; y: number }[];
  gradientId: string;
  color: string;
  bottom: number;
  progress: { value: number };
}) {
  const line = seg.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const area = `${line} L${seg[seg.length - 1].x} ${bottom} L${seg[0].x} ${bottom} Z`;
  let len = 0;
  for (let k = 1; k < seg.length; k += 1) len += Math.hypot(seg[k].x - seg[k - 1].x, seg[k].y - seg[k - 1].y);
  len = Math.ceil(len) + 2;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.value) }));
  const areaProps = useAnimatedProps(() => ({ opacity: interpolate(progress.value, [0.25, 1], [0, 1]) }));
  return (
    <G>
      <AnimatedPath d={area} fill={`url(#${gradientId})`} animatedProps={areaProps} />
      <AnimatedPath
        d={line}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[len, len]}
        animatedProps={lineProps}
      />
    </G>
  );
}

/** Çubuk: alttan yükselir (hafif taşarak oturur), sırayla. */
function AnimatedBar({
  x,
  width,
  bottom,
  fullHeight,
  rx,
  fill,
  opacity,
  index,
  animateKey,
  signature,
}: {
  x: number;
  width: number;
  bottom: number;
  fullHeight: number;
  rx: number;
  fill: string;
  opacity: number;
  index: number;
  animateKey: number;
  signature: string;
}) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(index * 45, withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.3)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateKey, signature]);
  const props = useAnimatedProps(() => {
    const h = Math.max(fullHeight * progress.value, 0);
    return { y: bottom - h, height: h };
  });
  return <AnimatedRect x={x} width={width} rx={rx} fill={fill} opacity={opacity} animatedProps={props} />;
}

let gradientCounter = 0;

/** Dokunulan x'i (Pressable'a göre) verir. Native'de `locationX` hazır gelir;
 * web'de `click` olayında YOK (NaN/undefined) - o durumda sayfa koordinatı ile
 * Pressable'ın `measure` ile ölçülen sayfa konumundan hesaplanır. */
function usePressX(onX: (x: number) => void) {
  const ref = useRef<View>(null);
  const onPress = (e: GestureResponderEvent) => {
    const ne = e.nativeEvent as GestureResponderEvent["nativeEvent"] & { clientX?: number };
    if (typeof ne.locationX === "number" && !Number.isNaN(ne.locationX)) {
      onX(ne.locationX);
      return;
    }
    const pageX = ne.pageX ?? ne.clientX;
    if (typeof pageX !== "number") return;
    ref.current?.measure((_x, _y, _w, _h, px) => onX(pageX - px));
  };
  return { ref, onPress };
}

const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

function useChartWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return { width, onLayout };
}

interface CommonProps {
  // Sayfa girişinde (odaklanınca) artan sayaç: grafik baştan "çizilir".
  animateKey?: number;
  height?: number;
  gutterLeft?: number;
  colors: ProgressChartColors;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}

/** Tarihe ölçekli çizgi grafik. Boş (null) değerler çizgiyi böler. */
export function TrendLineChart({
  points,
  domainX,
  domainY,
  yTicks,
  formatY,
  xTicks,
  color,
  goal,
  height = 200,
  gutterLeft = 34,
  colors,
  selectedIndex,
  onSelect,
  animateKey = 0,
}: CommonProps & {
  points: ChartPoint[];
  domainX: [number, number];
  domainY: [number, number];
  yTicks: number[];
  formatY: (v: number) => string;
  xTicks: { t: number; label: string }[];
  color: string;
  goal?: { value: number; label: string };
}) {
  const { width, onLayout } = useChartWidth();
  const gradientId = useRef(`pg${(gradientCounter += 1)}`).current;
  const signature = points.map((pt) => `${pt.t}:${pt.value}`).join("|");
  const draw = useDrawProgress(animateKey, signature, width > 0);
  const dotsProps = useAnimatedProps(() => ({ opacity: interpolate(draw.value, [0.7, 1], [0, 1]) }));
  const left = gutterLeft;
  const right = width - PAD_RIGHT;
  const top = PAD_TOP;
  const bottom = height - PAD_BOTTOM;
  const [x0, x1] = domainX;
  const [y0, y1] = domainY;
  const sx = (t: number) => left + ((t - x0) / (x1 - x0 || 1)) * (right - left);
  const sy = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);

  // Ardışık dolu noktalardan segmentler (boşluk çizgiyi böler).
  const segments: { i: number; x: number; y: number }[][] = [];
  let current: { i: number; x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, x: sx(p.t), y: sy(p.value) });
    }
  });
  if (current.length) segments.push(current);

  const showDots = points.length <= 60;

  const press = usePressX((px) => {
    // Pressable grafik alanının soluna (`left`) hizalı - x ona göre.
    const x = px + left;
    let best = -1;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      if (p.value === null) return;
      const d = Math.abs(sx(p.t) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) onSelect(best === selectedIndex ? null : best);
  });

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.32} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {yTicks.map((v) => (
              <Line key={`g${v}`} x1={left} x2={right} y1={sy(v)} y2={sy(v)} stroke={colors.grid} strokeWidth={1} strokeDasharray="3 5" />
            ))}
            {yTicks.map((v) => (
              <SvgText fontFamily="Inter_400Regular" key={`y${v}`} x={left - 8} y={sy(v) + 3.5} fontSize={11} fill={colors.axisText} textAnchor="end">
                {formatY(v)}
              </SvgText>
            ))}
            {xTicks.map((tick, idx) => (
              <SvgText fontFamily="Inter_400Regular"
                key={`x${tick.t}`}
                x={sx(tick.t)}
                y={height - 8}
                fontSize={11}
                fill={colors.axisText}
                textAnchor={idx === 0 ? "start" : idx === xTicks.length - 1 ? "end" : "middle"}
              >
                {tick.label}
              </SvgText>
            ))}

            {goal ? (
              <>
                <Line x1={left} x2={right} y1={sy(goal.value)} y2={sy(goal.value)} stroke={colors.goal} strokeWidth={1.25} strokeDasharray="6 4" />
                <SvgText fontFamily="Inter_400Regular" x={right} y={sy(goal.value) - 5} fontSize={11} fill={colors.goal} textAnchor="end">
                  {goal.label}
                </SvgText>
              </>
            ) : null}

            {segments.map((seg, si) =>
              seg.length < 2 ? null : (
                <AnimatedSegment key={`s${si}`} seg={seg} gradientId={gradientId} color={color} bottom={bottom} progress={draw} />
              )
            )}

            {selectedIndex !== null && points[selectedIndex]?.value != null ? (
              <Line
                x1={sx(points[selectedIndex].t)}
                x2={sx(points[selectedIndex].t)}
                y1={top}
                y2={bottom}
                stroke={color}
                strokeWidth={1.25}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            ) : null}

            <AnimatedG animatedProps={dotsProps}>
            {points.map((p, i) => {
              if (p.value === null) return null;
              const isSelected = i === selectedIndex;
              const isLast = selectedIndex === null && i === lastFilledIndex(points);
              if (!showDots && !isSelected && !isLast) return null;
              const cx = sx(p.t);
              const cy = sy(p.value);
              return (
                <G key={`d${i}`}>
                  {isSelected || isLast ? <Circle cx={cx} cy={cy} r={9} fill={color} opacity={0.22} /> : null}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={isSelected || isLast ? 5 : 3.5}
                    fill={color}
                    stroke={isSelected || isLast ? colors.ring : "none"}
                    strokeWidth={isSelected || isLast ? 2 : 0}
                  />
                </G>
              );
            })}
            </AnimatedG>
          </Svg>
          <Pressable ref={press.ref} style={{ position: "absolute", left, right: PAD_RIGHT, top: 0, bottom: 0 }} onPress={press.onPress} />
        </>
      ) : null}
    </View>
  );
}

function lastFilledIndex(points: ChartPoint[]): number {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].value !== null) return i;
  }
  return -1;
}

/** Haftalık (sayım) çubuk grafik - her çubuk bir hafta. */
export function WeeklyBarsChart({
  values,
  xLabels,
  domainY,
  yTicks,
  color,
  height = 170,
  gutterLeft = 26,
  colors,
  selectedIndex,
  onSelect,
  animateKey = 0,
}: CommonProps & {
  values: number[];
  xLabels: string[];
  domainY: [number, number];
  yTicks: number[];
  color: string;
}) {
  const { width, onLayout } = useChartWidth();
  const left = gutterLeft;
  const right = width - PAD_RIGHT;
  const top = PAD_TOP;
  const bottom = height - PAD_BOTTOM;
  const [y0, y1] = domainY;
  const sy = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const slot = values.length > 0 ? (right - left) / values.length : 0;
  const barW = Math.min(22, slot * 0.62);
  const cx = (i: number) => left + slot * i + slot / 2;
  const emphasized = selectedIndex ?? values.length - 1;

  // Pressable sol=`left` ofsetli konumlandığı için x bu ofsete göre.
  const press = usePressX((x) => {
    const i = Math.min(values.length - 1, Math.max(0, Math.floor(x / (slot || 1))));
    onSelect(i === selectedIndex ? null : i);
  });

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height} pointerEvents="none">
            {yTicks.map((v) => (
              <Line key={`g${v}`} x1={left} x2={right} y1={sy(v)} y2={sy(v)} stroke={colors.grid} strokeWidth={1} strokeDasharray={v === y0 ? undefined : "3 5"} />
            ))}
            {yTicks.map((v) => (
              <SvgText fontFamily="Inter_400Regular" key={`y${v}`} x={left - 8} y={sy(v) + 3.5} fontSize={11} fill={colors.axisText} textAnchor="end">
                {String(v)}
              </SvgText>
            ))}
            {values.map((v, i) => {
              const h = Math.max(v > 0 ? sy(y0) - sy(v) : 2.5, 2.5);
              const isOn = i === emphasized;
              return (
                <AnimatedBar
                  key={`b${i}`}
                  x={cx(i) - barW / 2}
                  width={barW}
                  bottom={bottom}
                  fullHeight={h}
                  rx={Math.min(6, barW / 2.5)}
                  fill={v > 0 ? color : colors.grid}
                  opacity={v > 0 ? (isOn ? 1 : 0.8) : 1}
                  index={i}
                  animateKey={animateKey}
                  signature={values.join(",")}
                />
              );
            })}
            {xLabels.map((label, i) =>
              label ? (
                <SvgText fontFamily="Inter_400Regular" key={`x${i}`} x={cx(i)} y={height - 8} fontSize={11} fill={colors.axisText} textAnchor="middle">
                  {label}
                </SvgText>
              ) : null
            )}
          </Svg>
          <Pressable ref={press.ref} style={{ position: "absolute", left, right: PAD_RIGHT, top: 0, bottom: 0 }} onPress={press.onPress} />
        </>
      ) : null}
    </View>
  );
}
