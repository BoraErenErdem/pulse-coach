"use client";

import { useEffect, useState } from "react";
import { deleteTodayMood, getTodayMood, setTodayMood, type MoodKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { MoodFaceIcon } from "@/components/MoodFaceIcon";

/** Ruh Hali Destek Agent için günlük mod göstergesi. Seçim `mood_logs`
 * tablosunda kalıcı olarak tutulur (bkz. `mood_service.py`) ve
 * orchestrator'ın system prompt'una SADECE ton ayarlamak için bağlam olarak
 * eklenir — kriz tespiti bundan hiç etkilenmez (ayrı, ham mesaja dayalı
 * deterministik bir katman). */
export function MoodPicker({
  onMoodChange,
  variant = "inline",
}: {
  onMoodChange?: (mood: MoodKey | null) => void;
  /** "panel": sohbetin "Bugün" paneli (mobil mood-picker variant="panel"): solda başlık, sağda
   * hap içinde çizgi yüzler. */
  variant?: "inline" | "panel";
}) {
  const { token } = useAuth();
  const t = useT();
  const [selected, setSelected] = useState<MoodKey | null>(null);
  const [isPending, setIsPending] = useState(false);

  const MOOD_OPTIONS: { key: MoodKey; emoji: string; label: string }[] = [
    { key: "zor", emoji: "😔", label: t("Zor", "Tough") },
    { key: "dusuk", emoji: "😕", label: t("Düşük", "Low") },
    { key: "notr", emoji: "🙂", label: t("Nötr", "Neutral") },
    { key: "iyi", emoji: "😊", label: t("İyi", "Good") },
    { key: "harika", emoji: "🤩", label: t("Harika", "Great") },
  ];

  useEffect(() => {
    if (!token) return;
    getTodayMood(token)
      .then((mood) => setSelected(mood?.mood_key ?? null))
      .catch(() => {});
  }, [token]);

  async function handleSelect(key: MoodKey) {
    if (!token || isPending) return;
    const previous = selected;
    const next = selected === key ? null : key;
    setSelected(next);
    onMoodChange?.(next);
    setIsPending(true);
    try {
      if (next) {
        await setTodayMood(token, next);
      } else {
        await deleteTodayMood(token);
      }
    } catch {
      setSelected(previous);
      onMoodChange?.(previous);
    } finally {
      setIsPending(false);
    }
  }

  if (variant === "panel") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-sm font-semibold">• {t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</span>
        <div className="flex items-center gap-0.5 rounded-full border border-current/15 bg-current/5 p-1">
          {MOOD_OPTIONS.map((option) => {
            const active = selected === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSelect(option.key)}
                disabled={isPending}
                aria-label={option.label}
                aria-pressed={active}
                title={option.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-wait ${
                  active ? "bg-[var(--tone-accent)]/20 text-[var(--tone-accent)] ring-1 ring-[var(--tone-accent)]/60" : "opacity-70 hover:opacity-100"
                }`}
              >
                <MoodFaceIcon mood={option.key} size={20} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-zinc-500">
      <span>{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</span>
      <div className="flex items-center gap-0.5">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleSelect(option.key)}
            disabled={isPending}
            aria-label={option.label}
            aria-pressed={selected === option.key}
            title={option.label}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-base transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 disabled:cursor-wait disabled:opacity-60 ${
              selected === option.key
                ? "bg-accent-warm/15 ring-1 ring-accent-warm/40"
                : "hover:bg-[var(--surface-muted)]"
            }`}
          >
            {option.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
