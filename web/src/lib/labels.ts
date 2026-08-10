import type { WorkoutType } from "./api";

// workouts/page.tsx (form chip'leri + oturum geçmişi) ve WorkoutTypeChart.tsx
// (tür dağılımı grafiği) aynı TR/EN antrenman türü etiketlerini İKİ AYRI
// biçimde tanımlıyordu (2026-08-10 mimari borç raporu, bulgu #12) - tek
// paylaşımlı, dile göre indekslenen sözlükte birleştirildi.
export const WORKOUT_TYPE_LABELS: Record<"tr" | "en", Record<WorkoutType, string>> = {
  tr: { kuvvet: "Kuvvet", kardiyo: "Kardiyo", esneklik: "Esneklik", karışık: "Karışık" },
  en: { kuvvet: "Strength", kardiyo: "Cardio", esneklik: "Flexibility", karışık: "Mixed" },
};
