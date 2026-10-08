"use client";

import type { ReactNode } from "react";
import { Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";

// Mobil progress-charts.tsx'in panel parçaları (2026-10-08): gelişim rozeti, Min/Ort/Maks
// kutuları, renkli sekmeler, gün aralığı hapı, grafik kuyusu, büyük başlık değeri. Mobilde
// İlerleme/Beslenme/Antrenman grafik kartlarının ortak dili; zeminler sayfa tonundan
// (globals.css --pc-box/--pc-tabs/--pc-well).

/** "Gelişim" rozeti: ikon + değişim + yüzde. BİLEREK nötr (kırmızı/yeşil yargı yok). */
export function TrendChip({
  direction,
  text,
  color,
  icon,
  dashed,
}: {
  direction?: "up" | "down" | "flat";
  text: string;
  color: string;
  icon?: ReactNode;
  dashed?: boolean;
}) {
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] py-1.5 text-[13px] font-semibold text-zinc-900 dark:text-white"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 42%, transparent)`,
        borderStyle: dashed ? "dashed" : "solid",
      }}
    >
      {icon ?? <Icon className="h-3.5 w-3.5" style={{ color }} strokeWidth={2.4} aria-hidden="true" />}
      {text}
    </span>
  );
}

export function StatBoxes({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex gap-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 flex-1 rounded-[14px] bg-[var(--pc-box)] px-2.5 py-[9px]">
          <p className="truncate text-[11px] text-zinc-500 dark:text-white/80">{item.label}</p>
          <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function SegmentedTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { key: K; label: string; color: string }[];
  active: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-[3px] rounded-2xl bg-[var(--pc-tabs)] p-[3px]">
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={`flex flex-1 items-center justify-center gap-[7px] rounded-[13px] border py-[9px] text-[13px] transition-colors ${
              on ? "font-semibold text-zinc-900 dark:text-white" : "border-transparent font-medium text-zinc-500 hover:text-zinc-800 dark:text-white/80 dark:hover:text-white"
            }`}
            style={
              on
                ? {
                    background: `color-mix(in srgb, ${tab.color} 20%, transparent)`,
                    borderColor: `color-mix(in srgb, ${tab.color} 48%, transparent)`,
                  }
                : undefined
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: tab.color, opacity: on ? 1 : 0.55 }} aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function PillToggle<K extends string | number>({
  options,
  active,
  onChange,
  label,
}: {
  options: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-full bg-[var(--pc-tabs)] p-0.5">
      {options.map((o) => {
        const on = o.key === active;
        return (
          <button
            key={String(o.key)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              on ? "bg-[var(--pc-pill-on)] text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-white/80 dark:hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Grafik "kuyusu": koyuda turuncu-kahve panelde turuncu çizgi kayboluyordu (mobil bulgu). */
export function ChartWell({ children }: { children: ReactNode }) {
  return <div className="viz-root rounded-2xl bg-[var(--pc-well)] px-1.5 py-2">{children}</div>;
}

export function Hero({ value, unit, right }: { value: string; unit: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2.5">
      <p className="flex min-w-0 items-baseline gap-1.5">
        <span className="text-[36px] font-medium leading-none tracking-[-0.8px] text-zinc-900 tabular-nums dark:text-white">{value}</span>
        <span className="text-[15px] text-zinc-500 dark:text-white/80">{unit}</span>
      </p>
      {right ? <div className="flex shrink flex-col items-end gap-1.5">{right}</div> : null}
    </div>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="min-w-0 truncate text-[13px] text-zinc-500 dark:text-white/80">{children}</p>;
}

export function SubHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <h3 className="text-sm font-medium text-zinc-900 dark:text-white">{title}</h3>
    </div>
  );
}

/** Hedef yokken: yeşil kesikli çerçeveli "+ Hedef belirle" düğmesi. */
export function AddGoalButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed text-sm font-semibold text-[var(--goal-green)] transition-colors hover:bg-[color-mix(in_srgb,var(--goal-green)_10%,transparent)]"
      style={{ borderColor: "color-mix(in srgb, var(--goal-green) 60%, transparent)" }}
    >
      <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
      {label}
    </button>
  );
}
