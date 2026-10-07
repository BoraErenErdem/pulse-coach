"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/language-context";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PulseMark } from "@/components/PulseMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { archivo } from "./fonts";
import s from "./landing.module.css";
import heroRunner from "../../../public/landing/photos/hero-runner.jpg";
import runnerCutout from "../../../public/landing/photos/runner-cutout.png";
import jumpBw from "../../../public/landing/photos/jump-bw.png";
import coachLowEnergy from "../../../public/landing/photos/coach-low-energy.png";
import coachAfterWorkout from "../../../public/landing/photos/coach-after-workout.png";
import coachNutrition from "../../../public/landing/photos/coach-nutrition.png";
import screenChat from "../../../public/landing/screens/chat.webp";
import screenNutrition from "../../../public/landing/screens/nutrition.webp";
import screenWorkouts from "../../../public/landing/screens/workouts.webp";
import screenProgress from "../../../public/landing/screens/progress.webp";
import screenProfile from "../../../public/landing/screens/profile.webp";

// Tanıtım sayfası (2026-10-06) - Framer sitesinin yerine, uygulamanın kendi kökünde.
// Arkadaşın tasarımındaki fotoğraflar (izinli) + uygulamanın gerçek ekranları. Form,
// analitik ve üçüncü taraf istek YOK (KVKK aydınlatmasına yeni bir şey eklemez).

const REGISTER_HREF = "/login?mode=register";
const CONTACT_EMAIL = "destek@pulsecoachapp.com";

function PhoneFrame({
  src,
  alt,
  sizes,
  eager = false,
  className = "",
}: {
  src: StaticImageData;
  alt: string;
  /** Çerçevenin gerçek genişliği; fazlası telefonda boşuna 640px indiriyordu. */
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-[2.2rem] bg-[var(--l-frame)] p-[7px] shadow-[0_30px_60px_-24px_rgba(24,33,29,0.45)] ${className}`}>
      <Image
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        sizes={sizes}
        className="h-auto w-full rounded-[1.8rem]"
      />
    </div>
  );
}

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--l-cta)] px-6 text-base font-semibold text-white transition-colors hover:bg-[var(--l-cta-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--l-cta)]"
    >
      {children}
    </Link>
  );
}

/** Hero'nun imzası: logodaki nabız, sayfa boyunca bir kez çizilir. */
function PulseLine() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-4 h-40 w-full text-[var(--l-accent)]"
      viewBox="0 0 1200 160"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className={s.pulsePath}
        pathLength={1}
        d="M0 128 H500 l18 -12 l14 24 l22 -96 l24 112 l18 -44 l14 16 H860 l12 -8 l10 16 l14 -44 l14 58 l10 -22 H1200"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Landing() {
  const t = useT();
  const { token } = useAuth();
  const startHref = token ? "/chat" : REGISTER_HREF;
  const startLabel = token ? t("Uygulamaya git", "Go to the app") : t("Web'de ücretsiz başla", "Start free on the web");

  const coachMessages = [
    {
      photo: coachLowEnergy,
      situation: t("Düşük enerjili bir gün", "A low-energy day"),
      message: t(
        "Bugün yüksek tempo şart değil. Kısa bir yürüyüş bile ritmini korumana yardımcı olabilir.",
        "No need for high intensity today. Even a short walk can help you keep your rhythm."
      ),
    },
    {
      photo: coachAfterWorkout,
      situation: t("Antrenmandan sonra", "After a workout"),
      message: t(
        "Harika iş çıkardın. Bugünkü eforun kaydedildi. İstersen şimdi nasıl hissettiğini de ekleyebiliriz.",
        "Great work. Today's effort is logged. If you like, we can add how you're feeling now."
      ),
    },
    {
      photo: coachNutrition,
      situation: t("Öğleden sonra beslenme", "Afternoon nutrition"),
      message: t(
        "Bugün protein hedefin biraz geride görünüyor. İstersen kalan öğünlerin için birlikte pratik bir plan çıkaralım.",
        "Your protein goal looks a little behind today. We can put together a simple plan for your remaining meals."
      ),
    },
  ];

  const features = [
    {
      screen: screenNutrition,
      alt: t("Beslenme ekranı: günlük kalori halkası ve makro çubukları", "Nutrition screen: daily calorie ring and macro bars"),
      title: t("Öğünlerin, gram gram.", "Your meals, gram by gram."),
      body: t(
        "Türk mutfağına göre hazırlanmış katalogdan ara ya da tabağının fotoğrafını çek. Kalori, protein, karbonhidrat ve yağ günlük hedefinle yan yana görünür.",
        "Search a catalog built around Turkish cuisine or snap a photo of your plate. Calories, protein, carbs and fat sit right next to your daily goal."
      ),
      points: [
        t("7.900'den fazla besin", "Over 7,900 foods"),
        t("Fotoğraftan tahmin, kaydetmeden önce düzenleme", "Estimates from a photo, editable before saving"),
        t("Boyuna, yaşına ve hedefine göre kalori önerisi", "Calorie suggestion based on your height, age and goal"),
      ],
    },
    {
      screen: screenWorkouts,
      alt: t("Antrenman ekranı: haftalık hedef ve son 7 günün özeti", "Workouts screen: weekly goal and last 7 days"),
      title: t("Her set, her rekor.", "Every set, every record."),
      body: t(
        "Setlerini tekrar ve ağırlıkla, kardiyonu süreyle kaydet. Haftalık hedefin, toplam hacmin ve kişisel rekorların kendiliğinden hesaplanır.",
        "Log sets with reps and weight, cardio with duration. Your weekly goal, total volume and personal records are calculated for you."
      ),
      points: [
        t("890 egzersizlik katalog", "An 890-exercise catalog"),
        t("Rekor kırdığında haber verir", "Tells you when you hit a record"),
        t("Haftada kaç gün çalışacağını sen belirlersin", "You set how many days a week you train"),
      ],
      cutout: true,
    },
    {
      screen: screenProgress,
      alt: t("İlerleme ekranı: kilo hedefi ve son 7 günün içgörüsü", "Progress screen: weight goal and 7-day insight"),
      title: t("Gelişimin, tek bir sayıdan fazlası.", "Your progress is more than one number."),
      body: t(
        "Kilonu, bel çevreni ve yağ oranını kaydet; ruh halini de işaretle. Koçun antrenman günlerinle ruh halin arasındaki örüntüleri gösterir.",
        "Log your weight, waist and body fat, and mark your mood too. Your coach shows the patterns between your workout days and how you feel."
      ),
      points: [
        t("Kilo, bel ve yağ oranı hedefleri", "Weight, waist and body fat goals"),
        t("Haftalık içgörü ve aylar arası trend", "Weekly insight and month-over-month trends"),
        t("Ruh hali takvimi", "Mood calendar"),
      ],
    },
    {
      screen: screenProfile,
      alt: t("Profil ekranı: seri, haftalık hedef ve rozetler", "Profile screen: streak, weekly goal and badges"),
      title: t("Küçük adımlar sayılır.", "Small steps count."),
      body: t(
        "Serin, rozetlerin ve haftalık özetin profilinde. Koçun her pazar haftanı değerlendirir, telefonun da sana hatırlatır.",
        "Your streak, badges and weekly summary live on your profile. Your coach reviews your week every Sunday, and your phone reminds you."
      ),
      points: [
        t("Dokuz rozet", "Nine badges"),
        t("Pazar günleri haftalık değerlendirme", "A weekly review every Sunday"),
        t("Unutursan nazik bir hatırlatma", "A gentle reminder if you forget"),
      ],
    },
  ];

  const steps = [
    { title: t("Hesabını aç", "Create your account"), body: t("E-postanla, Google ya da Apple hesabınla bir dakikada.", "With email, Google or Apple, in a minute.") },
    { title: t("Gününü anlat", "Tell it about your day"), body: t("Sohbete yaz, formdan ekle ya da tabağının fotoğrafını yükle.", "Write in the chat, use the forms or upload a photo of your plate.") },
    { title: t("Ritmini gör", "See your rhythm"), body: t("Grafikler, içgörüler ve koçunun haftalık değerlendirmesi.", "Charts, insights and your coach's weekly review.") },
  ];

  const privacy = [
    t("Verilerin Türkiye'deki sunucularda saklanır.", "Your data is stored on servers in Turkey."),
    t("Reklam yok. Verilerin satılmaz ve yapay zekâ eğitiminde kullanılmaz.", "No ads. Your data is never sold or used to train AI."),
    t("Tüm verini tek tıkla indir, hesabını istediğin an kalıcı olarak sil.", "Download all your data in one click, delete your account whenever you want."),
    t("Bildirimler telefonunda zamanlanır; sağlık verin bildirim sunucularına gitmez.", "Notifications are scheduled on your phone; your health data never goes to a notification server."),
  ];

  const faqs = [
    {
      q: t("PulseCoach ücretli mi?", "Does PulseCoach cost anything?"),
      a: t(
        "Hayır, şu an ücretsiz. Yapay zekâ koçu adil kullanım için günlük bir mesaj sınırıyla çalışır.",
        "No, it's free right now. The AI coach has a daily message limit for fair use."
      ),
    },
    {
      q: t("Hangi cihazlarda kullanabilirim?", "Which devices can I use?"),
      a: t(
        "Bugün web tarayıcısında, telefonda da bilgisayarda da. iPhone uygulaması App Store'a yakında geliyor; hesabın ikisinde de aynı.",
        "Today in your web browser, on phone or computer. The iPhone app is coming to the App Store soon; your account is the same on both."
      ),
    },
    {
      q: t("Koçum tıbbi tavsiye verir mi?", "Does my coach give medical advice?"),
      a: t(
        "Hayır. PulseCoach genel sağlıklı yaşam desteği sunar, tanı ya da tedavi önermez. Bir sağlık sorunun varsa uzmana danış; acil durumda 112'yi ara.",
        "No. PulseCoach offers general wellbeing support and never diagnoses or prescribes. If you have a health condition, talk to a professional; in an emergency, call your local emergency number."
      ),
    },
    {
      q: t("Verilerim nerede tutuluyor?", "Where is my data kept?"),
      a: t(
        "Türkiye'deki sunucularda. Hangi veriyi neden işlediğimizi aydınlatma metninde ayrıntısıyla anlatıyoruz.",
        "On servers in Turkey. Our privacy notice explains in detail which data we process and why."
      ),
    },
    {
      q: t("İngilizce kullanabilir miyim?", "Can I use it in English?"),
      a: t(
        "Evet. Arayüz de koçun yanıtları da Türkçe ya da İngilizce olabilir; sağ üstten değiştirebilirsin.",
        "Yes. Both the interface and your coach's replies can be Turkish or English; switch at the top right."
      ),
    },
    {
      q: t("Hesabımı silersem ne olur?", "What happens if I delete my account?"),
      a: t(
        "Profilin, sohbetlerin ve tüm kayıtların kalıcı olarak silinir. Silmeden önce verilerini JSON dosyası olarak indirebilirsin.",
        "Your profile, chats and every record are permanently deleted. You can download your data as a JSON file first."
      ),
    },
  ];

  const navLinks = [
    { href: "#ozellikler", label: t("Özellikler", "Features") },
    { href: "#nasil", label: t("Nasıl çalışır", "How it works") },
    { href: "#gizlilik", label: t("Gizlilik", "Privacy") },
    { href: "#sss", label: t("SSS", "FAQ") },
  ];

  return (
    <div className={`${s.root} ${archivo.variable} flex min-h-full flex-1 flex-col`}>
      <header className="sticky top-0 z-30 border-b border-[var(--l-line)] bg-[var(--l-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold" aria-label="PulseCoach">
            <PulseMark size={28} className="text-[var(--l-accent)]" />
            <span className={s.display + " text-xl"}>PulseCoach</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-6 text-sm text-[var(--l-muted)] lg:flex" aria-label={t("Sayfa bölümleri", "Page sections")}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-[var(--l-ink)]">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
            {/* Telefonda tek düğmeye yer var: geri dönen kullanıcı için "Giriş yap"
                (yeni kullanıcıyı hero'daki büyük düğme kayda götürür). */}
            {!token ? (
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-full border border-[var(--l-line)] px-4 text-sm font-semibold sm:border-0 sm:px-3">
                {t("Giriş yap", "Log in")}
              </Link>
            ) : null}
            <Link
              href={startHref}
              className={`${token ? "inline-flex" : "hidden sm:inline-flex"} min-h-11 items-center rounded-full bg-[var(--l-ink)] px-4 text-sm font-semibold text-[var(--l-bg)] transition-opacity hover:opacity-90`}
            >
              {token ? t("Uygulamaya git", "Go to the app") : t("Web'de başla", "Start on the web")}
            </Link>
          </div>
        </div>
      </header>

      <main id="icerik">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <PulseLine />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
            <div>
              <h1 className={`${s.display} text-[clamp(3.6rem,9vw,6.6rem)]`}>{t("Ritmini takip et.", "Track your rhythm.")}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Antrenmanını, öğünlerini, kilonu ve ruh halini tek yerde kaydet. Yapay zekâ koçun verilerine bakar ve sana uygun bir sonraki adımı söyler.",
                  "Log your workouts, meals, weight and mood in one place. Your AI coach looks at your data and tells you a next step that fits you."
                )}
              </p>
              <div className="mt-8">
                <PrimaryCta href={startHref}>{startLabel}</PrimaryCta>
              </div>
              <p className="mt-5 text-sm text-[var(--l-muted)]">
                {t("Kayıt ücretsiz. iPhone uygulaması yakında App Store'da.", "Free to join. The iPhone app is coming soon to the App Store.")}
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="relative ml-auto w-[82%] overflow-hidden rounded-[2rem]">
                <Image
                  src={heroRunner}
                  alt={t("Havada sıçrayarak koşan bir kadın sporcu", "A female athlete mid-stride in the air")}
                  loading="eager"
                  fetchPriority="high"
                  placeholder="blur"
                  sizes="(min-width: 1024px) 440px, 80vw"
                  className="h-auto w-full"
                />
              </div>
              <div className="absolute -bottom-10 left-0 w-[42%] min-w-[150px]">
                <PhoneFrame src={screenChat} alt={t("Sohbet ekranı: koç günün kayıtlarını değerlendiriyor", "Chat screen: the coach reviews the day's logs")} sizes="(min-width: 1024px) 220px, 40vw" eager />
              </div>
            </div>
          </div>
        </section>

        {/* KOÇ */}
        <section className="border-t border-[var(--l-line)] bg-[var(--l-card)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <h2 className={`${s.display} text-[clamp(2.2rem,5vw,3.6rem)]`}>{t("Konuşur gibi kaydet.", "Log it like you'd say it.")}</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Ne yediğini, ne yaptığını yazman yeterli. Koçun kaydı oluşturur, kaloriyi hesaplar, emin olmadığında sorar. Her gün aynı geçmez; yanıtları da gününe göre değişir.",
                  "Just write what you ate and what you did. Your coach creates the log, works out the calories and asks when it isn't sure. No two days are the same, so its replies change with yours."
                )}
              </p>
            </div>
            <div>
              <p className="mb-5 text-sm text-[var(--l-muted)]">{t("Koçundan örnek mesajlar", "Sample messages from your coach")}</p>
              <ul className="flex flex-col gap-5">
                {coachMessages.map((item, index) => (
                  <li
                    key={item.situation}
                    className={`flex items-stretch gap-4 rounded-[1.6rem] bg-[var(--l-bg)] p-3 ${index === 1 ? "lg:ml-12" : ""}`}
                  >
                    <div className="relative w-28 shrink-0 overflow-hidden rounded-[1.2rem] sm:w-36">
                      <Image src={item.photo} alt="" fill sizes="144px" className="object-cover" />
                    </div>
                    <div className="flex flex-col justify-center py-2 pr-2">
                      <span className="text-sm font-semibold text-[var(--l-accent)]">{item.situation}</span>
                      <p className="mt-1 text-base leading-relaxed">{item.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ÖZELLİKLER */}
        <section id="ozellikler" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <h2 className={`${s.display} max-w-3xl text-[clamp(2.2rem,5vw,3.6rem)]`}>{t("Dört ritim, tek uygulama.", "Four rhythms, one app.")}</h2>
            <div className="mt-16 flex flex-col gap-24">
              {features.map((feature, index) => (
                <article key={feature.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
                  <div className={`relative mx-auto w-full max-w-md ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                    <div className="absolute inset-x-6 bottom-6 top-16 rounded-[2.4rem] bg-[var(--l-sage)]" aria-hidden="true" />
                    {feature.cutout ? (
                      <Image
                        src={runnerCutout}
                        alt=""
                        sizes="220px"
                        className="absolute -right-6 bottom-0 hidden w-[52%] opacity-90 sm:block"
                      />
                    ) : null}
                    <PhoneFrame src={feature.screen} alt={feature.alt} sizes="(min-width: 1024px) 280px, 56vw" className="relative mx-auto w-[62%]" />
                  </div>
                  <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                    <h3 className={`${s.display} text-[clamp(1.8rem,3.4vw,2.6rem)]`}>{feature.title}</h3>
                    <p className="mt-4 max-w-lg text-lg leading-relaxed text-[var(--l-muted)]">{feature.body}</p>
                    <ul className="mt-6 flex flex-col gap-3">
                      {feature.points.map((point) => (
                        <li key={point} className="flex items-start gap-3 text-base">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--l-accent)]" aria-hidden="true" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* NASIL ÇALIŞIR - gerçek bir sıra olduğu için numaralı */}
        <section id="nasil" className="scroll-mt-20 border-y border-[var(--l-line)] bg-[var(--l-card)]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className={`${s.display} text-[clamp(2.2rem,5vw,3.6rem)]`}>{t("Üç adımda başla.", "Start in three steps.")}</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="border-t-2 border-[var(--l-ink)] pt-5">
                  <span className={`${s.display} text-5xl text-[var(--l-accent)]`} aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--l-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* GİZLİLİK */}
        <section id="gizlilik" className="scroll-mt-20 bg-[var(--l-band)] text-[var(--l-band-ink)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className={`${s.display} text-[clamp(2.4rem,5.5vw,4rem)]`}>{t("Sağlık verin sende kalır.", "Your health data stays yours.")}</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--l-band-muted)]">
                {t(
                  "Kilon, öğünlerin ve ruh halin özel bilgiler. Onları yalnızca sana koçluk yapmak için işliyoruz.",
                  "Your weight, meals and mood are personal. We process them only to coach you."
                )}
              </p>
              <Link href="/kvkk" className="mt-6 inline-flex min-h-11 items-center text-base font-semibold underline underline-offset-4">
                {t("Aydınlatma metnini oku", "Read the privacy notice")}
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-[var(--l-band-muted)]/30 border-y border-[var(--l-band-muted)]/30">
              {privacy.map((item) => (
                <li key={item} className="py-5 text-lg leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* SSS */}
        <section id="sss" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
            <h2 className={`${s.display} text-[clamp(2.2rem,5vw,3.6rem)]`}>{t("Sık sorulanlar", "Common questions")}</h2>
            <div className="mt-10 border-t border-[var(--l-line)]">
              {faqs.map((faq) => (
                <details key={faq.q} className={`${s.faq} border-b border-[var(--l-line)]`}>
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold">
                    {faq.q}
                    <Plus className={`${s.faqIcon} h-5 w-5 shrink-0 text-[var(--l-accent)] transition-transform`} aria-hidden="true" />
                  </summary>
                  <p className="pb-5 pr-10 text-base leading-relaxed text-[var(--l-muted)]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* SON ÇAĞRI */}
        <section className="relative overflow-hidden border-t border-[var(--l-line)]">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className={`${s.display} text-[clamp(2.6rem,6.5vw,5rem)]`}>{t("Kendi ritmine göre ilerle.", "Move at your own rhythm.")}</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--l-muted)]">
                {t(
                  "Bugün tek bir kayıtla başla; gerisini koçunla birlikte görürsün.",
                  "Start with a single log today; you'll see the rest together with your coach."
                )}
              </p>
              <div className="mt-8">
                <PrimaryCta href={startHref}>{startLabel}</PrimaryCta>
              </div>
            </div>
            <Image
              src={jumpBw}
              alt={t("Siyah beyaz, havada sıçrayan bir genç", "A young man jumping in mid-air, black and white")}
              sizes="(min-width: 1024px) 360px, 70vw"
              className="mx-auto h-auto w-[70%] max-w-[360px]"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--l-line)] bg-[var(--l-card)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <PulseMark size={24} className="text-[var(--l-accent)]" />
              <span className={`${s.display} text-lg`}>PulseCoach</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--l-muted)]">
              {t(
                "Yapay zekâ destekli sağlık ve fitness koçu. PulseCoach tıbbi tavsiye yerine geçmez.",
                "An AI-powered health and fitness coach. PulseCoach does not replace medical advice."
              )}
            </p>
          </div>
          <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-8" aria-label={t("Alt bilgi", "Footer")}>
            <Link href="/kvkk" className="min-h-11 content-center hover:underline">
              {t("Gizlilik ve KVKK", "Privacy and KVKK")}
            </Link>
            <Link href="/terms" className="min-h-11 content-center hover:underline">
              {t("Kullanım Koşulları", "Terms of Service")}
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="min-h-11 content-center hover:underline">
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-[var(--l-muted)] sm:px-6">© 2026 PulseCoach</p>
        <div className="flex justify-center gap-2 pb-8 sm:hidden">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
