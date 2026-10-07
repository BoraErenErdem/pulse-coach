"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, Dumbbell, MessageCircle, Pencil, Plus, Ruler, Save, ShieldAlert, Sparkles, Trash2, Utensils, X } from "lucide-react";
import {
  ApiError,
  deleteExerciseGoal,
  getCalorieRecommendation,
  getDailyNutritionSummary,
  getExerciseGoals,
  getProgressLogs,
  getWeeklyGoal,
  setExerciseGoal,
  type CalorieRecommendation,
  type CalorieRecommendationMissing,
  type ExerciseCatalogItem,
  type ExerciseGoalProgress,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useAsyncResource } from "@/lib/use-async-resource";
import { useFormSubmit } from "@/lib/use-form-submit";
import { buildGoalItems, type GoalItem, type GoalOverviewData, type GoalOwner } from "@/lib/goal-overview";
import { tileStyle } from "@/lib/identity";
import { BodyGoalsCard } from "@/components/BodyGoalsCard";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import { WeeklyGoalCard } from "@/components/WeeklyGoalCard";
import { ErrorBanner, Label, PrimaryButton, SecondaryButton, Skeleton, SuccessBanner, TextInput } from "@/components/ui";
import { BackToProfile } from "@/components/BackToProfile";

// Profil > Hedef Merkezi - mobil app/goals.tsx'in web karşılığı (2026-10-07). Önceden bu sayfa alt
// alta dört formdu. Artık mobildeki gibi bir harita: özet (tamamlanan / toplam + her hedef için bir
// dilim) ve her hedef grubu SAHİBİ olan sekmenin renginde (Vücut / Antrenman / Beslenme). Mobilde
// "düzenle" o sekmenin sheet'ini açıyor; web'de form kartın içinde açılıyor, aynı anda tek form.

type Editor = "body" | "weekly" | "nutrition" | "exercise" | null;

const OWNER_COLOR: Record<GoalOwner, string> = {
  progress: "var(--owner-progress)",
  workouts: "var(--owner-workouts)",
  nutrition: "var(--owner-nutrition)",
};

function GoalRow({ item, color, onClick }: { item: GoalItem; color: string; onClick?: () => void }) {
  const t = useT();
  const { language } = useLanguage();
  const fill = item.reached ? "var(--goal-green)" : color;
  const pctText = item.reached
    ? t("Tamam", "Done")
    : item.pct != null
      ? language === "en"
        ? `${Math.round(item.pct)}%`
        : `%${Math.round(item.pct)}`
      : "–";
  const body = (
    <>
      <div className="flex min-h-[26px] items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{item.label}</span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold text-zinc-900 dark:text-white"
          style={{
            background: `color-mix(in srgb, ${fill} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${fill} 45%, transparent)`,
          }}
        >
          {item.reached ? <Check className="h-3 w-3" style={{ color: fill }} strokeWidth={3} aria-hidden="true" /> : null}
          {pctText}
        </span>
        {onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" /> : null}
      </div>
      <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-[rgba(36,29,20,0.08)] dark:bg-white/15">
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, item.reached ? 100 : (item.pct ?? 0))}%`, background: fill }} />
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{item.detail}</p>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${item.label}: ${item.detail}`}
      className="-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
    >
      {body}
    </button>
  ) : (
    <div>{body}</div>
  );
}

function OwnerCard({
  color,
  icon,
  title,
  subtitle,
  onEdit,
  editLabel,
  children,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="pc-panel flex flex-col gap-3.5 p-[18px] sm:p-5" aria-label={title}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-[1.5px] [&>svg]:h-[18px] [&>svg]:w-[18px]"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={editLabel}
            className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:text-white/85 dark:hover:bg-white/10"
            style={{ color }}
          >
            <Pencil className="h-[17px] w-[17px] dark:text-white/85" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OutlineButton({ color, onClick, children }: { color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] text-sm font-semibold transition-colors hover:bg-black/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 60%, transparent)` }}
    >
      <Plus className="h-4 w-4 dark:text-white" aria-hidden="true" />
      <span className="dark:text-white">{children}</span>
    </button>
  );
}

function EmptyGoal({ text, action, color, onClick }: { text: string; action: string; color: string; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] leading-[18px] text-zinc-500 dark:text-zinc-400">{text}</p>
      <OutlineButton color={color} onClick={onClick}>
        {action}
      </OutlineButton>
    </div>
  );
}

/** Kartın içinde açılan düzenleme alanı (mobilde sheet). */
function EditorPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="animate-fade-in-up border-t border-[var(--border-subtle)] pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Kapat", "Close")}
          className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}

function NutritionGoalForm({ onSaved }: { onSaved: () => void }) {
  const { token } = useAuth();
  const t = useT();
  // Profil ProfileProvider'ın paylaşımlı cache'inden okunuyor (ayrıca fetch yok).
  const { profile, updateProfile } = useProfile();
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [carbsGoal, setCarbsGoal] = useState("");
  const [fatGoal, setFatGoal] = useState("");
  const { isSubmitting, error, success, setSuccess, submit } = useFormSubmit();

  // Form alanlarını paylaşımlı profile her değiştiğinde (ilk yükleme VEYA kendi kaydından sonra) senkron tutar.
  useEffect(() => {
    function syncFromProfile() {
      if (!profile) return;
      setCalorieGoal(profile.daily_calorie_goal?.toString() ?? "");
      setProteinGoal(profile.daily_protein_goal_g?.toString() ?? "");
      setCarbsGoal(profile.daily_carbs_goal_g?.toString() ?? "");
      setFatGoal(profile.daily_fat_goal_g?.toString() ?? "");
    }
    syncFromProfile();
  }, [profile]);

  // Kalori önerisi (2026-09-26): profil (boy/aktivite/hedef) değişince yenilenir. Öneri alanları
  // SADECE doldurur - kayıt yine Kaydet ile.
  const [recommendation, setRecommendation] = useState<CalorieRecommendation | null>(null);
  useEffect(() => {
    if (!token || !profile) return;
    let cancelled = false;
    getCalorieRecommendation(token)
      .then((rec) => {
        if (!cancelled) setRecommendation(rec);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, profile]);
  const MISSING_LABELS: Record<CalorieRecommendationMissing, string> = {
    height: t("boy", "height"),
    birth_year: t("doğum yılı", "birth year"),
    sex: t("cinsiyet", "sex"),
    weight: t("güncel kilo", "current weight"),
    activity_level: t("aktivite seviyesi", "activity level"),
  };

  function applyRecommendation(rec: CalorieRecommendation) {
    setCalorieGoal(String(rec.calories ?? ""));
    setProteinGoal(String(rec.protein_g ?? ""));
    setCarbsGoal(String(rec.carbs_g ?? ""));
    setFatGoal(String(rec.fat_g ?? ""));
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    // `undefined` DEĞİL `null` gönderiyoruz - aksi halde bir hedefi temizleyip kaydetmek sessizce
    // yok sayılıyordu (kullanıcı bulgusu).
    await submit(async () => {
      await updateProfile({
        daily_calorie_goal: calorieGoal ? Number(calorieGoal) : null,
        daily_protein_goal_g: proteinGoal ? Number(proteinGoal) : null,
        daily_carbs_goal_g: carbsGoal ? Number(carbsGoal) : null,
        daily_fat_goal_g: fatGoal ? Number(fatGoal) : null,
      });
      setSuccess(t("Hedefler kaydedildi!", "Goals saved!"));
      onSaved();
    });
  }

  const fields = [
    { id: "calorieGoal", label: t("Kalori (kcal)", "Calories (kcal)"), value: calorieGoal, set: setCalorieGoal },
    { id: "proteinGoal", label: t("Protein (g)", "Protein (g)"), value: proteinGoal, set: setProteinGoal },
    { id: "carbsGoal", label: t("Karbonhidrat (g)", "Carbs (g)"), value: carbsGoal, set: setCarbsGoal },
    { id: "fatGoal", label: t("Yağ (g)", "Fat (g)"), value: fatGoal, set: setFatGoal },
  ];

  return (
    <div className="flex flex-col gap-4">
      {recommendation ? (
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-muted)] p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("Sana Özel Öneri", "Your Suggested Goals")}
          </p>
          {recommendation.available ? (
            <>
              <p className="text-zinc-700 dark:text-zinc-200">
                <span className="text-lg font-semibold">{recommendation.calories} kcal</span>
                {" · "}
                {t("Protein", "Protein")} {recommendation.protein_g} g · {t("Karbonhidrat", "Carbs")} {recommendation.carbs_g} g ·{" "}
                {t("Yağ", "Fat")} {recommendation.fat_g} g
              </p>
              <p className="mt-1 text-zinc-500">
                {t(
                  `${recommendation.weight_kg} kg · ${recommendation.height_cm} cm · ${recommendation.age} yaş; harcama ~${recommendation.tdee} kcal, ayar ${recommendation.adjustment_kcal} kcal. Mifflin-St Jeor tahmini - hamilelik, emzirme ya da bir sağlık durumun varsa bir uzmana danış.`,
                  `${recommendation.weight_kg} kg · ${recommendation.height_cm} cm · age ${recommendation.age}; expenditure ~${recommendation.tdee} kcal, adjustment ${recommendation.adjustment_kcal} kcal. Mifflin-St Jeor estimate - if you're pregnant, breastfeeding or have a health condition, check with a professional.`
                )}
              </p>
              <SecondaryButton type="button" className="mt-3" onClick={() => applyRecommendation(recommendation)}>
                {t("Alanlara Doldur", "Fill In the Fields")}
              </SecondaryButton>
            </>
          ) : (
            <p className="text-zinc-500">
              {t("Öneri için eksik: ", "To suggest goals we still need: ")}
              {recommendation.missing.map((m) => MISSING_LABELS[m]).join(", ")}.{" "}
              <Link
                href={recommendation.missing.length === 1 && recommendation.missing[0] === "weight" ? "/progress" : "/profile/settings"}
                className="font-medium underline"
              >
                {recommendation.missing.length === 1 && recommendation.missing[0] === "weight"
                  ? t("Kilonu kaydet", "Log your weight")
                  : t("Profilde tamamla", "Complete in Profile")}
              </Link>
            </p>
          )}
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-4">
        {success ? <SuccessBanner message={success} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.id}>
              <Label htmlFor={field.id}>{field.label}</Label>
              <TextInput
                id={field.id}
                type="number"
                min={0}
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                placeholder={t("opsiyonel", "optional")}
              />
            </div>
          ))}
        </div>
        <PrimaryButton type="submit" disabled={isSubmitting}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
        </PrimaryButton>
      </form>
    </div>
  );
}

/** Egzersiz hedefi ekle/düzenle (mobil ExerciseGoalSheet). Backend aynı egzersiz için upsert yapıyor:
 * düzenlemede ad sabit, hedef değerleri güncellenir; silme iki adımlı onaylı. */
function ExerciseGoalForm({ editing, onSaved, onDeleted }: { editing: ExerciseGoalProgress | null; onSaved: () => void; onDeleted: () => void }) {
  const { token } = useAuth();
  const t = useT();
  const { language } = useLanguage();
  const isEditDuration = editing?.target_duration_minutes != null;
  const [name, setName] = useState(editing ? (language === "en" ? editing.exercise_name : editing.exercise_name_tr) : "");
  // Katalogdan seçilen kaydın kategorisi - kardiyo/esneklikte kg/tekrar yerine süre hedefi girilir.
  // Serbest yazınca (yeniden seçim yapılmadan) sıfırlanır, önceki seçimin kategorisine güvenilmez.
  const [catalogId, setCatalogId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(isEditDuration ? "kardiyo" : null);
  const [target, setTarget] = useState(editing && !isEditDuration ? String(editing.target_weight_kg ?? "") : "");
  const [reps, setReps] = useState(editing && !isEditDuration && editing.target_reps != null ? String(editing.target_reps) : "");
  const [duration, setDuration] = useState(isEditDuration ? String(editing?.target_duration_minutes) : "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isDurationGoal = category === "kardiyo" || category === "esneklik";
  const { isSubmitting, error, setError, success, setSuccess, resetMessages, submit } = useFormSubmit();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    resetMessages();
    if (!name.trim()) {
      setError(t("Egzersiz adı girmelisin.", "You need to enter an exercise name."));
      return;
    }
    let payload: Parameters<typeof setExerciseGoal>[1];
    if (isDurationGoal) {
      const durationNumber = Number(duration);
      if (!durationNumber || durationNumber <= 0) {
        setError(t("Hedef süre sıfırdan büyük olmalı.", "Target duration must be greater than zero."));
        return;
      }
      payload = { exercise_name: name.trim(), target_duration_minutes: durationNumber, exercise_catalog_id: catalogId ?? undefined };
    } else {
      const targetNumber = Number(target);
      if (!targetNumber || targetNumber <= 0) {
        setError(t("Hedef ağırlık sıfırdan büyük olmalı.", "Target weight must be greater than zero."));
        return;
      }
      // Tekrar hedefi opsiyonel - boşsa hiç gönderilmez.
      let repsNumber: number | undefined;
      if (reps.trim()) {
        repsNumber = Number(reps);
        if (!repsNumber || repsNumber <= 0) {
          setError(t("Hedef tekrar sayısı sıfırdan büyük olmalı.", "Target reps must be greater than zero."));
          return;
        }
      }
      payload = { exercise_name: name.trim(), target_weight_kg: targetNumber, target_reps: repsNumber, exercise_catalog_id: catalogId ?? undefined };
    }
    await submit(async () => {
      await setExerciseGoal(token, payload);
      setSuccess(editing ? t("Hedef güncellendi!", "Goal updated!") : t("Hedef eklendi!", "Goal added!"));
      if (!editing) {
        setName("");
        setTarget("");
        setReps("");
        setDuration("");
        setCatalogId(null);
        setCategory(null);
      }
      onSaved();
    });
  }

  async function handleDelete() {
    if (!token || !editing) return;
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    try {
      await deleteExerciseGoal(token, editing.id);
      onDeleted();
    } catch (err) {
      setIsConfirmingDelete(false);
      setError(err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {success ? <SuccessBanner message={success} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      <div>
        <Label htmlFor="goalExercise">{t("Egzersiz", "Exercise")}</Label>
        {editing ? (
          <p id="goalExercise" className="text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{name}</p>
        ) : (
          <ExerciseSearchField
            id="goalExercise"
            value={name}
            onChange={(value) => {
              setName(value);
              setCatalogId(null);
              setCategory(null);
            }}
            onSelectItem={(item: ExerciseCatalogItem) => {
              setCatalogId(item.id);
              setCategory(item.category_tr);
            }}
          />
        )}
      </div>
      {isDurationGoal ? (
        <div>
          <Label htmlFor="exerciseDuration">{t("Hedef Süre (dakika)", "Target Duration (min)")}</Label>
          <TextInput id="exerciseDuration" type="number" min={0} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exerciseTarget">{t("Hedef (kg)", "Target (kg)")}</Label>
            <TextInput id="exerciseTarget" type="number" min={0} step={0.5} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exerciseReps">{t("Hedef Tekrar (opsiyonel)", "Target Reps (optional)")}</Label>
            <TextInput
              id="exerciseReps"
              type="number"
              min={0}
              step={1}
              placeholder={t("opsiyonel", "optional")}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={isSubmitting}>
          {editing ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {isSubmitting ? t("Kaydediliyor...", "Saving...") : editing ? t("Kaydet", "Save") : t("Ekle", "Add")}
        </PrimaryButton>
        {editing ? (
          <SecondaryButton type="button" onClick={handleDelete} className="text-red-700 dark:text-red-300">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isConfirmingDelete ? t("Silmeyi onayla", "Confirm delete") : t("Hedefi sil", "Delete goal")}
          </SecondaryButton>
        ) : null}
      </div>
    </form>
  );
}

export default function GoalsPage() {
  const { token } = useAuth();
  const t = useT();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const [data, setData] = useState<GoalOverviewData | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [editingExercise, setEditingExercise] = useState<ExerciseGoalProgress | null>(null);

  // Profil'deki "Hedeflerin" kartıyla (ve mobil goal-overview.ts ile) aynı dört kaynak.
  const { isLoading, error: loadError, refresh } = useAsyncResource(async () => {
    if (!token) return;
    const [logs, weeklyGoal, nutrition, exerciseGoals] = await Promise.all([
      getProgressLogs(token, 90),
      getWeeklyGoal(token),
      getDailyNutritionSummary(token),
      getExerciseGoals(token),
    ]);
    setData({ logs, weeklyGoal, nutrition, exerciseGoals });
  }, [token]);
  // Haftalık gün/kalori hedefi değişince özet (done/goal, bugünkü yüzde) backend'den yeniden
  // okunmalı - profil bağlamı yalnız hedef değerini tutar (mobil closeSheet ile aynı).
  const reload = useCallback(() => void refresh(), [refresh]);

  const items = buildGoalItems(profile, data, language, t);
  const groups: Record<GoalOwner, GoalItem[]> = {
    progress: items.filter((item) => item.owner === "progress"),
    workouts: items.filter((item) => item.owner === "workouts"),
    nutrition: items.filter((item) => item.owner === "nutrition"),
  };
  const done = items.filter((item) => item.reached).length;
  const weeklyItem = groups.workouts.find((item) => item.key === "weekly") ?? null;
  const exerciseItems = groups.workouts.filter((item) => item.key.startsWith("exercise-"));

  function ownerSubtitle(owner: GoalOwner): string {
    const list = groups[owner];
    if (list.length === 0) return t("Henüz hedef yok", "No goals yet");
    const reached = list.filter((item) => item.reached).length;
    return t(`${list.length} hedef · ${reached} tamam`, `${list.length} goals · ${reached} done`);
  }

  function open(next: Editor, exercise: ExerciseGoalProgress | null = null) {
    // Aynı düzenleyiciye tekrar basmak kapatır (kalem düğmesi aç/kapa).
    if (next === editor && exercise?.id === editingExercise?.id) {
      setEditor(null);
      setEditingExercise(null);
      return;
    }
    setEditor(next);
    setEditingExercise(exercise);
  }
  function close() {
    setEditor(null);
    setEditingExercise(null);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Mobilde bu ekran Profil'in üstüne açılıyor: geri bağlantısı (2026-10-07). */}
      <div>
        <BackToProfile />
        <h1 className="text-[30px] font-medium leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{t("Hedef Merkezi", "Goal Center")}</h1>
      </div>

      {loadError ? <ErrorBanner message={loadError} /> : null}

      {isLoading && !data ? (
        <>
          <Skeleton className="h-28 w-full rounded-[22px]" />
          <Skeleton className="h-52 w-full rounded-[22px]" />
          <Skeleton className="h-52 w-full rounded-[22px]" />
        </>
      ) : (
        <>
          {/* Masaüstünde iki sütun (solda özet/Vücut/Beslenme, sağda Antrenman); telefonda mobil sırası
              (özet, Vücut, Antrenman, Beslenme). */}
          <div className="grid gap-[14px] lg:grid-cols-2 lg:items-start lg:gap-6">
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
              {/* Özet (sakin ametist): toplam + her hedef için bir dilim; dilim rengi hedefin sahibi,
                  tamamlanan yeşil. */}
              <section className="pc-tile flex flex-col gap-3 p-[18px] sm:p-5" style={tileStyle("profileGoals")} aria-label={t("Hedef özeti", "Goal summary")}>
                <p className="flex flex-wrap items-baseline gap-x-2.5 text-[var(--tile-text)]">
                  <span className="text-[34px] font-medium leading-none tracking-[-0.5px] tabular-nums">
                    {done}
                    <span className="text-xl text-[var(--tile-subtle)]"> / {items.length}</span>
                  </span>
                  <span className="text-[15px] font-medium">
                    {items.length === 0 ? t("Henüz hedefin yok", "You have no goals yet") : t("hedef tamamlandı", "goals completed")}
                  </span>
                </p>
                {items.length > 0 ? (
                  <div className="flex gap-1" aria-hidden="true">
                    {items.map((item) => (
                      <span
                        key={`${item.owner}-${item.key}`}
                        className="h-2 flex-1 rounded-full"
                        style={{
                          background: item.reached ? "var(--goal-green)" : `color-mix(in srgb, ${OWNER_COLOR[item.owner]} 30%, transparent)`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                <p className="text-xs leading-[17px] text-[var(--tile-subtle)]">
                  {t(
                    "Hedefler sekmelerinde yaşar; buradan hepsini görüp düzenleyebilirsin.",
                    "Goals live in their tabs; here you can see and edit them all."
                  )}
                </p>
              </section>

              <OwnerCard
                color={OWNER_COLOR.progress}
                icon={<Ruler />}
                title={t("Vücut", "Body")}
                subtitle={ownerSubtitle("progress")}
                onEdit={groups.progress.length > 0 ? () => open("body") : undefined}
                editLabel={t("Vücut hedeflerini düzenle", "Edit body goals")}
              >
                {groups.progress.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {groups.progress.map((item) => (
                      <GoalRow key={item.key} item={item} color={OWNER_COLOR.progress} />
                    ))}
                  </div>
                ) : editor !== "body" ? (
                  <EmptyGoal
                    text={t("Hedef kilo, bel çevresi ya da yağ oranı belirleyebilirsin.", "You can set a target weight, waist or body fat.")}
                    action={t("Vücut hedefi belirle", "Set a body goal")}
                    color={OWNER_COLOR.progress}
                    onClick={() => open("body")}
                  />
                ) : null}
                {editor === "body" ? (
                  <EditorPanel title={t("Vücut Hedefleri", "Body Goals")} onClose={close}>
                    <BodyGoalsCard embedded onSaved={reload} />
                  </EditorPanel>
                ) : null}
              </OwnerCard>

              {/* Telefonda sol sütun "contents" olur, Beslenme order-last ile Antrenman'ın altına iner. */}
              <div className="order-last lg:order-none">
                <OwnerCard
                  color={OWNER_COLOR.nutrition}
                  icon={<Utensils />}
                  title={t("Beslenme", "Nutrition")}
                  subtitle={groups.nutrition.length > 0 ? t("Bugünkü durum", "Today's status") : ownerSubtitle("nutrition")}
                  onEdit={groups.nutrition.length > 0 ? () => open("nutrition") : undefined}
                  editLabel={t("Beslenme hedeflerini düzenle", "Edit nutrition goals")}
                >
                  {groups.nutrition.length > 0 ? (
                    <div className="flex flex-col gap-3.5">
                      {groups.nutrition.map((item) => (
                        <GoalRow key={item.key} item={item} color={OWNER_COLOR.nutrition} />
                      ))}
                    </div>
                  ) : editor !== "nutrition" ? (
                    <EmptyGoal
                      text={t("Günlük kalori ve makro hedeflerini belirleyebilirsin.", "You can set daily calorie and macro goals.")}
                      action={t("Beslenme hedefi belirle", "Set a nutrition goal")}
                      color={OWNER_COLOR.nutrition}
                      onClick={() => open("nutrition")}
                    />
                  ) : null}
                  {editor === "nutrition" ? (
                    <EditorPanel title={t("Günlük Beslenme Hedefleri", "Daily Nutrition Goals")} onClose={close}>
                      <NutritionGoalForm onSaved={reload} />
                    </EditorPanel>
                  ) : null}
                  {profile?.dietary_restrictions ? (
                    <Link
                      href="/profile/settings"
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--owner-nutrition)_7%,transparent)] px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--owner-nutrition)_12%,transparent)] dark:bg-white/[0.06] dark:hover:bg-white/10"
                      title={t("Hesap ve Ayarlar'da düzenlenir", "Edited in Account & Settings")}
                    >
                      <ShieldAlert className="h-[15px] w-[15px] shrink-0 text-[var(--owner-nutrition)] dark:text-white/85" aria-hidden="true" />
                      <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] text-zinc-900 dark:text-zinc-50">
                        <span className="font-semibold">{t("Hassasiyetler: ", "Sensitivities: ")}</span>
                        {profile.dietary_restrictions}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                    </Link>
                  ) : null}
                </OwnerCard>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-[14px] lg:gap-6">
              <OwnerCard color={OWNER_COLOR.workouts} icon={<Dumbbell />} title={t("Antrenman", "Workouts")} subtitle={ownerSubtitle("workouts")}>
                <div className="flex flex-col gap-3.5">
                  {weeklyItem ? (
                    <GoalRow item={weeklyItem} color={OWNER_COLOR.workouts} onClick={() => open("weekly")} />
                  ) : editor !== "weekly" ? (
                    <EmptyGoal
                      text={t("Haftada kaç gün antrenman yapmak istediğini belirle.", "Set how many days a week you want to train.")}
                      action={t("Haftalık hedef belirle", "Set a weekly goal")}
                      color={OWNER_COLOR.workouts}
                      onClick={() => open("weekly")}
                    />
                  ) : null}
                  {editor === "weekly" ? (
                    <EditorPanel title={t("Haftalık Antrenman Hedefi", "Weekly Workout Goal")} onClose={close}>
                      <WeeklyGoalCard embedded onSaved={reload} />
                    </EditorPanel>
                  ) : null}
                  {exerciseItems.length > 0 ? <div className="h-px bg-[rgba(36,29,20,0.08)] dark:bg-white/12" /> : null}
                  {exerciseItems.map((item) => {
                    const goal = data?.exerciseGoals.find((g) => `exercise-${g.id}` === item.key) ?? null;
                    return (
                      <div key={item.key} className="flex flex-col gap-3.5">
                        <GoalRow item={item} color={OWNER_COLOR.workouts} onClick={goal ? () => open("exercise", goal) : undefined} />
                        {editor === "exercise" && goal && editingExercise?.id === goal.id ? (
                          <EditorPanel title={t("Egzersiz Hedefini Düzenle", "Edit Exercise Goal")} onClose={close}>
                            <ExerciseGoalForm
                              key={goal.id}
                              editing={goal}
                              onSaved={reload}
                              onDeleted={() => {
                                close();
                                reload();
                              }}
                            />
                          </EditorPanel>
                        ) : null}
                      </div>
                    );
                  })}
                  {editor === "exercise" && editingExercise === null ? (
                    <EditorPanel title={t("Egzersiz Hedefi Ekle", "Add Exercise Goal")} onClose={close}>
                      <ExerciseGoalForm key="new" editing={null} onSaved={reload} onDeleted={close} />
                    </EditorPanel>
                  ) : (
                    <OutlineButton color={OWNER_COLOR.workouts} onClick={() => open("exercise")}>
                      {t("Egzersiz hedefi ekle", "Add exercise goal")}
                    </OutlineButton>
                  )}
                </div>
              </OwnerCard>

            </div>
          </div>

          <p className="flex items-start gap-1.5 px-1 text-xs leading-[17px] text-zinc-500">
            <MessageCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(
              'Hedeflerini sohbetten de söyleyebilirsin (ör. "squat\'ta 100 kiloya ulaşmak istiyorum").',
              'You can also tell your coach in chat (e.g. "I want to squat 100 kg").'
            )}
          </p>
        </>
      )}
    </div>
  );
}
