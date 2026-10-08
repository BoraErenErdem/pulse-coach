"use client";

import { Cookie, Moon, Sun, Sunrise } from "lucide-react";
import { MEAL_TYPES, type FoodCatalogItem, type MealType } from "@/lib/api";
import { useLanguage, useT } from "@/lib/language-context";
import { formatInt } from "@/lib/format";

// Mobil nutrition-cards.tsx parçalarının web karşılığı (2026-10-08): öğün simgesi, simgeli öğün
// çipleri ve seçilen besinin bu miktardaki önizlemesi.

export function MealTypeIcon({ type, className = "h-[15px] w-[15px]" }: { type: MealType; className?: string }) {
  const Icon = type === "kahvaltı" ? Sunrise : type === "öğle" ? Sun : type === "akşam" ? Moon : Cookie;
  return <Icon className={className} aria-hidden="true" />;
}

export const MEAL_LABELS: Record<"tr" | "en", Record<MealType, string>> = {
  tr: { kahvaltı: "Kahvaltı", öğle: "Öğle", akşam: "Akşam", atıştırmalık: "Atıştırmalık" },
  en: { kahvaltı: "Breakfast", öğle: "Lunch", akşam: "Dinner", atıştırmalık: "Snack" },
};

/** Formun varsayılan öğünü saate göre (mobil mealTypeForNow). */
export function mealTypeForNow(date = new Date()): MealType {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "kahvaltı";
  if (h >= 11 && h < 16) return "öğle";
  if (h >= 18 && h < 22) return "akşam";
  return "atıştırmalık";
}

export function MealTypeChips({ value, onChange }: { value: MealType; onChange: (next: MealType) => void }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div role="radiogroup" aria-label={t("Öğün", "Meal")} className="flex flex-wrap gap-2">
      {MEAL_TYPES.map((type) => {
        const active = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[13px] font-semibold transition-colors ${
              active
                ? "border-[var(--tone-fill)] bg-[var(--tone-fill)] text-[var(--tone-on-fill)] dark:border-[var(--tone-accent)] dark:bg-[color-mix(in_srgb,var(--tone-accent)_25%,transparent)] dark:text-white"
                : "border-transparent bg-[var(--pc-box)] text-zinc-500 hover:text-zinc-800 dark:text-white/75 dark:hover:text-white"
            }`}
          >
            <MealTypeIcon type={type} className="h-3.5 w-3.5" />
            {MEAL_LABELS[language][type]}
          </button>
        );
      })}
    </div>
  );
}

export function FoodPreview({ food, grams }: { food: FoodCatalogItem; grams: number }) {
  const t = useT();
  const { language } = useLanguage();
  const f = grams / 100;
  const fmt = (n: number) => formatInt(n, language);
  const parts = [
    { key: "kalori", color: "var(--nu-kalori)", label: "", value: `${fmt(food.calories_kcal * f)} kcal` },
    { key: "protein", color: "var(--nu-protein)", label: t("P", "P"), value: `${fmt(food.protein_g * f)} g` },
    { key: "karbonhidrat", color: "var(--nu-karbonhidrat)", label: t("K", "C"), value: `${fmt(food.carbs_g * f)} g` },
    { key: "yag", color: "var(--nu-yag)", label: t("Y", "F"), value: `${fmt(food.fat_g * f)} g` },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[14px] bg-[var(--pc-box)] px-3.5 py-2.5"
      aria-label={t(
        `Bu kayıt: ${parts[0].value}, protein ${parts[1].value}, karbonhidrat ${parts[2].value}, yağ ${parts[3].value}`,
        `This entry: ${parts[0].value}, protein ${parts[1].value}, carbs ${parts[2].value}, fat ${parts[3].value}`
      )}
      role="note"
    >
      {parts.map((part) => (
        <span key={part.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: part.color }} aria-hidden="true" />
          <span className={part.key === "kalori" ? "text-[15px] font-bold text-zinc-900 dark:text-white" : "text-[13px] font-medium text-zinc-800 dark:text-white"}>
            {part.label ? `${part.label} ` : ""}
            {part.value}
          </span>
        </span>
      ))}
    </div>
  );
}
