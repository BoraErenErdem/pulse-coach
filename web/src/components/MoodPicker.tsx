"use client";

import { useEffect, useState } from "react";

const MOOD_OPTIONS = [
  { key: "zor", emoji: "😔", label: "Zor" },
  { key: "dusuk", emoji: "😕", label: "Düşük" },
  { key: "notr", emoji: "🙂", label: "Nötr" },
  { key: "iyi", emoji: "😊", label: "İyi" },
  { key: "harika", emoji: "🤩", label: "Harika" },
] as const;

const STORAGE_PREFIX = "pulsecoach_mood_";

function todayKey(): string {
  return `${STORAGE_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/** Ruh Hali Destek Agent için görsel bir günlük mod göstergesi — şimdilik
 * sadece UI taslağı, localStorage'da günlük olarak tutulur ve backend'e hiç
 * gönderilmez (agent'a bağlam olarak iletilmesi ayrı bir teknik tasarım
 * gerektiriyor, bilinçli olarak kapsam dışı bırakıldı). */
export function MoodPicker() {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    function restoreTodayMood() {
      setSelected(localStorage.getItem(todayKey()));
    }
    restoreTodayMood();
  }, []);

  function handleSelect(key: string) {
    const next = selected === key ? null : key;
    setSelected(next);
    if (next) {
      localStorage.setItem(todayKey(), next);
    } else {
      localStorage.removeItem(todayKey());
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-zinc-500">
      <span>Bugün nasıl hissediyorsun?</span>
      <div className="flex items-center gap-0.5">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleSelect(option.key)}
            aria-label={option.label}
            aria-pressed={selected === option.key}
            title={option.label}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-base transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-110 ${
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
