"use client";

import { useEffect, useState } from "react";
import { deleteTodayMood, getTodayMood, setTodayMood, type MoodKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";

/** Ruh Hali Destek Agent için günlük mod göstergesi. Seçim `mood_logs`
 * tablosunda kalıcı olarak tutulur (bkz. `mood_service.py`) ve
 * orchestrator'ın system prompt'una SADECE ton ayarlamak için bağlam olarak
 * eklenir — kriz tespiti bundan hiç etkilenmez (ayrı, ham mesaja dayalı
 * deterministik bir katman). */
export function MoodPicker({ onMoodChange }: { onMoodChange?: (mood: MoodKey | null) => void }) {
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
