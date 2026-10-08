"use client";

import { Minus, Plus } from "lucide-react";
import { useT } from "@/lib/language-context";

// Mobil form denetimlerinin web karşılığı (2026-10-08): ChipSelect (ui.tsx), WorkoutTypeChips
// (renkli tür çipleri) ve Stepper (-/+ kademeli sayı, ortadaki alan yine yazılabilir).

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  labels,
  colors,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
  /** Seçenek başına CSS rengi (mobil WorkoutTypeChips); yoksa sayfa tonu. */
  colors?: Partial<Record<T, string>>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        const color = colors?.[option] ?? "var(--tone-accent)";
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`min-h-9 rounded-full border px-3 py-[7px] text-[13px] font-semibold transition-colors ${
              active ? "" : "border-transparent bg-[var(--surface-muted)] text-zinc-500 hover:text-zinc-800 dark:text-white/75 dark:hover:text-white"
            }`}
            style={active ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 15%, transparent)` } : undefined}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

// Mobil workout-identity.ts::CHIP_DARK/LIGHT (kuvvet = sayfa kırmızısı).
export const WORKOUT_TYPE_CHIP_COLORS = {
  kuvvet: "var(--id-workout)",
  kardiyo: "var(--id-fat)",
  esneklik: "var(--goal-green)",
  karışık: "var(--wt-karisik)",
} as const;

export function Stepper({
  id,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  allowDecimal = false,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const current = (() => {
    const parsed = parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : min;
  })();
  const fmt = (n: number) => (allowDecimal ? String(Math.round(n * 100) / 100) : String(Math.round(n)));
  function adjust(delta: number) {
    const next = current + delta;
    onChange(fmt(Math.max(min, max != null ? Math.min(max, next) : next)));
  }
  const canDecrement = value !== "" && current > min;
  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-zinc-800 transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40 dark:text-white";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => adjust(-step)} disabled={!canDecrement} aria-label={t("Azalt", "Decrease")}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        step={allowDecimal ? "any" : 1}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-input)] px-2 text-center text-sm text-zinc-900 outline-none focus:border-[var(--tone-accent)] focus:ring-1 focus:ring-[var(--tone-accent)] dark:text-zinc-100"
      />
      <button type="button" className={btn} onClick={() => adjust(step)} disabled={max != null && current >= max} aria-label={t("Artır", "Increase")}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
