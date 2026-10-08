"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Camera,
  CalendarCheck,
  CalendarHeart,
  Check,
  Footprints,
  Languages,
  Lock,
  MessageCircle,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { PulseMark } from "@/components/PulseMark";
import { outfit } from "./fonts";
import s from "./landing.module.css";
import { REGISTER_HREF, SiteFooter, SiteHeader } from "./SiteChrome";
import { HeroVisual } from "./HeroVisual";
import { PhoneFrame, Showcase } from "./Showcase";
import { CountUp, Reveal, useInView } from "./motion";
import jumpBw from "../../../public/landing/photos/jump-bw.png";
import coachLowEnergy from "../../../public/landing/photos/coach-low-energy.png";
import coachAfterWorkout from "../../../public/landing/photos/coach-after-workout.png";
import coachNutrition from "../../../public/landing/photos/coach-nutrition.png";
import mealBuddha from "../../../public/landing/photos/u-meal-buddha.jpg";
import screenPhoto from "../../../public/landing/screens/photo.webp";
import screenPhotoDark from "../../../public/landing/screens/photo-dark.webp";
import screenPhotoEn from "../../../public/landing/screens/photo-en.webp";
import screenPhotoDarkEn from "../../../public/landing/screens/photo-dark-en.webp";

// Tanıtım sayfası (2026-10-08 yeniden tasarım). Referanslar: diyetkolik (fotoğraf + yüzen uygulama
// kartları, fotoğraf analizi görseli), hapday (ferahlık, ekran arkasında renk bloğu, vurgulu
// başlık), ağırsağlam (güçlü koyu rakam bandı). Dil ve renkler uygulamanın kendisinden: zemin
// uygulamanın kremi/antrasiti, her "ritim" kendi sekme renginde. Fotoğraflar Unsplash Lisansı
// (public/landing/photos/KAYNAKLAR.txt) ve izinli tasarım fotoğrafları. Form, analitik ve üçüncü
// taraf istek YOK (KVKK aydınlatmasına yeni bir şey eklemez).

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--l-cta)] px-6 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(184,72,31,0.7)] transition-[background,transform] hover:-translate-y-0.5 hover:bg-[var(--l-cta-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--l-cta)]"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/** Hero'nun imzası: logodaki nabız, açılışta bir kez çizilir; sonra üzerinden bir "atım" ışığı akar. */
function PulseLine() {
  const d = "M0 128 H520 l18 -12 l14 24 l22 -96 l24 112 l18 -44 l14 16 H880 l12 -8 l10 16 l14 -44 l14 58 l10 -22 H1440";
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-[var(--l-accent)]" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true">
      <path className={s.pulsePath} pathLength={1} d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.55} />
      <path className={s.pulseGlow} pathLength={1} d={d} fill="none" stroke="#ffb27a" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Bölüm üst etiketi: kimlik renginde nokta + kısa ad. */
function Eyebrow({ color = "var(--l-accent)", children }: { color?: string; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-[var(--l-line)] bg-[var(--l-card)]/70 px-3 py-1 text-[13px] font-semibold text-[var(--l-muted)]">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {children}
    </p>
  );
}

/** "Konuşur gibi kaydet": görününce adım adım oynar - mesaj, koç yazıyor, kayıtlar, yanıt.
 * Rakamlar katalogdan (tavuk göğsü ızgara 165 kcal/100 g, bulgur pilavı 114 kcal/100 g); 2026-10-07
 * canlı testte aynı mesaj iki öğle kalemi + 30 dk yürüyüş (~208 kcal) olarak kaydedildi. */
function ChatDemo() {
  const t = useT();
  const { ref, inView } = useInView<HTMLElement>();
  const items = [
    { name: t("Tavuk göğsü, ızgara", "Chicken breast, grilled"), grams: 150, kcal: 248 },
    { name: t("Bulgur pilavı", "Bulgur pilaf"), grams: 200, kcal: 228 },
  ];
  const macros = [
    { label: t("Protein", "Protein"), value: 52, color: "#e2553a" },
    { label: t("Karb.", "Carbs"), value: 36, color: "#3f82da" },
    { label: t("Yağ", "Fat"), value: 12, color: "#8b5cf6" },
  ];
  const step = (ms: number) => ({ transitionDelay: `${ms}ms` });
  return (
    <figure ref={ref} data-in={inView ? "" : undefined} className="rounded-[2rem] border border-[var(--l-line)] bg-[var(--l-bg)] p-4 shadow-[0_40px_80px_-40px_var(--l-shadow)] sm:p-6">
      <figcaption className="sr-only">{t("Örnek sohbet ve oluşan kayıtlar", "Sample chat and the logs it creates")}</figcaption>
      <p className={`${s.step} ml-auto max-w-[85%] rounded-[1.4rem] rounded-br-md bg-[#b8481f] px-4 py-3 text-[15px] leading-relaxed text-white`} style={step(100)}>
        {t(
          "Bugün öğlen 150 g ızgara tavuk ve 200 g bulgur pilavı yedim, akşam 30 dakika tempolu yürüdüm.",
          "Today I had 150 g grilled chicken and 200 g bulgur pilaf for lunch, and walked briskly for 30 minutes this evening."
        )}
      </p>
      <div className={`${s.typingStep} mt-4 flex items-center gap-2.5`} style={{ ["--d" as string]: "600ms" }} aria-hidden="true">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--l-coach-soft)] text-[var(--l-accent)]">
          <PulseMark size={18} />
        </span>
        <span className={`${s.typing} flex gap-1 rounded-[1.2rem] bg-[var(--l-coach-soft)] px-4 py-3.5`}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-ink)]" />
        </span>
      </div>

      <div className="mt-5 rounded-[1.4rem] border border-dashed border-[var(--l-line)] bg-[var(--l-card)] p-4">
        <p className={`${s.step} text-xs font-semibold uppercase tracking-wide text-[var(--l-muted)]`} style={step(1900)}>
          {t("Kayıtlarına eklendi", "Added to your logs")}
        </p>
        <div className={`${s.step} mt-3 flex items-start gap-3`} style={step(2050)}>
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--l-nutrition-soft)] text-[var(--l-nutrition-ink)]">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{t("Öğle yemeği", "Lunch")}</span>
              <span className="whitespace-nowrap font-semibold tabular-nums">476 kcal</span>
            </div>
            <ul className="mt-1 text-sm text-[var(--l-muted)]">
              {items.map((item) => (
                <li key={item.name} className="flex justify-between gap-2">
                  <span>
                    {item.name} · {item.grams} g
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{item.kcal} kcal</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {macros.map((macro) => (
                <span key={macro.label} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--l-bg)] px-2.5 py-0.5 text-xs font-medium tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: macro.color }} aria-hidden="true" />
                  {macro.label} {macro.value} g
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={`${s.step} mt-4 flex items-start gap-3 border-t border-[var(--l-line)] pt-4`} style={step(2300)}>
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--l-workout-soft)] text-[var(--l-workout)]">
            <Footprints className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{t("Yürüyüş", "Walking")}</span>
              <span className="whitespace-nowrap font-semibold tabular-nums">~208 kcal</span>
            </div>
            <p className="mt-1 text-sm text-[var(--l-muted)]">{t("Kardiyo · 30 dk · yakılan kalori kilona göre", "Cardio · 30 min · calories burned based on your weight")}</p>
          </div>
        </div>
      </div>

      <div className={`${s.step} mt-5 flex items-start gap-2.5`} style={step(2700)}>
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--l-coach-soft)] text-[var(--l-accent)]">
          <PulseMark size={18} />
        </span>
        <p className="max-w-[88%] rounded-[1.4rem] rounded-tl-md bg-[var(--l-coach-soft)] px-4 py-3 text-[15px] leading-relaxed">
          {t(
            "Harika bir gün geçirmişsin! Öğle yemeğin ve akşam tempolu yürüyüşün kaydedildi. Son 7 günde antrenman sıklığın yüksek kalmış, böyle devam.",
            "That sounds like a well-rounded day! Your lunch and your brisk evening walk are logged. Your training frequency stayed high this week, keep it up."
          )}
        </p>
      </div>
    </figure>
  );
}

/** "Tabağını çek": fotoğrafın üstünden tarama çizgisi geçer, tanınan besin etiketleri belirir. Değerler
 * yaklaşık ve ÖRNEK olarak işaretli; gerçek analiz ekranı yanındaki telefonda (uygulamadan). */
function PhotoScan() {
  const t = useT();
  const { ref, inView } = useInView<HTMLDivElement>();
  const tags = [
    { label: t("Domates", "Tomato"), value: "≈60 g", pos: "left-[30%] top-[20%]", delay: 300 },
    { label: t("Nohut", "Chickpeas"), value: "≈80 g", pos: "left-[40%] top-[44%]", delay: 650 },
    { label: t("Turp", "Radish"), value: "≈30 g", pos: "left-[4%] top-[56%]", delay: 1000 },
    { label: t("Avokado", "Avocado"), value: "≈60 g", pos: "left-[26%] top-[74%]", delay: 1350 },
  ];
  return (
    <div ref={ref} data-in={inView ? "" : undefined} className="relative mx-auto h-[460px] w-full max-w-[540px] sm:h-[520px]">
      <div className="absolute left-0 top-0 w-[78%] overflow-hidden rounded-[2.2rem] shadow-[0_40px_80px_-40px_var(--l-shadow)]">
        <div className="relative aspect-[4/3.6]">
          <Image src={mealBuddha} alt={t("Nohut, avokado, tatlı patates ve sebzelerle dolu bir kase", "A bowl of chickpeas, avocado, sweet potato and vegetables")} fill sizes="(min-width: 1024px) 420px, 78vw" className="object-cover" />
          <div className={`${s.scan} absolute inset-x-0 h-[3px] bg-[linear-gradient(90deg,transparent,#ffb27a,transparent)] shadow-[0_0_18px_4px_rgba(255,138,61,0.55)]`} aria-hidden="true" />
          {tags.map((tag) => (
            <span
              key={tag.label}
              className={`${s.tagIn} absolute ${tag.pos} inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-xs font-semibold text-[#241d14] shadow-lg backdrop-blur`}
              style={{ transitionDelay: `${tag.delay}ms` }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#8c990f]" aria-hidden="true" />
              {tag.label} <span className="font-medium text-[#5f5340]">{tag.value}</span>
            </span>
          ))}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#241d14]/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Fotoğraf analizi · örnek", "Photo analysis · example")}
          </span>
        </div>
      </div>
      <div className={`${s.tagIn} absolute bottom-[18%] left-[4%] rounded-[1.4rem] bg-[linear-gradient(135deg,#76871a,#3e4a0a)] px-4 py-3 text-white shadow-[0_24px_50px_-20px_rgba(40,50,0,0.7)]`} style={{ transitionDelay: "1700ms" }}>
        <p className="text-[11px] font-medium text-white/85">{t("Tahmini toplam", "Estimated total")}</p>
        <p className={`${s.display} text-3xl`}>≈340 kcal</p>
      </div>
      <PhoneFrame
        screen={{ light: screenPhoto, dark: screenPhotoDark, en: { light: screenPhotoEn, dark: screenPhotoDarkEn } }}
        alt={t(
          "Fotoğraf analizi ekranı: tanınan besinler, gram tahmini, kalori ve makrolar, kaydetmeden önce düzenleme",
          "Photo analysis screen: recognized foods, estimated grams, calories and macros, editable before saving"
        )}
        sizes="(min-width: 1024px) 220px, 42vw"
        className="absolute bottom-0 right-0 w-[42%]"
      />
    </div>
  );
}

type Capability = { icon: LucideIcon; title: string; body: string; color: string };

export function Landing() {
  const t = useT();
  const { token } = useAuth();
  const startHref = token ? "/chat" : REGISTER_HREF;
  const startLabel = token ? t("Uygulamaya git", "Go to the app") : t("Web'de ücretsiz başla", "Start free on the web");

  const coachMessages = [
    {
      photo: coachLowEnergy,
      color: "var(--l-mood)",
      situation: t("Düşük enerjili bir gün", "A low-energy day"),
      message: t(
        "Bugün yüksek tempo şart değil. Kısa bir yürüyüş bile ritmini korumana yardımcı olabilir.",
        "No need for high intensity today. Even a short walk can help you keep your rhythm."
      ),
    },
    {
      photo: coachAfterWorkout,
      color: "var(--l-workout)",
      situation: t("Antrenmandan sonra", "After a workout"),
      message: t(
        "Harika iş çıkardın. Bugünkü eforun kaydedildi. İstersen şimdi nasıl hissettiğini de ekleyebiliriz.",
        "Great work. Today's effort is logged. If you like, we can add how you're feeling now."
      ),
    },
    {
      photo: coachNutrition,
      color: "var(--l-nutrition)",
      situation: t("Öğleden sonra beslenme", "Afternoon nutrition"),
      message: t(
        "Bugün protein hedefin biraz geride görünüyor. İstersen kalan öğünlerin için birlikte pratik bir plan çıkaralım.",
        "Your protein goal looks a little behind today. We can put together a simple plan for your remaining meals."
      ),
    },
  ];

  // Sayılar katalogdan (2026-10-07: 7.916 besin, 891 egzersiz) - aşağı yuvarlanmış.
  const stats = [
    { to: 7900, suffix: "+", label: t("besin, Türk mutfağı dahil", "foods, Turkish cuisine included") },
    { to: 890, suffix: "+", label: t("egzersiz ve kardiyo türü", "exercises and cardio types") },
    { to: 9, suffix: "", label: t("rozet, seriden rekora", "badges, from streaks to records") },
    { to: 0, suffix: " TL", label: t("ücret, reklam yok", "to use, no ads"), free: true },
  ];

  const capabilities: Capability[] = [
    { icon: MessageCircle, color: "var(--l-accent)", title: t("Sohbetle kayıt", "Log by chatting"), body: t("Ne yediğini, ne yaptığını yaz; koçun öğüne ve antrenmana çevirir.", "Write what you ate or did; your coach turns it into meals and workouts.") },
    { icon: Camera, color: "var(--l-nutrition)", title: t("Fotoğrafla öğün", "Meals from a photo"), body: t("Tabağını çek, tahmini kontrol et, düzenleyip kaydet.", "Snap your plate, check the estimate, edit and save.") },
    { icon: Trophy, color: "var(--l-workout)", title: t("Kişisel rekorlar", "Personal records"), body: t("Her egzersizde en iyi setin ve gelişim grafiğin.", "Your best set and progress chart for every exercise.") },
    { icon: Target, color: "var(--l-goal)", title: t("Hedef Merkezi", "Goal Center"), body: t("Kalori ve makrolar, kilo, bel, yağ oranı, haftalık antrenman günü.", "Calories and macros, weight, waist, body fat, weekly training days.") },
    { icon: CalendarHeart, color: "var(--l-mood)", title: t("Ruh hali takvimi", "Mood calendar"), body: t("Günü bir dokunuşla işaretle; antrenmanla ilişkisini gör.", "Mark your day in one tap; see how it relates to training.") },
    { icon: CalendarCheck, color: "var(--l-progress)", title: t("Pazar değerlendirmesi", "Sunday review"), body: t("Koçun her pazar haftanı özetler ve bir sonraki adımı önerir.", "Every Sunday your coach sums up your week and suggests a next step.") },
    { icon: BellRing, color: "var(--l-profile)", title: t("Nazik hatırlatma", "Gentle reminders"), body: t("Yalnız gerektiğinde, seçtiğin saatte. İstersen kapat.", "Only when needed, at the hour you choose. Turn it off anytime.") },
    { icon: Languages, color: "var(--l-accent)", title: t("Türkçe ve İngilizce", "Turkish and English"), body: t("Arayüz de koçun da iki dilde; açık ve koyu tema.", "Both the app and your coach speak both; light and dark theme.") },
  ];

  const marquee = [
    { label: t("Sohbetle kayıt", "Log by chatting"), color: "var(--l-accent)" },
    { label: t("Fotoğrafla öğün", "Meals from a photo"), color: "var(--l-nutrition)" },
    { label: t("Kişisel rekorlar", "Personal records"), color: "var(--l-workout)" },
    { label: t("Kalori ve makro hedefleri", "Calorie and macro goals"), color: "var(--l-nutrition)" },
    { label: t("Kilo, bel, yağ oranı", "Weight, waist, body fat"), color: "var(--l-progress)" },
    { label: t("Ruh hali takvimi", "Mood calendar"), color: "var(--l-mood)" },
    { label: t("Seri ve rozetler", "Streaks and badges"), color: "var(--l-profile)" },
    { label: t("Pazar değerlendirmesi", "Sunday review"), color: "var(--l-progress)" },
    { label: t("Türkçe ve İngilizce", "Turkish and English"), color: "var(--l-accent)" },
  ];

  const photoSteps = [
    { title: t("Fotoğrafı çek ya da yükle", "Take or upload a photo"), body: t("Kameradan ya da galeriden; öğünü (kahvaltı, öğle...) sen seçersin.", "From the camera or your gallery; you pick the meal (breakfast, lunch...).") },
    { title: t("Koçun besinleri tanır", "Your coach recognizes the foods"), body: t("Her besini katalogla eşleştirir, gramını tahmin eder, kalori ve makroları gösterir.", "It matches each food to the catalog, estimates the grams and shows calories and macros.") },
    { title: t("Kontrol et, düzelt, kaydet", "Check, adjust, save"), body: t("Gramı değiştir, besini başkasıyla değiştir ya da vazgeç; son söz senin.", "Change the grams, swap a food or skip it; you have the final say.") },
  ];

  const steps = [
    { title: t("Hesabını aç", "Create your account"), body: t("E-postanla, Google ya da Apple hesabınla bir dakikada.", "With email, Google or Apple, in a minute.") },
    { title: t("Gününü anlat", "Tell it about your day"), body: t("Sohbete yaz, formdan ekle ya da tabağının fotoğrafını yükle.", "Write in the chat, use the forms or upload a photo of your plate.") },
    { title: t("Ritmini gör", "See your rhythm"), body: t("Grafikler, içgörüler ve koçunun haftalık değerlendirmesi.", "Charts, insights and your coach's weekly review.") },
  ];

  const privacy = [
    { icon: ShieldCheck, text: t("Verilerin Türkiye'deki sunucularda saklanır.", "Your data is stored on servers in Turkey.") },
    { icon: Lock, text: t("Reklam yok. Verilerin satılmaz ve yapay zekâ eğitiminde kullanılmaz.", "No ads. Your data is never sold or used to train AI.") },
    { icon: Check, text: t("Tüm verini tek tıkla indir, hesabını istediğin an kalıcı olarak sil.", "Download all your data in one click, delete your account whenever you want.") },
    { icon: BellRing, text: t("Bildirimler telefonunda zamanlanır; sağlık verin bildirim sunucularına gitmez.", "Notifications are scheduled on your phone; your health data never goes to a notification server.") },
  ];

  const faqs = [
    { q: t("PulseCoach ücretli mi?", "Does PulseCoach cost anything?"), a: t("Hayır, şu an ücretsiz. Yapay zekâ koçu adil kullanım için günlük bir mesaj sınırıyla çalışır.", "No, it's free right now. The AI coach has a daily message limit for fair use.") },
    { q: t("Hangi cihazlarda kullanabilirim?", "Which devices can I use?"), a: t("Bugün web tarayıcısında, telefonda da bilgisayarda da. iPhone uygulaması App Store'a yakında geliyor; hesabın ikisinde de aynı.", "Today in your web browser, on phone or computer. The iPhone app is coming to the App Store soon; your account is the same on both.") },
    { q: t("Koçum tıbbi tavsiye verir mi?", "Does my coach give medical advice?"), a: t("Hayır. PulseCoach genel sağlıklı yaşam desteği sunar, tanı ya da tedavi önermez. Bir sağlık sorunun varsa uzmana danış; acil durumda 112'yi ara.", "No. PulseCoach offers general wellbeing support and never diagnoses or prescribes. If you have a health condition, talk to a professional; in an emergency, call your local emergency number.") },
    { q: t("Fotoğraf analizi ne kadar doğru?", "How accurate is the photo analysis?"), a: t("Gramajlar her zaman bir tahmindir, özellikle yağ ve sos gibi görünmeyen bileşenlerde sapabilir. Koçun emin olmadığı öğeyi işaretler; sen kontrol etmeden hiçbir şey kaydedilmez.", "Grams are always an estimate and can be off, especially for hidden ingredients like oil and sauce. Your coach flags what it isn't sure about, and nothing is saved until you check it.") },
    { q: t("Verilerim nerede tutuluyor?", "Where is my data kept?"), a: t("Türkiye'deki sunucularda. Hangi veriyi neden işlediğimizi aydınlatma metninde ayrıntısıyla anlatıyoruz.", "On servers in Turkey. Our privacy notice explains in detail which data we process and why.") },
    { q: t("İngilizce kullanabilir miyim?", "Can I use it in English?"), a: t("Evet. Arayüz de koçun yanıtları da Türkçe ya da İngilizce olabilir; sağ üstten değiştirebilirsin.", "Yes. Both the interface and your coach's replies can be Turkish or English; switch at the top right.") },
    { q: t("Hesabımı silersem ne olur?", "What happens if I delete my account?"), a: t("Profilin, sohbetlerin ve tüm kayıtların kalıcı olarak silinir. Silmeden önce verilerini JSON dosyası olarak indirebilirsin.", "Your profile, chats and every record are permanently deleted. You can download your data as a JSON file first.") },
  ];

  return (
    <div className={`${s.root} ${outfit.variable} flex min-h-full flex-1 flex-col overflow-x-clip`}>
      <SiteHeader />

      <main id="icerik">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className={s.heroBg} aria-hidden="true">
            <span className={`${s.blob} -right-[10%] -top-[20%] h-[640px] w-[640px] bg-[#ff8a3d]`} />
            <span className={`${s.blob} -left-[12%] top-[30%] h-[420px] w-[420px] bg-[#ffc56b]`} style={{ animationDelay: "-6s" }} />
            <span className={`${s.blob} bottom-[-20%] left-[40%] h-[360px] w-[360px] bg-[#e8481f]`} style={{ animationDelay: "-11s" }} />
          </div>
          <PulseLine />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-36 pt-12 sm:px-6 sm:pb-28 lg:grid-cols-[1fr_1.02fr] lg:pb-32 lg:pt-20">
            {/* Hero metni JS'siz CSS animasyonuyla girer: Reveal (IntersectionObserver) hidrasyona kadar
                görünmez bırakıp LCP'yi geciktiriyordu (Lighthouse mobil 4,5 sn). */}
            <div>
              <div className={s.heroIn} style={{ animationDelay: "0ms" }}>
                <Eyebrow>{t("Yapay zekâ destekli sağlık ve fitness koçu", "AI-powered health and fitness coach")}</Eyebrow>
              </div>
              <div className={s.heroIn} style={{ animationDelay: "80ms" }}>
                <h1 className={`${s.display} mt-6 text-[clamp(3.4rem,8.6vw,6.4rem)]`}>
                  <span className={s.gradText}>{t("Ritmini", "Track")}</span>
                  <br />
                  {t("takip et.", "your rhythm.")}
                </h1>
              </div>
              <div className={s.heroIn} style={{ animationDelay: "160ms" }}>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--l-muted)] sm:text-xl">
                  {t(
                    "Antrenmanını, öğünlerini, kilonu ve ruh halini tek yerde kaydet. Yapay zekâ koçun verilerine bakar ve sana uygun bir sonraki adımı söyler.",
                    "Log your workouts, meals, weight and mood in one place. Your AI coach looks at your data and tells you a next step that fits you."
                  )}
                </p>
              </div>
              <div className={s.heroIn} style={{ animationDelay: "240ms" }}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <PrimaryCta href={startHref}>{startLabel}</PrimaryCta>
                  <a href="#nasil" className="inline-flex min-h-12 items-center rounded-full border border-[var(--l-line)] bg-[var(--l-card)]/60 px-5 text-base font-semibold transition-colors hover:bg-[var(--l-card)]">
                    {t("Nasıl çalışır?", "How it works")}
                  </a>
                </div>
              </div>
              <div className={s.heroIn} style={{ animationDelay: "320ms" }}>
                <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--l-muted)]">
                  {[t("Ücretsiz, reklamsız", "Free, no ads"), t("Verilerin Türkiye'de", "Your data stays in Turkey"), t("Türkçe ve İngilizce", "Turkish and English")].map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-[var(--l-goal)]" strokeWidth={3} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* KAYAN YETENEK ŞERİDİ */}
        <section aria-label={t("Neler yapabilirsin", "What you can do")} className={`${s.marquee} overflow-hidden border-y border-[var(--l-line)] bg-[var(--l-card)] py-5`}>
          <ul className={`${s.marqueeTrack} flex w-max gap-3`}>
            {[...marquee, ...marquee].map((item, i) => (
              <li
                key={`${item.label}-${i}`}
                aria-hidden={i >= marquee.length ? "true" : undefined}
                className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--l-line)] bg-[var(--l-bg)] px-4 py-2 text-sm font-semibold"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        {/* KOÇ - sohbetle kayıt gösterimi */}
        <section id="koc" className="relative scroll-mt-20 overflow-hidden">
          <div className="pointer-events-none absolute -left-40 top-20 h-[480px] w-[480px] rounded-full bg-[color-mix(in_srgb,var(--l-accent)_16%,transparent)] blur-[90px]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <Eyebrow>{t("Yapay zekâ koçu", "AI coach")}</Eyebrow>
              <h2 className={`${s.display} mt-5 text-[clamp(2.4rem,5vw,3.8rem)]`}>
                {t("Konuşur gibi", "Log it like")} <span className={s.gradText}>{t("kaydet.", "you'd say it.")}</span>
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Form doldurmak, besin aramak, gram hesaplamak yok. Ne yediğini, ne yaptığını yazman yeterli: koçun kaydı oluşturur, kaloriyi ve makroları hesaplar, emin olmadığında sorar.",
                  "No forms, no searching, no math. Just write what you ate and what you did: your coach creates the log, works out calories and macros, and asks when it isn't sure."
                )}
              </p>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--l-muted)]">
                {t("Formla eklemeyi seven için Beslenme, Antrenman ve İlerleme ekranlarında klasik kayıt da var.", "Prefer forms? The Nutrition, Workouts and Progress screens have classic logging too.")}
              </p>
            </Reveal>
            <ChatDemo />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
            <Reveal>
              <h3 className={`${s.display} text-[clamp(1.7rem,3vw,2.4rem)]`}>{t("Gününe göre konuşur.", "It talks to you about your day.")}</h3>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--l-muted)]">
                {t("Koçun kayıtlarına bakarak yanıt verir; her gün aynı şeyi söylemez.", "Your coach replies based on your logs, so it doesn't say the same thing every day.")}
              </p>
            </Reveal>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {coachMessages.map((item, i) => (
                <Reveal as="li" key={item.situation} delay={i * 120} className={`${s.lift} flex gap-4 rounded-[1.8rem] border border-[var(--l-line)] bg-[var(--l-card)] p-3 md:flex-col md:gap-0`}>
                  <div className="relative w-28 shrink-0 overflow-hidden rounded-[1.3rem] sm:w-36 md:aspect-[3/2] md:w-full md:max-w-[200px]">
                    <Image src={item.photo} alt="" fill sizes="(min-width: 768px) 200px, 144px" className="object-cover" />
                  </div>
                  <div className="flex flex-col justify-center py-2 pr-2 md:px-1 md:pt-4">
                    <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: item.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
                      {item.situation}
                    </span>
                    <p className="mt-1 text-base leading-relaxed">“{item.message}”</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* RAKAMLAR - koyu bant, sayaçlar */}
        <section aria-label={t("Kısaca PulseCoach", "PulseCoach at a glance")} className="relative overflow-hidden bg-[var(--l-band)] text-[var(--l-band-ink)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_15%_0%,rgba(255,122,61,0.25),transparent_70%),radial-gradient(40%_100%_at_90%_100%,rgba(185,140,255,0.16),transparent_70%)]" aria-hidden="true" />
          <dl className="relative mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-16 sm:px-6 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse justify-end gap-2">
                <dt className="max-w-[16rem] text-sm leading-snug text-[var(--l-band-muted)]">{stat.label}</dt>
                <dd className={`${s.display} text-5xl sm:text-6xl`}>
                  <span className={s.gradText}>
                    {stat.free ? (
                      t("0 TL", "Free")
                    ) : (
                      <CountUp to={stat.to} format={(n) => `${Math.round(n).toLocaleString(t("tr-TR", "en-US"))}${stat.suffix}`} />
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* FOTOĞRAFLA ÖĞÜN */}
        <section aria-labelledby="photo-title" className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-[color-mix(in_srgb,var(--l-nutrition)_20%,transparent)] blur-[100px]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <Reveal className="lg:order-2">
              <Eyebrow color="var(--l-nutrition)">{t("Fotoğrafla öğün", "Meals from a photo")}</Eyebrow>
              <h2 id="photo-title" className={`${s.display} mt-5 text-[clamp(2.4rem,5vw,3.8rem)]`}>
                {t("Tabağını çek,", "Snap your plate,")} <span className="text-[var(--l-nutrition-ink)]">{t("gerisi koçunda.", "your coach does the rest.")}</span>
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Ne yediğini yazmaya bile gerek yok. Koçun fotoğraftaki besinleri tanır, porsiyonu tahmin eder ve kalorisiyle makrolarını hesaplar.",
                  "You don't even have to type it. Your coach recognizes the foods in the photo, estimates the portions and works out calories and macros."
                )}
              </p>
              <ol className="mt-8 flex flex-col gap-5">
                {photoSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className={`${s.display} flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--l-nutrition-soft)] text-xl text-[var(--l-nutrition-ink)]`} aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="mt-1 text-base leading-relaxed text-[var(--l-muted)]">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
            <PhotoScan />
          </div>
        </section>

        {/* DÖRT RİTİM - sekmeli vitrin */}
        <section id="ozellikler" className="scroll-mt-20 border-t border-[var(--l-line)] bg-[var(--l-bg-2)]">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <Eyebrow color="var(--l-profile)">{t("Uygulamanın içi", "Inside the app")}</Eyebrow>
              <h2 className={`${s.display} mt-5 max-w-3xl text-[clamp(2.4rem,5vw,3.8rem)]`}>
                {t("Dört ritim,", "Four rhythms,")} <span className={s.gradText}>{t("tek uygulama.", "one app.")}</span>
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Her alanın kendi rengi var; uygulamada da aynı. Bir sekmeye dokun, o ekranı gör.",
                  "Each area has its own color, just like in the app. Pick a tab to see that screen."
                )}
              </p>
            </Reveal>
            <div className="mt-12">
              <Showcase />
            </div>
          </div>
        </section>

        {/* YETENEKLER */}
        <section className="border-t border-[var(--l-line)]">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <h2 className={`${s.display} max-w-3xl text-[clamp(2.4rem,5vw,3.8rem)]`}>{t("Hepsi bir arada.", "All in one place.")}</h2>
            </Reveal>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(({ icon: Icon, title, body, color }, i) => (
                <Reveal as="li" key={title} delay={(i % 4) * 80} className={`${s.lift} flex gap-4 rounded-[1.6rem] border border-[var(--l-line)] bg-[var(--l-card)] p-5 sm:block sm:p-6`}>
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold sm:mt-4">{title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-[var(--l-muted)] sm:mt-1.5">{body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* NASIL ÇALIŞIR */}
        <section id="nasil" className="scroll-mt-20 border-y border-[var(--l-line)] bg-[var(--l-bg-2)]">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <h2 className={`${s.display} text-[clamp(2.4rem,5vw,3.8rem)]`}>{t("Üç adımda başla.", "Start in three steps.")}</h2>
            </Reveal>
            <ol className="relative mt-14 grid gap-10 md:grid-cols-3">
              <span className="absolute left-[16%] right-[16%] top-7 hidden h-[2px] bg-[linear-gradient(90deg,var(--l-accent),var(--l-profile),var(--l-mood))] opacity-50 md:block" aria-hidden="true" />
              {steps.map((step, index) => (
                <Reveal as="li" key={step.title} delay={index * 140} className="relative text-center md:px-4">
                  <span className={`${s.display} relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--l-cta)] text-2xl text-white shadow-[0_14px_30px_-12px_rgba(184,72,31,0.7)]`} aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-base leading-relaxed text-[var(--l-muted)]">{step.body}</p>
                </Reveal>
              ))}
            </ol>
            <div className="mt-14 flex justify-center">
              <PrimaryCta href={startHref}>{startLabel}</PrimaryCta>
            </div>
          </div>
        </section>

        {/* GİZLİLİK */}
        <section id="gizlilik" className="relative scroll-mt-20 overflow-hidden bg-[var(--l-band)] text-[var(--l-band-ink)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_90%_at_100%_0%,rgba(77,214,230,0.16),transparent_70%)]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
            <Reveal>
              <h2 className={`${s.display} text-[clamp(2.4rem,5.5vw,4rem)]`}>{t("Sağlık verin sende kalır.", "Your health data stays yours.")}</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--l-band-muted)]">
                {t("Kilon, öğünlerin ve ruh halin özel bilgiler. Onları yalnızca sana koçluk yapmak için işliyoruz.", "Your weight, meals and mood are personal. We process them only to coach you.")}
              </p>
              <Link href="/kvkk" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-base font-semibold underline underline-offset-4">
                {t("Aydınlatma metnini oku", "Read the privacy notice")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Reveal>
            <ul className="grid gap-3 sm:grid-cols-2">
              {privacy.map(({ icon: Icon, text }, i) => (
                <Reveal as="li" key={text} delay={i * 90} className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-5">
                  <Icon className="h-5 w-5 text-[#4dd6e6]" aria-hidden="true" />
                  <p className="mt-3 text-base leading-relaxed">{text}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* SSS */}
        <section id="sss" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
            <Reveal>
              <h2 className={`${s.display} text-[clamp(2.4rem,5vw,3.8rem)]`}>{t("Sık sorulanlar", "Common questions")}</h2>
            </Reveal>
            <div className="mt-10 flex flex-col gap-3">
              {faqs.map((faq) => (
                <details key={faq.q} className={`${s.faq} rounded-[1.4rem] border border-[var(--l-line)] bg-[var(--l-card)] px-5 transition-colors open:bg-[var(--l-bg-2)]`}>
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold">
                    {faq.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--l-bg)]">
                      <Plus className={`${s.faqIcon} h-4 w-4 text-[var(--l-accent)] transition-transform`} aria-hidden="true" />
                    </span>
                  </summary>
                  <p className="pb-5 pr-10 text-base leading-relaxed text-[var(--l-muted)]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* SON ÇAĞRI */}
        <section className={`${s.closing} relative overflow-hidden border-t border-[var(--l-line)]`}>
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Reveal>
              <Sparkles className="h-8 w-8 text-[var(--l-accent)]" aria-hidden="true" />
              <h2 className={`${s.display} mt-4 text-[clamp(2.8rem,6.5vw,5.2rem)]`}>{t("Kendi ritmine göre ilerle.", "Move at your own rhythm.")}</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--l-muted)]">
                {t("Bugün tek bir kayıtla başla; gerisini koçunla birlikte görürsün.", "Start with a single log today; you'll see the rest together with your coach.")}
              </p>
              <div className="mt-8">
                <PrimaryCta href={startHref}>{startLabel}</PrimaryCta>
              </div>
            </Reveal>
            <Image src={jumpBw} alt={t("Siyah beyaz, havada sıçrayan bir genç", "A young man jumping in mid-air, black and white")} sizes="(min-width: 1024px) 360px, 70vw" className="mx-auto h-auto w-[70%] max-w-[360px]" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
