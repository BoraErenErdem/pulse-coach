"use client";

import Link from "next/link";
import { ChevronRight, Pencil, Scale, Target } from "lucide-react";
import type { Profile, ProgressLog } from "@/lib/api";
import { metricGoalStatus, type GoalStatus } from "@/lib/goal-status";
import { tileStyle } from "@/lib/identity";
import { useLanguage, useT } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";

// İlerleme'deki "Hedeflerin" kartı - mobil progress-cards.tsx::GoalsCard + GoalInviteCard'ın web
// karşılığı (2026-10-07). Kilo üç işaretçili çubukta (başlangıç -> güncel -> hedef), bel ve yağ
// hedefleri altında kompakt satırlar. Hepsi tamamlanınca kartın tamamı hedef yeşiline döner.
// Hedef yoksa davet kartı. Renkler progress-identity.ts'ten.

const ID = {
  light: { weight: "#E8630A", waist: "#D6588F", fat: "#C99700", green: "#2E9E5B", button: "#217A47" },
  dark: { weight: "#FF8A3D", waist: "#FFA3C8", fat: "#FFD84D", green: "#5EDC8B", button: "#5EDC8B" },
};

function fmt(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function MiniRow({
  label,
  color,
  status,
  goal,
  unit,
  cardDone,
  isDark,
  green,
}: {
  label: string;
  color: string;
  status: GoalStatus;
  goal: number;
  unit: "cm" | "%";
  cardDone: boolean;
  isDark: boolean;
  green: string;
}) {
  const t = useT();
  const { language } = useLanguage();
  const pct = (v: number) => (language === "en" ? `${v}%` : `%${v}`);
  const val = (v: number) => (unit === "%" ? pct(Number(fmt(v))) : `${fmt(v)} cm`);
  const fill = status.reached ? (cardDone && isDark ? "#FFFFFF" : green) : color;
  const track = isDark ? "rgba(255,255,255,0.18)" : cardDone ? `${green}29` : "rgba(36,29,20,0.08)";
  const gap = unit === "%" ? t("puan", "pts") : "cm";
  const caption = status.reached ? t("Hedefte", "On goal") : `${val(status.current)} → ${val(goal)}`;
  const right = status.reached ? `🎉 ${pct(100)}` : status.pct !== null ? pct(Math.round(status.pct)) : t(`${fmt(Math.abs(status.remaining))} ${gap} kaldı`, `${fmt(Math.abs(status.remaining))} ${gap} to go`);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: fill }} aria-hidden="true" />
        <span className="truncate text-sm font-semibold text-[var(--tile-text)]">{label}</span>
      </div>
      {status.pct !== null || status.reached ? (
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: track }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, status.reached ? 100 : (status.pct ?? 0))}%`, background: fill }} />
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-[var(--tile-subtle)]">{caption}</span>
        <span className="shrink-0 font-semibold text-[var(--tile-text)]">{right}</span>
      </div>
    </div>
  );
}

export function GoalsOverviewCard({ logs, profile }: { logs: ProgressLog[]; profile: Profile | null }) {
  const t = useT();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const c = isDark ? ID.dark : ID.light;

  if (!profile) return null;
  const targetKg = profile.target_weight_kg;
  const targetWaist = profile.target_waist_cm;
  const targetFat = profile.target_body_fat_pct;

  if (targetKg === null && targetWaist === null && targetFat === null) {
    // Mobil GoalInviteCard: hedef yokken kartın yerinde davet (yoksa hedef konabildiği fark edilmiyordu).
    return (
      <div className="pc-panel flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3.5">
          <span
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
            style={{ background: `${c.green}26`, borderColor: `${c.green}66`, color: c.green }}
          >
            <Target className="h-[22px] w-[22px]" strokeWidth={2.3} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{t("Bir hedef belirle", "Set a goal")}</p>
            <p className="text-sm text-zinc-500">
              {t(
                "Hedef kilonu (istersen bel çevreni ve yağ oranını da) belirle, ilerlemeni burada takip et.",
                "Set a target weight (and optionally waist and body fat) and track your progress here."
              )}
            </p>
          </div>
        </div>
        <Link
          href="/goals"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] text-[15px] font-semibold"
          style={{ background: c.button, color: isDark ? "#0F3A21" : "#FFFFFF" }}
        >
          {t("Hedef Belirle", "Set a goal")} <ChevronRight className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const weight = metricGoalStatus(logs, "weight", targetKg);
  const waist = metricGoalStatus(logs, "waist", targetWaist);
  const fat = metricGoalStatus(logs, "fat", targetFat);
  const rows = [
    waist && targetWaist !== null ? { key: "waist", label: t("Bel Çevresi", "Waist"), color: c.waist, status: waist, goal: targetWaist, unit: "cm" as const } : null,
    fat && targetFat !== null ? { key: "fat", label: t("Vücut Yağ Oranı", "Body Fat"), color: c.fat, status: fat, goal: targetFat, unit: "%" as const } : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  if (!weight && rows.length === 0) return null;

  const done = (weight ? weight.reached : true) && rows.every((r) => r.status.reached);
  const accent = weight?.reached ? c.green : c.weight;
  const barColor = done && isDark ? "#FFFFFF" : accent;
  const pctNum = weight?.pct ?? null;
  const pctText = (v: number) => (language === "en" ? `${v}%` : `%${v}`);
  const subtitle = weight && targetKg !== null ? remainingText(weight.current, targetKg, language) : t("Takip ettiğin hedefler", "Goals you're tracking");

  return (
    <section className="pc-tile p-5" style={tileStyle(done ? "goalsDone" : "goals")} aria-label={rows.length > 0 ? t("Hedeflerin", "Your Goals") : t("Kilo Hedefi", "Weight Goal")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[var(--tile-text)]">
            <Scale className="h-4 w-4 text-[var(--tile-icon)]" aria-hidden="true" />
            <h2 className="text-lg font-medium">{rows.length > 0 ? t("Hedeflerin", "Your Goals") : t("Kilo Hedefi", "Weight Goal")}</h2>
          </div>
          <p className="mt-0.5 text-[13px] text-[var(--tile-subtle)]">{subtitle}</p>
        </div>
        {weight && (pctNum !== null || weight.reached) ? (
          <span
            className="shrink-0 rounded-full border px-3 py-1 text-sm font-semibold"
            style={
              weight.reached
                ? { background: barColor, borderColor: barColor, color: done && isDark ? "#155A33" : isDark ? "#0F3A21" : "#FFFFFF" }
                : { background: `${accent}${isDark ? "2E" : "22"}`, borderColor: `${accent}${isDark ? "70" : "66"}`, color: "var(--tile-text)" }
            }
          >
            {weight.reached ? `🎉 ${pctText(100)}` : pctText(Math.round(pctNum ?? 0))}
          </span>
        ) : null}
        <Link
          href="/goals"
          aria-label={t("Hedefleri düzenle", "Edit goals")}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--tile-subtle)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Pencil className="h-[17px] w-[17px]" aria-hidden="true" />
        </Link>
      </div>

      {weight && targetKg !== null ? (
        pctNum !== null || weight.reached ? (
          <div className="mt-4">
            {/* Güncel değer balonu: translateX(-p%) ile uçlarda karttan taşmaz. */}
            <div className="relative h-7">
              <span
                className="absolute top-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold"
                style={{
                  left: `${weight.reached ? 100 : pctNum}%`,
                  transform: `translateX(-${weight.reached ? 100 : pctNum}%)`,
                  background: isDark ? "#FFFFFF" : accent,
                  color: isDark ? (weight.reached ? "#155A33" : "#3A1D0C") : "#FFFFFF",
                }}
              >
                {t("Güncel", "Now")} {fmt(weight.current)} kg
              </span>
            </div>
            <div className="relative mt-1 h-5">
              <div className="absolute inset-x-0 top-[5px] h-2.5 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.20)" : done ? `${c.green}29` : "rgba(232,99,10,0.16)" }} />
              <div className="absolute left-0 top-[5px] h-2.5 rounded-full" style={{ width: `${weight.reached ? 100 : pctNum}%`, background: barColor }} />
              <span
                className="absolute -left-px top-[3px] h-3.5 w-3.5 rounded-full border-2"
                style={{ borderColor: isDark ? "#FFFFFF" : accent, background: isDark ? (done ? "#155A33" : "#5A2F1B") : "#FFFFFF" }}
                aria-hidden="true"
              />
              <Target className="absolute -right-0.5 top-px h-[18px] w-[18px] text-[var(--tile-text)]" strokeWidth={2.2} aria-hidden="true" />
              <span
                className="absolute top-0 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white"
                style={{ left: `${weight.reached ? 100 : pctNum}%`, background: barColor, boxShadow: `0 0 8px ${barColor}` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between text-xs text-[var(--tile-subtle)]">
              <span>
                {t("Başlangıç", "Start")} <span className="text-[15px] font-semibold text-[var(--tile-text)]">{fmt(weight.start)} kg</span>
              </span>
              <span>
                {t("Hedef", "Goal")} <span className="text-[15px] font-semibold text-[var(--tile-text)]">{fmt(targetKg)} kg</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-between">
            <div>
              <p className="text-xs text-[var(--tile-subtle)]">{t("Güncel", "Now")}</p>
              <p className="text-[15px] font-semibold text-[var(--tile-text)]">{fmt(weight.current)} kg</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--tile-subtle)]">{t("Hedef", "Goal")}</p>
              <p className="text-[15px] font-semibold text-[var(--tile-text)]">{fmt(targetKg)} kg</p>
            </div>
          </div>
        )
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4">
          {weight ? <div className="mb-3 h-px bg-[rgba(36,29,20,0.10)] dark:bg-white/15" /> : null}
          <div className={rows.length > 1 ? "grid grid-cols-2 gap-x-5 gap-y-3" : ""}>
            {rows.map((row) => (
              <MiniRow key={row.key} label={row.label} color={row.color} status={row.status} goal={row.goal} unit={row.unit} cardDone={done} isDark={isDark} green={c.green} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// mobile/lib/progress-insights.ts::weightGoalRemainingText ile aynı metin.
function remainingText(current: number, target: number, language: string): string {
  const diff = current - target;
  if (Math.abs(diff) < 0.1) return language === "en" ? "You've reached your goal!" : "Hedefine ulaştın!";
  if (diff > 0) return language === "en" ? `${diff.toFixed(1)} kg to lose` : `${diff.toFixed(1)} kg verilmesi gerekiyor`;
  return language === "en" ? `${Math.abs(diff).toFixed(1)} kg to gain` : `${Math.abs(diff).toFixed(1)} kg alınması gerekiyor`;
}
