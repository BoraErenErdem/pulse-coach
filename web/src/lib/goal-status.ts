import type { ProgressLog } from "@/lib/api";

// mobile/components/progress-charts.tsx::metricGoalStatus'un birebir karşılığı (2026-10-07):
// kilo/bel/yağ hedeflerine ilerleme tek hesaptan.

export type BodyMetric = "weight" | "waist" | "fat";

const GETTERS: Record<BodyMetric, (log: ProgressLog) => number | null> = {
  weight: (l) => l.weight,
  waist: (l) => l.waist_cm,
  fat: (l) => l.body_fat_pct,
};

/** Tarihe göre sıralı değer dizisi; aynı gün birden çok kayıt varsa sonuncusu (en büyük id). */
function seriesOf(logs: ProgressLog[], metric: BodyMetric): number[] {
  const byDate = new Map<string, { id: number; value: number }>();
  for (const log of logs) {
    const v = GETTERS[metric](log);
    if (v === null) continue;
    const existing = byDate.get(log.log_date);
    if (!existing || log.id > existing.id) byDate.set(log.log_date, { id: log.id, value: v });
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { value }]) => value);
}

export interface GoalStatus {
  start: number;
  current: number;
  /** 0-100; tek ölçüm varsa ya da başlangıç hedefe çok yakınsa null. */
  pct: number | null;
  reached: boolean;
  /** Güncel - hedef (işaretli: + hedefin üstünde). */
  remaining: number;
}

/** "Başlangıç" = penceredeki değerler içinde hedefe göre EN UZAK nokta, güncel değerle AYNI
 * tarafta olanlar arasından (hedefe ters gidilmişse güncelin kendisi, %0). Yüzde =
 * (başlangıç-güncel)/(başlangıç-hedef). */
export function metricGoalStatus(logs: ProgressLog[], metric: BodyMetric, goal: number | null | undefined): GoalStatus | null {
  if (goal == null) return null;
  const values = seriesOf(logs, metric);
  if (values.length === 0) return null;
  const current = values[values.length - 1];
  const remaining = Math.round((current - goal) * 10) / 10;
  const side = Math.sign(current - goal);
  const sameSide = values.filter((v) => Math.sign(v - goal) === side || v === current);
  const start = side > 0 ? Math.max(...sameSide) : side < 0 ? Math.min(...sameSide) : current;
  const total = start - goal;
  const pct = values.length >= 2 && Math.abs(total) >= 0.1 ? Math.min(100, Math.max(0, ((start - current) / total) * 100)) : null;
  const reached = Math.abs(current - goal) < 0.1 || (pct !== null && pct >= 100);
  return { start, current, pct, reached, remaining };
}
