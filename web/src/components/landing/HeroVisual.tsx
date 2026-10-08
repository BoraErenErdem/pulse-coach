"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Flame, UtensilsCrossed } from "lucide-react";
import { useT } from "@/lib/language-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { PulseMark } from "@/components/PulseMark";
import s from "./landing.module.css";
import heroPhone from "../../../public/landing/photos/u-hero-phone.jpg";

// Hero görseli (2026-10-08, diyetkolik'in "fotoğraf + yüzen uygulama kartları" fikri): gerçek bir
// fotoğrafın üstünde uygulamanın kendi parçaları canlı - Beslenme'nin kalori halkası dolar, koçla
// sohbet yazılır, seri noktaları yanar, haftalık hedef günleri işaretlenir. Kartlar HTML (ekran
// görüntüsü değil): her boyutta net, dil değişince çevrilir. Renkler uygulamanın kimlikleri.

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

function CalorieCard() {
  const t = useT();
  const pct = 1284 / 2100;
  const macros = [
    { label: t("Protein", "Protein"), value: "86 / 115 g", pct: 0.75, color: "#ff7a5c" },
    { label: t("Karb.", "Carbs"), value: "142 / 260 g", pct: 0.55, color: "#5ea4ff" },
    { label: t("Yağ", "Fat"), value: "41 / 70 g", pct: 0.59, color: "#b98cff" },
  ];
  return (
    <div className="w-[248px] rounded-[22px] border border-white/40 bg-[linear-gradient(135deg,#76871a,#3e4a0a)] p-4 text-white shadow-[0_24px_50px_-20px_rgba(40,50,0,0.6)]">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
          <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold">{t("Bugün", "Today")}</p>
        <p className="ml-auto text-[11px] text-white/80">{t("3 öğün", "3 meals")}</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true" className="shrink-0 -rotate-90">
          <circle cx="37" cy="37" r={RING_R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" />
          <circle
            className={s.ring}
            cx="37"
            cy="37"
            r={RING_R}
            fill="none"
            stroke="#e9f26b"
            strokeWidth="7"
            strokeLinecap="round"
            style={{ ["--c" as string]: RING_C, ["--off" as string]: RING_C * (1 - pct) }}
          />
        </svg>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tabular-nums">1.284</p>
          <p className="mt-1 text-[11px] text-white/80">/ 2.100 kcal</p>
          <p className="mt-1 text-[11px] font-semibold text-[#e9f26b]">{t("816 kcal kaldı", "816 kcal left")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {macros.map((m, i) => (
          <div key={m.label}>
            <div className="flex justify-between text-[11px]">
              <span className="font-medium">{m.label}</span>
              <span className="tabular-nums text-white/85">{m.value}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className={`${s.bar} h-full rounded-full`} style={{ width: `${m.pct * 100}%`, background: m.color, animationDelay: `${900 + i * 150}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sohbet: kullanıcı yazar -> koç "yazıyor" -> yanıt + kayıt onayı. Hareketi azaltta doğrudan son hal. */
function ChatCard() {
  const t = useT();
  const [animPhase, setPhase] = useState(0);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const phase = reduced ? 3 : animPhase;
  useEffect(() => {
    if (reduced) return;
    const timers = [setTimeout(() => setPhase(1), 900), setTimeout(() => setPhase(2), 1700), setTimeout(() => setPhase(3), 3200)];
    return () => timers.forEach(clearTimeout);
  }, [reduced]);
  return (
    <div className="flex w-[270px] flex-col gap-2 rounded-[22px] border border-[var(--l-line)] bg-[var(--l-card)]/95 p-3 shadow-[0_24px_50px_-22px_var(--l-shadow)] backdrop-blur" aria-hidden="true">
      {phase >= 1 ? (
        <p className={`${s.cardIn} ml-auto max-w-[88%] rounded-[16px] rounded-br-md bg-[#b8481f] px-3 py-2 text-[13px] leading-snug text-white`}>
          {t("Öğlen 150 g tavuk ve 200 g bulgur yedim", "Had 150 g chicken and 200 g bulgur for lunch")}
        </p>
      ) : (
        <div className="h-[52px]" />
      )}
      <div className="flex items-end gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--l-coach-soft)] text-[var(--l-accent)]">
          <PulseMark size={15} />
        </span>
        {phase === 2 ? (
          <span className={`${s.typing} flex gap-1 rounded-[16px] rounded-bl-md bg-[var(--l-coach-soft)] px-3 py-3`}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
          </span>
        ) : phase === 3 ? (
          <div className={`${s.cardIn} rounded-[16px] rounded-bl-md bg-[var(--l-coach-soft)] px-3 py-2 text-[13px] leading-snug`}>
            <p>{t("Kaydettim! Protein hedefine çok yaklaştın 💪", "Logged! You're close to your protein goal 💪")}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--l-nutrition-ink)]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              {t("Öğle yemeği · 476 kcal", "Lunch · 476 kcal")}
            </p>
          </div>
        ) : (
          <div className="h-9" />
        )}
      </div>
    </div>
  );
}

function StreakCard() {
  const t = useT();
  const colors = ["#ffe27a", "#ffc93c", "#ff9f0a", "#ff7a1a", "#ff4e1f"];
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-white/40 bg-[linear-gradient(to_top_right,#ee9a10,#d23a0b)] px-4 py-3 text-white shadow-[0_20px_44px_-18px_rgba(210,58,11,0.6)]">
      <Flame className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-[11px] font-medium text-white/85">{t("Seri", "Streak")}</p>
        <p className="text-lg font-semibold leading-tight">{t("5 gün", "5 days")}</p>
      </div>
      <span className="ml-1 flex gap-1" aria-hidden="true">
        {colors.map((c, i) => (
          <span key={c} className={`${s.dot} h-2.5 w-2.5 rounded-full ring-1 ring-white/90`} style={{ background: c, animationDelay: `${1400 + i * 120}ms` }} />
        ))}
      </span>
    </div>
  );
}

function WeeklyCard() {
  const t = useT();
  const letters = t("P,S,Ç,P,C,C,P", "M,T,W,T,F,S,S").split(",");
  const done = [true, false, true, true, false, false, false];
  return (
    <div className="rounded-[20px] border border-white/40 bg-[linear-gradient(to_top_right,#a8453a,#5c2a22)] px-4 py-3 text-white shadow-[0_20px_44px_-18px_rgba(120,30,20,0.6)]">
      <div className="flex items-baseline justify-between gap-6">
        <p className="text-[11px] font-medium text-white/85">{t("Haftalık hedef", "Weekly goal")}</p>
        <p className="text-sm font-semibold">3/4</p>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {letters.map((l, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${done[i] ? `${s.dot} border-white bg-white text-[#a8453a]` : "border-white/40"}`}
              style={done[i] ? { animationDelay: `${1800 + i * 110}ms` } : undefined}
            >
              {done[i] ? <Check className="h-3 w-3" strokeWidth={3.2} /> : null}
            </span>
            <span className="text-[9px] text-white/80">{l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HeroVisual() {
  const t = useT();
  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[520px] sm:h-[560px]">
      <div className="absolute inset-y-6 left-[12%] right-0 overflow-hidden rounded-[2.6rem] shadow-[0_40px_80px_-40px_var(--l-shadow)] sm:left-[16%]">
        <Image
          src={heroPhone}
          alt={t("Antrenmandan sonra telefonuna bakıp gülümseyen bir kadın", "A woman smiling at her phone after a workout")}
          fill
          loading="eager"
          fetchPriority="high"
          placeholder="blur"
          sizes="(min-width: 1024px) 440px, 88vw"
          className="object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(36,20,10,0.35))]" aria-hidden="true" />
      </div>

      <div className={`${s.cardIn} absolute left-0 top-0 z-10`} style={{ animationDelay: "250ms" }}>
        <div className={s.float}>
          <CalorieCard />
        </div>
      </div>
      {/* Telefonda sohbet kartı fotoğrafın altına iner (yan yana sığmıyor). */}
      <div className={`${s.cardIn} absolute -bottom-28 right-0 z-10 sm:bottom-auto sm:-right-2 sm:top-[44%]`} style={{ animationDelay: "500ms" }}>
        <div className={s.floatSlow}>
          <ChatCard />
        </div>
      </div>
      <div className={`${s.cardIn} absolute bottom-[30%] left-0 z-10 sm:bottom-2 sm:left-[2%]`} style={{ animationDelay: "800ms" }}>
        <div className={s.floatSlow}>
          <StreakCard />
        </div>
      </div>
      <div className={`${s.cardIn} absolute right-4 top-2 z-10 hidden lg:block`} style={{ animationDelay: "1000ms" }}>
        <div className={s.float}>
          <WeeklyCard />
        </div>
      </div>
    </div>
  );
}
