"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

// Mobil components/charts/svg-charts.tsx'in web karşılığı (2026-10-08, web = mobil eşitleme).
// Geometri, renkler ve davranış birebir: x ekseni GERÇEK zaman ölçekli (eşit aralık değil),
// sade düz segmentli çizgi, kesikli yeşil hedef çizgisi, tıklayarak nokta seçme (başlık
// eşzamanlı), giriş animasyonu (globals.css .pc-line/.pc-area/.pc-dots/.pc-bar).
// Renkler CSS değişkeni (globals.css --id-*, --pc-chart-*): tema değişince JS gerekmez.

export interface ChartPoint {
  t: number; // ms
  value: number | null;
}

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

const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const AXIS_TEXT = { fontSize: 11, fill: "var(--pc-chart-axis)" } as const;

/** Kapsayıcının genişliği (ResizeObserver) - mobildeki onLayout karşılığı. */
export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Tıklanan noktanın grafik alanına (`left` ofsetli) göre x'i. */
function clickX(e: MouseEvent<HTMLElement>): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX - rect.left;
}

interface CommonProps {
  height?: number;
  gutterLeft?: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** Ekran okuyucu için grafik özeti (SVG'nin kendisi gizli). */
  ariaLabel: string;
}

function lastFilledIndex(points: ChartPoint[]): number {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].value !== null) return i;
  }
  return -1;
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
  selectedIndex,
  onSelect,
  ariaLabel,
}: CommonProps & {
  points: ChartPoint[];
  domainX: [number, number];
  domainY: [number, number];
  yTicks: number[];
  formatY: (v: number) => string;
  xTicks: { t: number; label: string }[];
  /** CSS rengi (ör. "var(--id-weight)"). */
  color: string;
  goal?: { value: number; label: string };
}) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const gradientId = `pg${useId().replace(/:/g, "")}`;
  // Veri değişince (aralık/metrik) çizim baştan oynasın: anahtar = veri imzası.
  const signature = points.map((pt) => `${pt.t}:${pt.value}`).join("|");
  const left = gutterLeft;
  const right = width - PAD_RIGHT;
  const top = PAD_TOP;
  const bottom = height - PAD_BOTTOM;
  const [x0, x1] = domainX;
  const [y0, y1] = domainY;
  const sx = (t: number) => left + ((t - x0) / (x1 - x0 || 1)) * (right - left);
  const sy = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);

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
  const lastIdx = lastFilledIndex(points);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const x = clickX(e) + left;
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
  }

  return (
    <div ref={ref} className="relative" style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 ? (
        <>
          <svg key={`${signature}-${width}`} width={width} height={height} aria-hidden="true" className="pointer-events-none block">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: color, stopOpacity: 0.32 }} />
                <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {yTicks.map((v) => (
              <line key={`g${v}`} x1={left} x2={right} y1={sy(v)} y2={sy(v)} style={{ stroke: "var(--pc-chart-grid)" }} strokeDasharray="3 5" />
            ))}
            {yTicks.map((v) => (
              <text key={`y${v}`} x={left - 8} y={sy(v) + 3.5} textAnchor="end" {...AXIS_TEXT}>
                {formatY(v)}
              </text>
            ))}
            {xTicks.map((tick, idx) => (
              <text
                key={`x${tick.t}`}
                x={sx(tick.t)}
                y={height - 8}
                textAnchor={idx === 0 ? "start" : idx === xTicks.length - 1 ? "end" : "middle"}
                {...AXIS_TEXT}
              >
                {tick.label}
              </text>
            ))}

            {goal ? (
              <>
                <line x1={left} x2={right} y1={sy(goal.value)} y2={sy(goal.value)} style={{ stroke: "var(--goal-green)" }} strokeWidth={1.25} strokeDasharray="6 4" />
                <text x={right} y={sy(goal.value) - 5} textAnchor="end" fontSize={11} style={{ fill: "var(--goal-green)" }}>
                  {goal.label}
                </text>
              </>
            ) : null}

            {segments.map((seg, si) => {
              if (seg.length < 2) return null;
              const line = seg.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
              const area = `${line} L${seg[seg.length - 1].x} ${bottom} L${seg[0].x} ${bottom} Z`;
              let len = 0;
              for (let k = 1; k < seg.length; k += 1) len += Math.hypot(seg[k].x - seg[k - 1].x, seg[k].y - seg[k - 1].y);
              len = Math.ceil(len) + 2;
              return (
                <g key={`s${si}`}>
                  <path className="pc-area" d={area} fill={`url(#${gradientId})`} />
                  <path
                    className="pc-line"
                    d={line}
                    style={{ stroke: color, ["--len" as string]: len }}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </g>
              );
            })}

            {selectedIndex !== null && points[selectedIndex]?.value != null ? (
              <line
                x1={sx(points[selectedIndex].t)}
                x2={sx(points[selectedIndex].t)}
                y1={top}
                y2={bottom}
                style={{ stroke: color }}
                strokeWidth={1.25}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            ) : null}

            <g className="pc-dots">
              {points.map((p, i) => {
                if (p.value === null) return null;
                const isSelected = i === selectedIndex;
                const isLast = selectedIndex === null && i === lastIdx;
                if (!showDots && !isSelected && !isLast) return null;
                const cx = sx(p.t);
                const cy = sy(p.value);
                const on = isSelected || isLast;
                return (
                  <g key={`d${i}`}>
                    {on ? <circle cx={cx} cy={cy} r={9} style={{ fill: color }} opacity={0.22} /> : null}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={on ? 5 : 3.5}
                      style={{ fill: color, stroke: on ? "var(--pc-chart-ring)" : "none" }}
                      strokeWidth={on ? 2 : 0}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="absolute inset-y-0 cursor-pointer" style={{ left, right: PAD_RIGHT }} onClick={handleClick} />
        </>
      ) : null}
    </div>
  );
}

/** Sayım çubuk grafiği - her çubuk bir dönem (hafta/gün). `colors` verilirse çubuk başına renk. */
export function WeeklyBarsChart({
  values,
  xLabels,
  domainY,
  yTicks,
  color,
  barColors,
  formatY = (v) => String(v),
  goal,
  showValues = false,
  outlineSelected = false,
  maxBarWidth = 22,
  height = 170,
  gutterLeft = 26,
  selectedIndex,
  onSelect,
  ariaLabel,
}: CommonProps & {
  values: number[];
  xLabels: string[];
  domainY: [number, number];
  yTicks: number[];
  color: string;
  barColors?: string[];
  formatY?: (v: number) => string;
  goal?: { value: number; label: string };
  /** Çubuğun üstünde değeri yaz (mobil showValuesAsTopLabel). */
  showValues?: boolean;
  /** Seçili çubuğa metin renginde çerçeve (mobil barBorderWidth 3). */
  outlineSelected?: boolean;
  maxBarWidth?: number;
}) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const left = gutterLeft;
  const right = width - PAD_RIGHT;
  const top = PAD_TOP;
  const bottom = height - PAD_BOTTOM;
  const [y0, y1] = domainY;
  const sy = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const slot = values.length > 0 ? (right - left) / values.length : 0;
  const barW = Math.min(maxBarWidth, slot * 0.62);
  const cx = (i: number) => left + slot * i + slot / 2;
  const emphasized = selectedIndex ?? values.length - 1;

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const i = Math.min(values.length - 1, Math.max(0, Math.floor(clickX(e) / (slot || 1))));
    onSelect(i === selectedIndex ? null : i);
  }

  return (
    <div ref={ref} className="relative" style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 ? (
        <>
          <svg key={`${values.join(",")}-${width}`} width={width} height={height} aria-hidden="true" className="pointer-events-none block">
            {yTicks.map((v) => (
              <line
                key={`g${v}`}
                x1={left}
                x2={right}
                y1={sy(v)}
                y2={sy(v)}
                style={{ stroke: "var(--pc-chart-grid)" }}
                strokeDasharray={v === y0 ? undefined : "3 5"}
              />
            ))}
            {yTicks.map((v) => (
              <text key={`y${v}`} x={left - 8} y={sy(v) + 3.5} textAnchor="end" {...AXIS_TEXT}>
                {formatY(v)}
              </text>
            ))}
            {goal ? (
              <>
                <line x1={left} x2={right} y1={sy(goal.value)} y2={sy(goal.value)} style={{ stroke: "var(--goal-green)" }} strokeWidth={1.25} strokeDasharray="6 4" />
                <text x={left + 4} y={sy(goal.value) - 5} fontSize={11} fontWeight={600} style={{ fill: "var(--goal-green)" }}>
                  {goal.label}
                </text>
              </>
            ) : null}
            {values.map((v, i) => {
              const h = Math.max(v > 0 ? sy(y0) - sy(v) : 2.5, 2.5);
              const isOn = i === emphasized;
              const fill = v > 0 ? (barColors?.[i] ?? color) : "var(--pc-chart-grid)";
              const outlined = outlineSelected && isOn && v > 0;
              return (
                <g key={`b${i}`}>
                  <rect
                    className="pc-bar"
                    x={cx(i) - barW / 2}
                    y={bottom - h}
                    width={barW}
                    height={h}
                    rx={Math.min(6, barW / 2.5)}
                    style={{ fill, animationDelay: `${i * 45}ms`, stroke: outlined ? "var(--foreground)" : "none" }}
                    strokeWidth={outlined ? 2.5 : 0}
                    opacity={v > 0 ? (isOn ? 1 : 0.8) : 1}
                  />
                  {showValues && v > 0 ? (
                    <text className="pc-dots" x={cx(i)} y={bottom - h - 6} textAnchor="middle" fontSize={12} style={{ fill: "var(--pc-chart-axis)" }}>
                      {formatY(v)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {xLabels.map((label, i) =>
              label ? (
                <text key={`x${i}`} x={cx(i)} y={height - 8} textAnchor="middle" {...AXIS_TEXT}>
                  {label}
                </text>
              ) : null
            )}
          </svg>
          <div className="absolute inset-y-0 cursor-pointer" style={{ left, right: PAD_RIGHT }} onClick={handleClick} />
        </>
      ) : null}
    </div>
  );
}
