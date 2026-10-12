"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Dumbbell, TrendingUp, Trophy } from "lucide-react";
import type { MoodKey } from "@/lib/api";
import { useT } from "@/lib/language-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { MoodFaceIcon } from "@/components/MoodFaceIcon";
import { PulseMark } from "@/components/PulseMark";
import { CountUp, useInView } from "./motion";
import s from "./landing.module.css";
import workoutPlates from "../../../public/landing/photos/u-workout-plates.jpg";
import moodCalm from "../../../public/landing/photos/u-mood-calm.jpg";

// Antrenman ve Ruh hali bölümlerinin görselleri (2026-10-12): hero'daki gibi gerçek bir fotoğrafın
// üstünde uygulamanın kendi parçaları canlı. Kartlar HTML; görünür alana girince adım adım oynar
// (landing.module.css `.step` / `.tagIn` / `.barUp`, hepsi "hareketi azalt" tercihine uyar).
// Renkler uygulamadaki sekme kimlikleri (Antrenman kırmızı, Ruh hali camgöbeği).

const SETS = [
  { kg: 60, reps: 10 },
  { kg: 65, reps: 8 },
  { kg: 70, reps: 6 },
];
// 60x10 + 65x8 + 70x6
const SET_VOLUME = SETS.reduce((sum, set) => sum + set.kg * set.reps, 0);
// Son 6 haftanın toplam hacmi (kg) - örnek; son sütun bu hafta.
const WEEKLY_VOLUME = [3120, 3480, 3300, 3940, 4210, 4820];

/** Antrenman: setler sırayla yazılır, üçüncü sette rekor rozeti, altta hacim sütunları yükselir. */
export function WorkoutVisual() {
  const t = useT();
  const { ref, inView } = useInView<HTMLDivElement>();
  const peak = Math.max(...WEEKLY_VOLUME);
  const step = (ms: number) => ({ transitionDelay: `${ms}ms` });
  return (
    <div ref={ref} data-in={inView ? "" : undefined} className="relative mx-auto h-[520px] w-full max-w-[540px] sm:h-[540px]">
      <div className="absolute right-0 top-0 w-[64%] overflow-hidden rounded-[2.2rem] shadow-[0_40px_80px_-40px_var(--l-shadow)]">
        <div className="relative aspect-[4/5]">
          <Image
            src={workoutPlates}
            alt={t("Spor salonunda halter çubuğuna ağırlık takan bir kadın sporcu", "A female athlete loading plates onto a barbell in a gym")}
            fill
            sizes="(min-width: 1024px) 350px, 64vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(200deg,transparent_50%,rgba(60,14,10,0.45))]" aria-hidden="true" />
        </div>
        <span
          className={`${s.tagIn} absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold text-[#241d14] shadow-lg backdrop-blur`}
          style={step(2300)}
        >
          <Trophy className="h-3.5 w-3.5 text-[#d9251c]" aria-hidden="true" />
          {t("Yeni kişisel rekor", "New personal record")}
        </span>
      </div>

      <div className="absolute left-0 top-[24%] z-10 w-[232px] sm:top-[26%] sm:w-[256px]">
        <div className={s.float}>
          <div className="rounded-[22px] border border-white/30 bg-[linear-gradient(to_top_right,#a8453a,#5c2a22)] p-4 text-white shadow-[0_24px_50px_-20px_rgba(120,30,20,0.65)]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold">Bench Press</p>
              <p className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">{t("Kuvvet", "Strength")}</p>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {SETS.map((set, i) => (
                <li
                  key={set.kg}
                  className={`${s.step} flex items-center gap-2 whitespace-nowrap rounded-xl bg-white/12 px-3 py-2 text-[13px]`}
                  style={step(350 + i * 550)}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#a8453a]">{i + 1}</span>
                  <span className="font-semibold tabular-nums">{set.kg} kg</span>
                  <span className="text-white/75">×</span>
                  <span className="tabular-nums">
                    {set.reps} {t("tekrar", "reps")}
                  </span>
                  {i === SETS.length - 1 ? (
                    <span className={`${s.tagIn} ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ffd76a] text-[#5c2a22]`} style={step(2100)}>
                      <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("Rekor", "Personal record")}</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className={`${s.step} mt-3 flex items-baseline justify-between text-[11px] text-white/85`} style={step(2000)}>
              <span>{t("Bu egzersizin hacmi", "Volume for this exercise")}</span>
              <span className="text-sm font-semibold tabular-nums text-white">
                {SET_VOLUME.toLocaleString(t("tr-TR", "en-US"))} kg
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 right-[4%] z-10 w-[216px] sm:w-[236px]">
        <div className={s.floatSlow}>
          <div className="rounded-[20px] border border-[var(--l-line)] bg-[var(--l-card)]/95 p-4 shadow-[0_24px_50px_-22px_var(--l-shadow)] backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--l-muted)]">{t("Haftalık hacim", "Weekly volume")}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--l-workout-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--l-workout)]">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                +14%
              </span>
            </div>
            <p className="mt-1 text-xl font-semibold leading-none tabular-nums">
              <CountUp to={WEEKLY_VOLUME[WEEKLY_VOLUME.length - 1]} format={(n) => `${Math.round(n).toLocaleString(t("tr-TR", "en-US"))} kg`} />
            </p>
            <div className="mt-3 flex h-14 items-end gap-1.5" aria-hidden="true">
              {WEEKLY_VOLUME.map((value, i) => (
                <span
                  key={i}
                  className={`${s.barUp} flex-1 rounded-t-md`}
                  style={{
                    height: `${(value / peak) * 100}%`,
                    background: i === WEEKLY_VOLUME.length - 1 ? "var(--l-workout)" : "color-mix(in srgb, var(--l-workout) 32%, transparent)",
                    transitionDelay: `${500 + i * 110}ms`,
                  }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--l-muted)]">{t("Son 6 hafta", "Last 6 weeks")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOOD_ORDER: MoodKey[] = ["zor", "dusuk", "notr", "iyi", "harika"];
// Uygulamadaki takvim gibi tek renk, seviyeye göre koyulaşır (mood/page.tsx TINT_STEP).
const MOOD_ALPHA: Record<MoodKey, number> = { zor: 0.2, dusuk: 0.38, notr: 0.56, iyi: 0.8, harika: 1 };
// Dört haftalık örnek takvim; son gün bugün (aşağıda işaretlenen "İyi").
const CALENDAR: MoodKey[] = [
  "notr", "iyi", "dusuk", "iyi", "harika", "iyi", "notr",
  "iyi", "notr", "iyi", "harika", "iyi", "zor", "notr",
  "iyi", "harika", "iyi", "notr", "iyi", "harika", "iyi",
  "dusuk", "iyi", "harika", "iyi", "notr", "harika", "iyi",
];

/** Ruh hali: yüz seçilir, takvim gün gün dolar, koçun gözlemi belirir. */
export function MoodVisual() {
  const t = useT();
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [pickedByTimer, setPicked] = useState(false);
  const picked = pickedByTimer || (reduced && inView);
  useEffect(() => {
    if (!inView || reduced) return;
    const timer = setTimeout(() => setPicked(true), 1100);
    return () => clearTimeout(timer);
  }, [inView, reduced]);
  const labels: Record<MoodKey, string> = {
    zor: t("Zor", "Tough"),
    dusuk: t("Düşük", "Low"),
    notr: t("Nötr", "Neutral"),
    iyi: t("İyi", "Good"),
    harika: t("Harika", "Great"),
  };
  const step = (ms: number) => ({ transitionDelay: `${ms}ms` });
  return (
    <div ref={ref} data-in={inView ? "" : undefined} className="relative mx-auto h-[520px] w-full max-w-[540px] sm:h-[560px]">
      <div className="absolute left-0 top-0 w-[64%] overflow-hidden rounded-[2.2rem] shadow-[0_40px_80px_-40px_var(--l-shadow)]">
        <div className="relative aspect-[4/5]">
          <Image
            src={moodCalm}
            alt={t("Dağ manzarası önünde gözleri kapalı gülümseyen bir kadın", "A woman smiling with her eyes closed in front of a mountain")}
            fill
            sizes="(min-width: 1024px) 350px, 64vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(160deg,transparent_55%,rgba(6,40,48,0.4))]" aria-hidden="true" />
        </div>
      </div>

      <div className="absolute right-0 top-[8%] z-10 w-[240px] sm:w-[268px]" aria-hidden="true">
        <div className={s.float}>
          <div className="rounded-[22px] border border-white/30 bg-[linear-gradient(to_top_right,#1a7a88,#0b4650)] p-4 text-white shadow-[0_24px_50px_-20px_rgba(6,60,70,0.7)]">
            <p className="text-sm font-semibold">{t("Bugün nasıl hissediyorsun?", "How are you feeling today?")}</p>
            <div className="mt-3 flex justify-between">
              {MOOD_ORDER.map((mood) => {
                const on = picked && mood === "iyi";
                return (
                  <span key={mood} className="flex flex-col items-center gap-1">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-[background,color,transform] duration-300 ${
                        on ? "scale-110 bg-white text-[#0b4650] shadow-[0_0_0_4px_rgba(255,255,255,0.22)]" : "bg-white/14 text-white"
                      }`}
                    >
                      <MoodFaceIcon mood={mood} size={22} />
                    </span>
                    <span className={`text-[10px] ${on ? "font-bold" : "text-white/75"}`}>{labels[mood]}</span>
                  </span>
                );
              })}
            </div>
            <p
              className={`mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#9fefff] transition-opacity duration-500 ${picked ? "opacity-100" : "opacity-0"}`}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              {t("Kaydedildi · serin 6 gün", "Saved · 6-day streak")}
            </p>
          </div>
        </div>
      </div>

      <div className={`${s.step} absolute right-0 top-[46%] z-10 flex w-[236px] items-start gap-2 sm:w-[262px]`} style={step(1900)}>
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--l-coach-soft)] text-[var(--l-accent)] shadow-md">
          <PulseMark size={17} />
        </span>
        <div className="rounded-[18px] rounded-tl-md border border-[var(--l-line)] bg-[var(--l-card)]/95 px-3.5 py-3 shadow-[0_24px_50px_-22px_var(--l-shadow)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--l-mood)]">{t("Ruh hali gözlemi", "Mood observation")}</p>
          <p className="mt-1 text-[13px] leading-snug">
            {t(
              "Antrenman yaptığın günlerde kendini daha iyi hissetmişsin.",
              "You've felt better on the days you trained."
            )}
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 left-[3%] z-10">
        <div className={s.floatSlow}>
          <div className="rounded-[20px] border border-[var(--l-line)] bg-[var(--l-card)]/95 p-4 shadow-[0_24px_50px_-22px_var(--l-shadow)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--l-muted)]">{t("Ruh hali takvimi", "Mood calendar")}</p>
            <div className="mt-2.5 grid grid-cols-7 gap-1.5" aria-hidden="true">
              {CALENDAR.map((mood, i) => {
                const isToday = i === CALENDAR.length - 1;
                return (
                  <span
                    key={i}
                    className={`${s.tagIn} h-4 w-4 rounded-[5px] ${isToday ? "ring-2 ring-[var(--l-mood)] ring-offset-2 ring-offset-[var(--l-card)]" : ""}`}
                    style={{
                      background: `color-mix(in srgb, var(--l-mood) ${Math.round(MOOD_ALPHA[mood] * 100)}%, transparent)`,
                      transitionDelay: `${isToday ? 1300 : 300 + i * 28}ms`,
                    }}
                  />
                );
              })}
            </div>
            <p className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-[var(--l-muted)]">
              <span>{t("Son 4 hafta", "Last 4 weeks")}</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                {MOOD_ORDER.map((mood) => (
                  <span key={mood} className="h-2 w-2 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--l-mood) ${Math.round(MOOD_ALPHA[mood] * 100)}%, transparent)` }} />
                ))}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
