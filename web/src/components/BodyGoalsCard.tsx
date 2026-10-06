"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save, Scale } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { Card, ErrorBanner, Label, PrimaryButton, SuccessBanner, TextInput } from "@/components/ui";

// Mobil Hedef Merkezi "Vücut" bölümünün web karşılığı (2026-10-06): hedef bel çevresi
// ve vücut yağ oranı web'de hiç girilemiyordu (yalnız Profil'de hedef kilo vardı).

/** "72,5" ve "72.5" ikisi de kabul; boş -> null, sayı değilse NaN. */
function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  return trimmed === "" ? null : Number(trimmed);
}

function toField(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function BodyGoalsCard() {
  const t = useT();
  const { profile, updateProfile } = useProfile();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const savedWeight = toField(profile?.target_weight_kg);
  const savedWaist = toField(profile?.target_waist_cm);
  const savedBodyFat = toField(profile?.target_body_fat_pct);
  useEffect(() => {
    function syncFromProfile() {
      setWeight(savedWeight);
      setWaist(savedWaist);
      setBodyFat(savedBodyFat);
    }
    syncFromProfile();
  }, [savedWeight, savedWaist, savedBodyFat]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const values = [parseOptionalNumber(weight), parseOptionalNumber(waist), parseOptionalNumber(bodyFat)];
    if (values.some((value) => value !== null && (Number.isNaN(value) || value <= 0))) {
      setError(t("Hedefler pozitif bir sayı olmalı.", "Goals must be positive numbers."));
      return;
    }
    setIsSaving(true);
    try {
      // null gönderilir: alanı boşaltıp kaydetmek hedefi kaldırır (profile/page.tsx ile aynı kural).
      await updateProfile({ target_weight_kg: values[0], target_waist_cm: values[1], target_body_fat_pct: values[2] });
      setSuccess(t("Vücut hedeflerin kaydedildi!", "Body goals saved!"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        <Scale className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("Vücut Hedefleri", "Body Goals")}
      </h2>
      <p className="mb-4 text-sm text-zinc-500">
        {t(
          "İlerleme sayfası güncel ölçümlerini bu hedeflerle kıyaslar. Hepsi isteğe bağlı.",
          "The Progress page compares your latest measurements with these goals. All optional."
        )}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="goalWeight">{t("Hedef Kilo (kg)", "Target Weight (kg)")}</Label>
            <TextInput id="goalWeight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={t("ör. 72,5", "e.g. 72.5")} />
          </div>
          <div>
            <Label htmlFor="goalWaist">{t("Hedef Bel (cm)", "Target Waist (cm)")}</Label>
            <TextInput id="goalWaist" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder={t("ör. 85", "e.g. 85")} />
          </div>
          <div>
            <Label htmlFor="goalBodyFat">{t("Hedef Yağ Oranı (%)", "Target Body Fat (%)")}</Label>
            <TextInput id="goalBodyFat" inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder={t("ör. 18", "e.g. 18")} />
          </div>
        </div>
        <ErrorBanner message={error} />
        {success ? <SuccessBanner message={success} /> : null}
        <div>
          <PrimaryButton type="submit" disabled={isSaving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? t("Kaydediliyor...", "Saving...") : t("Kaydet", "Save")}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
