"use client";

import { Apple, Dumbbell, Smile } from "lucide-react";
import { useLanguage, useT } from "@/lib/language-context";
import { computeRhythmOverall, rhythmLabel } from "@/lib/rhythm";

// Sohbetin "Bugün" paneli ve üst rozetindeki ritim halkası - mobile/components/rhythm-ring.tsx'in web
// karşılığı (2026-10-07). Dolma animasyonu CSS'te (globals.css .ring-fill); `replayKey` değişince
// halka yeniden mount olup baştan dolar (mobilde panel her açıldığında olduğu gibi).

function pctText(v: number, language: string): string {
  return language === "en" ? `${v}%` : `%${v}`;
}

function Ring({
  overall,
  size,
  stroke,
  replayKey,
  trackColor,
  children,
}: {
  overall: number | null;
  size: number;
  stroke: number;
  replayKey: number;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const target = circumference * (1 - (overall ?? 0) / 100);
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          key={replayKey}
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--tone-accent)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={target}
          className="ring-fill"
          style={{ "--ring-c": `${circumference}px` } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Üst bardaki küçük rozet: yalnız bileşik yüzde. */
export function MiniRhythmRing({
  movementPct,
  nutritionPct,
  moodPct,
  replayKey,
  trackColor,
}: {
  movementPct: number | null;
  nutritionPct: number | null;
  moodPct: number | null;
  replayKey: number;
  trackColor: string;
}) {
  const { language } = useLanguage();
  const overall = computeRhythmOverall(movementPct, nutritionPct, moodPct);
  return (
    <Ring overall={overall} size={38} stroke={7} replayKey={replayKey} trackColor={trackColor}>
      <span className="text-[10px] font-bold leading-none text-[#F5F3EE]">{overall != null ? pctText(overall, language) : "—"}</span>
    </Ring>
  );
}

/** Paneldeki tam halka + Hareket / Beslenme / Ruh Hali dökümü. */
export function RhythmRing({
  movementPct,
  nutritionPct,
  moodPct,
  variantSeed,
}: {
  movementPct: number | null;
  nutritionPct: number | null;
  moodPct: number | null;
  variantSeed: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const overall = computeRhythmOverall(movementPct, nutritionPct, moodPct);
  const rows = [
    { icon: Dumbbell, name: t("Hareket", "Movement"), pct: movementPct },
    { icon: Apple, name: t("Beslenme", "Nutrition"), pct: nutritionPct },
    { icon: Smile, name: t("Ruh Hali", "Mood"), pct: moodPct },
  ];
  return (
    <div className="flex items-center gap-4">
      <Ring overall={overall} size={92} stroke={9} replayKey={variantSeed} trackColor="color-mix(in srgb, currentColor 14%, transparent)">
        <span className="text-[22px] font-bold leading-none">{overall ?? "—"}</span>
        <span className="mt-0.5 text-[11px] font-semibold opacity-75">{t("İlerleme", "Progress")}</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-sm font-semibold">• {rhythmLabel(overall, t, variantSeed)}</p>
        <ul className="space-y-1">
          {rows.map(({ icon: Icon, name, pct }) => (
            <li key={name} className="flex items-center gap-2 text-[13px]">
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
              <span className="flex-1 opacity-80">{name}</span>
              <span className="font-semibold tabular-nums">{pct != null ? pctText(pct, language) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
