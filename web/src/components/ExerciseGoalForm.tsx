"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { ApiError, deleteExerciseGoal, setExerciseGoal, type ExerciseCatalogItem, type ExerciseGoalProgress } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage, useT } from "@/lib/language-context";
import { useFormSubmit } from "@/lib/use-form-submit";
import { ExerciseSearchField } from "@/components/exercise-search-field";
import { ErrorBanner, Label, PrimaryButton, SecondaryButton, SuccessBanner, TextInput } from "@/components/ui";

// Hedef Merkezi ve Antrenman sayfalarının ortak egzersiz hedefi formu (2026-10-08, goals/page.tsx'ten
// taşındı; mobilde ikisi de ExerciseGoalSheet'i açıyor).

/** Kartın içinde açılan düzenleme alanı (mobilde sheet). */
export function EditorPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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

/** Egzersiz hedefi ekle/düzenle (mobil ExerciseGoalSheet). Backend aynı egzersiz için upsert yapıyor:
 * düzenlemede ad sabit, hedef değerleri güncellenir; silme iki adımlı onaylı. */
export function ExerciseGoalForm({ editing, onSaved, onDeleted }: { editing: ExerciseGoalProgress | null; onSaved: () => void; onDeleted: () => void }) {
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
