"use client";

import { useEffect, useState } from "react";
import { Footprints } from "lucide-react";
import { deleteSteps, getStepSummary, type StepSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatInt } from "@/lib/format";
import { useLanguage, useT } from "@/lib/language-context";

// Günlük adım (2026-11-06) - mobil components/steps-card.tsx'in web karşılığı.
// Tarayıcı Apple Sağlık'a erişemez: adımlar iPhone uygulamasından eşitlenir,
// burada yalnız gösterilir; veri yoksa kart hiç çıkmaz. Kalori YALNIZ BİLGİ,
// günlük kalori hedefine eklenmez (bkz. backend step_service.py).
const DAY_LETTERS = { tr: ["P", "S", "Ç", "P", "C", "C", "P"], en: ["M", "T", "W", "T", "F", "S", "S"] } as const;

// Mobil STEPS_GRADIENT_DARK + Antrenman ailesinin mercan tonu (`sets`).
const SHELL_STYLE = { "--tile-a": "#9E5236", "--tile-b": "#542A1E", "--tile-solid-light": "#C24A24" } as React.CSSProperties;

function dateKey(y: number, m: number, d: number): string {
  const date = new Date(y, m - 1, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function lastSevenDays(today: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => dateKey(y, m, d - 6 + i));
}

function weekdayIndex(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function StepsPanel() {
  const { token } = useAuth();
  const t = useT();
  const { language } = useLanguage();
  const [summary, setSummary] = useState<StepSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    getStepSummary(token, 7)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [token]);

  async function disconnect() {
    if (!token) return;
    setBusy(true);
    try {
      await deleteSteps(token);
      setSummary(await getStepSummary(token, 7));
      setConfirming(false);
    } catch {
      // Silinemediyse kart olduğu gibi kalır; kullanıcı tekrar deneyebilir.
    } finally {
      setBusy(false);
    }
  }

  if (!summary?.has_data) return null;

  const today = summary.today;
  const byDate = new Map(summary.days.map((d) => [d.date, d.steps]));
  const week = lastSevenDays(today.date).map((date) => ({ date, steps: byDate.get(date) ?? 0 }));
  const max = Math.max(1, ...week.map((d) => d.steps));
  const letters = DAY_LETTERS[language];
  const kcal = today.calories !== null ? `~${formatInt(today.calories, language)} kcal` : null;
  const average =
    summary.days.length >= 2 && summary.average_steps !== null
      ? t(`7 gün ort. ${formatInt(summary.average_steps, language)}`, `7-day avg ${formatInt(summary.average_steps, language)}`)
      : null;
  const hint = [kcal ?? (summary.weight_known ? null : t("Kalori tahmini için kilonu kaydet", "Log your weight for a calorie estimate")), average]
    .filter(Boolean)
    .join(" · ");
  const syncedAt = summary.last_synced_at
    ? new Date(summary.last_synced_at).toLocaleTimeString(language === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="pc-tile rounded-[22px] p-[18px]" style={SHELL_STYLE}>
      <div className="flex items-center gap-2.5 text-[var(--tile-text)]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tile-solid-light)_45%,transparent)] bg-[color-mix(in_srgb,var(--tile-solid-light)_18%,transparent)] text-[var(--tile-solid-light)] dark:border-white/40 dark:bg-white/15 dark:text-white">
          <Footprints className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <h2 className="flex-1 text-lg font-semibold">{t("Adımlar", "Steps")}</h2>
        <p className="flex items-baseline gap-1">
          <span className="text-[26px] font-semibold leading-none tabular-nums">{formatInt(today.steps, language)}</span>
          <span className="text-sm text-[var(--tile-subtle)]">{t("adım", "steps")}</span>
        </p>
      </div>
      {hint ? <p className="mt-1.5 text-sm text-[var(--tile-subtle)]">{hint}</p> : null}
      <div className="mt-3.5 flex justify-between gap-1">
        {week.map((d) => {
          const isToday = d.date === today.date;
          const height = d.steps > 0 ? Math.max(4, Math.round((d.steps / max) * 48)) : 3;
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-1.5"
              role="img"
              aria-label={`${d.date}: ${formatInt(d.steps, language)} ${t("adım", "steps")}${isToday ? t(" (bugün)", " (today)") : ""}`}
            >
              <span className="flex h-12 items-end">
                <span
                  className={`block w-3.5 rounded-full ${
                    isToday
                      ? "bg-[var(--tile-solid-light)] dark:bg-white"
                      : "bg-[color-mix(in_srgb,var(--tile-solid-light)_40%,transparent)] dark:bg-white/45"
                  }`}
                  style={{ height }}
                />
              </span>
              <span className={`text-xs ${isToday ? "font-bold text-[var(--tile-text)]" : "text-[var(--tile-subtle)]"}`}>
                {letters[weekdayIndex(d.date)]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--tile-subtle)]">
        <p>
          {syncedAt
            ? t(`iPhone'dan Apple Sağlık ile eşitlendi · ${syncedAt}`, `Synced from Apple Health on iPhone · ${syncedAt}`)
            : t("iPhone'dan Apple Sağlık ile eşitlendi", "Synced from Apple Health on iPhone")}
        </p>
        {/* Rızanın geri çekilmesi (KVKK 2.1) web'den de yapılabilsin: veri silinir, telefon bir
            sonraki eşitlemede 403 alıp kendi "bağlı" işaretini kaldırır. İki adımlı onay. */}
        {confirming ? (
          <span className="flex items-center gap-2">
            <button type="button" onClick={disconnect} disabled={busy} className="min-h-10 font-semibold underline underline-offset-2">
              {t("Evet, kes ve sil", "Yes, disconnect and delete")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="min-h-10 underline underline-offset-2">
              {t("Vazgeç", "Cancel")}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-10 underline underline-offset-2">
            {t("Bağlantıyı kes", "Disconnect")}
          </button>
        )}
      </div>
      {confirming ? (
        <p className="mt-1 text-xs text-[var(--tile-subtle)]">
          {t(
            "Adım verisi rızan geri alınır ve eşitlenmiş adımların silinir.",
            "Your step data consent is withdrawn and your synced steps are deleted."
          )}
        </p>
      ) : null}
    </div>
  );
}
