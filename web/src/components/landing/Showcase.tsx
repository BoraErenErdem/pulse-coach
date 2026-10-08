"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Image, { type StaticImageData } from "next/image";
import { Check } from "lucide-react";
import { useLanguage, useT } from "@/lib/language-context";
import { useInView } from "./motion";
import s from "./landing.module.css";
import photoKebab from "../../../public/landing/photos/u-meal-kebab.jpg";
import photoBarbell from "../../../public/landing/photos/u-workout-barbell.jpg";
import photoRunner from "../../../public/landing/photos/hero-runner.jpg";
import photoSunset from "../../../public/landing/photos/u-mood-sunset.jpg";
import screenNutrition from "../../../public/landing/screens/nutrition.webp";
import screenNutritionDark from "../../../public/landing/screens/nutrition-dark.webp";
import screenNutritionEn from "../../../public/landing/screens/nutrition-en.webp";
import screenNutritionDarkEn from "../../../public/landing/screens/nutrition-dark-en.webp";
import screenWorkouts from "../../../public/landing/screens/workouts.webp";
import screenWorkoutsDark from "../../../public/landing/screens/workouts-dark.webp";
import screenWorkoutsEn from "../../../public/landing/screens/workouts-en.webp";
import screenWorkoutsDarkEn from "../../../public/landing/screens/workouts-dark-en.webp";
import screenProgress from "../../../public/landing/screens/progress.webp";
import screenProgressDark from "../../../public/landing/screens/progress-dark.webp";
import screenProgressEn from "../../../public/landing/screens/progress-en.webp";
import screenProgressDarkEn from "../../../public/landing/screens/progress-dark-en.webp";
import screenProfile from "../../../public/landing/screens/profile.webp";
import screenProfileDark from "../../../public/landing/screens/profile-dark.webp";
import screenProfileEn from "../../../public/landing/screens/profile-en.webp";
import screenProfileDarkEn from "../../../public/landing/screens/profile-dark-en.webp";

export type ThemedScreen = { light: StaticImageData; dark: StaticImageData; en: { light: StaticImageData; dark: StaticImageData } };

/** Telefon çerçevesinde uygulama ekranı: temaya ve dile göre (yalnız etkin olan iner, ikisi de lazy). */
export function PhoneFrame({ screen, alt, sizes, className = "" }: { screen: ThemedScreen; alt: string; sizes: string; className?: string }) {
  const { language, isLoading } = useLanguage();
  const set = language === "en" ? screen.en : screen;
  return (
    <div className={`rounded-[2.2rem] bg-[var(--l-frame)] p-[7px] shadow-[0_30px_60px_-24px_var(--l-shadow)] ${className}`}>
      {/* Dil kayıtlı tercihten hidrasyondan sonra okunuyor: o ana kadar yalnız çerçeve (oran korunur). */}
      {isLoading ? (
        <div className="aspect-[780/1691] w-full rounded-[1.8rem] bg-[var(--l-card)]" aria-hidden="true" />
      ) : (
        <>
          <Image src={set.light} alt={alt} loading="lazy" sizes={sizes} className="h-auto w-full rounded-[1.8rem] dark:hidden" />
          <Image src={set.dark} alt={alt} loading="lazy" sizes={sizes} className="hidden h-auto w-full rounded-[1.8rem] dark:block" />
        </>
      )}
    </div>
  );
}

const AUTO_MS = 7000;

export function Showcase() {
  const t = useT();
  const tabs = [
    {
      key: "nutrition",
      color: "var(--l-nutrition)",
      ink: "var(--l-nutrition-ink)",
      label: t("Beslenme", "Nutrition"),
      title: t("Öğünlerin, gram gram.", "Your meals, gram by gram."),
      body: t(
        "Türk mutfağına göre hazırlanmış katalogdan ara, sohbette yaz ya da tabağının fotoğrafını çek. Kalori, protein, karbonhidrat ve yağ günlük hedefinin hemen yanında.",
        "Search a catalog built around Turkish cuisine, type it in the chat or snap a photo of your plate. Calories, protein, carbs and fat sit right next to your daily goal."
      ),
      points: [
        t("7.900'den fazla besin, köfteden mercimek çorbasına", "Over 7,900 foods, from köfte to lentil soup"),
        t("Öğün öğün günlük özet ve 7/14/30 günlük kalori trendi", "Meal-by-meal daily summary and a 7/14/30-day calorie trend"),
        t("Boyuna, yaşına ve hedefine göre kalori önerisi", "A calorie suggestion based on your height, age and goal"),
      ],
      photo: photoKebab,
      photoAlt: t("Izgara köfte, şiş ve salatayla bir tabak", "A plate of grilled köfte, skewers and salad"),
      screen: { light: screenNutrition, dark: screenNutritionDark, en: { light: screenNutritionEn, dark: screenNutritionDarkEn } },
      screenAlt: t("Beslenme ekranı: günlük kalori halkası ve makrolar", "Nutrition screen: daily calorie ring and macros"),
    },
    {
      key: "workouts",
      color: "var(--l-workout)",
      ink: "var(--l-workout)",
      label: t("Antrenman", "Workouts"),
      title: t("Her set, her rekor.", "Every set, every record."),
      body: t(
        "Setlerini tekrar ve ağırlıkla, kardiyonu süreyle kaydet. Haftalık hedefin, toplam hacmin, tür dağılımın ve kişisel rekorların kendiliğinden hesaplanır.",
        "Log sets with reps and weight, cardio with duration. Your weekly goal, total volume, training split and personal records are worked out for you."
      ),
      points: [
        t("890'dan fazla egzersiz ve kardiyo türü", "Over 890 exercises and cardio types"),
        t("Rekor kırınca haber, egzersiz bazında gelişim grafiği", "Record alerts and a progress chart for every exercise"),
        t("Haftada kaç gün çalışacağını sen belirlersin", "You choose how many days a week you train"),
      ],
      photo: photoBarbell,
      photoAlt: t("Spor salonunda yerden halter kaldıran bir sporcu", "An athlete lifting a barbell off the gym floor"),
      screen: { light: screenWorkouts, dark: screenWorkoutsDark, en: { light: screenWorkoutsEn, dark: screenWorkoutsDarkEn } },
      screenAlt: t("Antrenman ekranı: haftalık hedef ve son 7 gün", "Workouts screen: weekly goal and last 7 days"),
    },
    {
      key: "progress",
      color: "var(--l-progress)",
      ink: "var(--l-progress)",
      label: t("İlerleme", "Progress"),
      title: t("Gelişimin, tek bir sayıdan fazlası.", "Progress is more than one number."),
      body: t(
        "Kilonu, bel çevreni ve yağ oranını kaydet; hedef çizgisiyle trendini gör. Koçun antrenman günlerinle ruh halin arasındaki örüntüleri de gösterir.",
        "Log your weight, waist and body fat and see the trend against your goal line. Your coach also shows patterns between your training days and your mood."
      ),
      points: [
        t("Kilo, bel ve yağ oranı hedefleri", "Weight, waist and body fat goals"),
        t("Haftalık içgörü ve aylar arası trend", "Weekly insight and month-over-month trends"),
        t("Seri: ruh halini işaretlediğin her gün sayılır", "Streak: every day you log your mood counts"),
      ],
      photo: photoRunner,
      photoAlt: t("Havada sıçrayarak koşan bir kadın sporcu", "A female athlete mid-stride in the air"),
      screen: { light: screenProgress, dark: screenProgressDark, en: { light: screenProgressEn, dark: screenProgressDarkEn } },
      screenAlt: t("İlerleme ekranı: kilo hedefi ve içgörü", "Progress screen: weight goal and insight"),
    },
    {
      key: "profile",
      color: "var(--l-profile)",
      ink: "var(--l-profile)",
      label: t("Ruh hali ve Profil", "Mood and Profile"),
      title: t("Küçük adımlar sayılır.", "Small steps count."),
      body: t(
        "Gününü bir dokunuşla işaretle, ruh hali takviminde haftalarını gör. Serin, rozetlerin ve tüm hedeflerin tek bakışta profilinde.",
        "Mark your day in one tap and see your weeks on the mood calendar. Your streak, badges and every goal at a glance on your profile."
      ),
      points: [
        t("Ruh hali takvimi ve koçun gözlemi", "Mood calendar and your coach's observation"),
        t("Dokuz rozet ve tüm hedeflerin Hedef Merkezi'nde", "Nine badges, and every goal in the Goal Center"),
        t("Pazar günleri koçundan haftalık değerlendirme", "A weekly review from your coach every Sunday"),
      ],
      photo: photoSunset,
      photoAlt: t("Gün batımında deniz kıyısında yoga yapan bir kadın", "A woman doing yoga by the sea at sunset"),
      screen: { light: screenProfile, dark: screenProfileDark, en: { light: screenProfileEn, dark: screenProfileDarkEn } },
      screenAlt: t("Profil ekranı: seri, haftalık hedef ve rozetler", "Profile screen: streak, weekly goal and badges"),
    },
  ];

  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>("0px");

  useEffect(() => {
    if (!auto || paused || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % tabs.length), AUTO_MS);
    return () => clearTimeout(timer);
  }, [active, auto, paused, inView, tabs.length]);

  function choose(i: number) {
    setActive(i);
    setAuto(false);
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    choose(next);
    document.getElementById(`ritim-tab-${next}`)?.focus();
  }

  const tab = tabs[active];
  return (
    <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div role="tablist" aria-label={t("Uygulamanın alanları", "Areas of the app")} onKeyDown={onKey} className="flex flex-wrap gap-2">
        {tabs.map((item, i) => {
          const on = i === active;
          return (
            <button
              key={item.key}
              id={`ritim-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="ritim-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => choose(i)}
              className={`relative flex min-h-11 items-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-semibold transition-colors ${
                on ? "text-[var(--l-ink)]" : "border-[var(--l-line)] text-[var(--l-muted)] hover:text-[var(--l-ink)]"
              }`}
              style={on ? { borderColor: item.color, background: `color-mix(in srgb, ${item.color} 14%, transparent)` } : undefined}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden="true" />
              {item.label}
              {on && auto ? (
                <span
                  key={`${active}-${paused}`}
                  className={`${s.progressBar} absolute inset-x-0 bottom-0 h-[3px]`}
                  style={{ background: item.color, ["--dur" as string]: `${AUTO_MS}ms`, animationPlayState: paused || !inView ? "paused" : "running" }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div id="ritim-panel" role="tabpanel" aria-labelledby={`ritim-tab-${active}`} className="mt-10 grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div key={`text-${tab.key}`} className={s.swapIn}>
          <h3 className={`${s.display} text-[clamp(2rem,4vw,3.2rem)]`}>{tab.title}</h3>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--l-muted)]">{tab.body}</p>
          <ul className="mt-7 flex flex-col gap-3.5">
            {tab.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-base">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${tab.color} 18%, transparent)`, color: tab.ink }}
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto h-[460px] w-full max-w-[520px] sm:h-[540px]">
          {/* hapday'deki gibi ekranın arkasında renk bloğu - burada sekmenin kimlik renginde */}
          <div
            className="absolute inset-x-0 bottom-0 top-10 rounded-[2.6rem] transition-[background] duration-700"
            style={{ background: `radial-gradient(120% 90% at 70% 20%, color-mix(in srgb, ${tab.color} 38%, transparent), color-mix(in srgb, ${tab.color} 10%, transparent) 72%)` }}
            aria-hidden="true"
          />
          <div key={`photo-${tab.key}`} className={`${s.swapIn} absolute left-0 top-0 w-[58%] overflow-hidden rounded-[2rem] border-4 border-[var(--l-bg)] shadow-[0_30px_60px_-28px_var(--l-shadow)]`}>
            <div className="relative aspect-[4/5]">
              <Image src={tab.photo} alt={tab.photoAlt} fill sizes="(min-width: 1024px) 300px, 58vw" className="object-cover" />
            </div>
          </div>
          <div key={`phone-${tab.key}`} className={`${s.swapIn} absolute bottom-4 right-3 w-[46%] sm:right-6`} style={{ animationDelay: "120ms" }}>
            <PhoneFrame screen={tab.screen} alt={tab.screenAlt} sizes="(min-width: 1024px) 240px, 46vw" />
          </div>
        </div>
      </div>
    </div>
  );
}
