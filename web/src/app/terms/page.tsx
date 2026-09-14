"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { Card } from "@/components/ui";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PulseMark } from "@/components/PulseMark";

// Kullanım Koşulları (2026-09-14).
// mobile/app/terms.tsx'in web portu - AYNI TR/EN içerik, aynı anchor id'leri.
// web/src/app/kvkk/page.tsx ile aynı sayfa deseni (Section/SubTitle/P,
// TR/EN içerik fonksiyonları, dil+tema toggle). Auth-korumalı (app) grubunun
// DIŞINDA, üst seviye bir route - kayıt öncesi ve sonrası erişilebilir
// olması gerekiyor, tıpkı /kvkk gibi.
//
// KVKK metnindeki "3. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza"
// bölümü buradaki "4. Tıbbi Sorumluluk Reddi" maddesine atıf yapıyor -
// ikisi birbirini tamamlıyor, o yüzden id="tibbi-sorumluluk-reddi" sabit
// tutulmalı.

const CONTACT_EMAIL = "pulsecoach26@gmail.com";

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>;
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
      {children}
    </div>
  );
}

function TrContent() {
  return (
    <>
      <P>
        Son güncelleme: 14 Eylül 2026. Bu Kullanım Koşulları (&quot;Koşullar&quot;), PulseCoach&apos;u
        (&quot;Uygulama&quot;) kullanan herkes (&quot;Kullanıcı&quot;, &quot;siz&quot;) ile Uygulama arasındaki
        ilişkiyi düzenler. Kişisel verilerinizin nasıl işlendiği hakkında{" "}
        <Link href="/kvkk" className="text-accent hover:underline">
          Gizlilik ve KVKK
        </Link>{" "}
        metnine bakabilirsiniz.
      </P>

      <SectionTitle id="kabul">1. Taraflar ve Kabul</SectionTitle>
      <P>
        PulseCoach, Bora Eren Erdem tarafından bireysel bir proje olarak işletilmektedir. Uygulamayı indirerek,
        hesap oluşturarak veya kullanarak bu Koşulları okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş
        olursunuz. Koşulları kabul etmiyorsanız Uygulamayı kullanmamalısınız.
      </P>

      <SectionTitle id="hizmet">2. Hizmetin Tanımı</SectionTitle>
      <P>
        PulseCoach; antrenman, beslenme, ruh hâli ve vücut ölçümü takibi ile bunlara dayanan, yapay zekâ
        destekli kişiselleştirilmiş koçluk önerileri sunan bir mobil ve web uygulamasıdır. Uygulama içindeki
        yapay zekâ koç kendi sunucularımızda barındırılan bir dil modelidir ve verdiği öneriler girdiğiniz
        verilere dayanır.
      </P>

      <SectionTitle id="uygunluk">3. Uygunluk ve Hesap</SectionTitle>
      <P>
        Uygulamayı kullanabilmek için en az 18 yaşında olmanız gerekir; 18 yaşından küçükseniz Uygulamayı
        kullanamazsınız. Hesap oluştururken doğru ve güncel bilgi vermekle, şifrenizin gizliliğini korumakla ve
        hesabınız altında gerçekleşen tüm işlemlerden sorumlu olduğunuzu kabul edersiniz. Hesabınızla ilgili
        yetkisiz bir kullanım fark ederseniz bizi{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        adresinden bilgilendirmelisiniz.
      </P>

      <SectionTitle id="tibbi-sorumluluk-reddi">4. Tıbbi Sorumluluk Reddi</SectionTitle>
      <Highlight>
        PulseCoach bir tıbbi cihaz, teşhis aracı veya sağlık hizmeti sağlayıcısı <strong>değildir</strong>.
        Uygulama içindeki yapay zekâ koçun sunduğu antrenman, beslenme ve yaşam tarzı önerileri yalnızca genel
        bilgilendirme amaçlıdır; bir doktorun, diyetisyenin, fizyoterapistin veya diğer bir sağlık profesyonelinin
        tıbbi tavsiyesinin, teşhisinin veya tedavisinin <strong>yerine geçmez</strong>. Herhangi bir egzersiz veya
        beslenme programına başlamadan önce, özellikle mevcut bir sağlık probleminiz, sakatlığınız, hamileliğiniz
        veya kronik bir rahatsızlığınız varsa bir hekime danışmanız önemle tavsiye edilir. Kendinizi kötü
        hissediyorsanız veya acil bir durumdaysanız derhal 112&apos;yi arayın veya en yakın sağlık kuruluşuna
        başvurun. Uygulamayı kullanarak önerileri kendi sorumluluğunuzda uyguladığınızı kabul edersiniz.
      </Highlight>

      <SectionTitle id="kullanici-yukumlulukleri">5. Kullanıcı Yükümlülükleri</SectionTitle>
      <P>
        Uygulamayı yalnızca yasal amaçlarla ve bu Koşullara uygun şekilde kullanacağınızı; Uygulamanın
        işleyişine zarar verecek, güvenliğini aşmaya çalışacak veya diğer kullanıcıları rahatsız edecek herhangi
        bir eylemde bulunmayacağınızı kabul edersiniz.
      </P>

      <SectionTitle id="ucretlendirme">6. Ücretlendirme</SectionTitle>
      <P>
        Uygulama şu anda tamamen ücretsiz olarak sunulmaktadır. İleride ücretli özellikler veya abonelik
        planları eklenmesi hâlinde bu değişiklik açıkça duyurulacak; mevcut ücretsiz özelliklerinizden
        yararlanmaya devam etmeniz için önceden onayınız olmadan sizden ücret talep edilmeyecektir.
      </P>

      <SectionTitle id="fikri-mulkiyet">7. Fikri Mülkiyet</SectionTitle>
      <P>
        Uygulamanın yazılımı, tasarımı, logosu (&quot;PulseCoach&quot; adı ve markası dahil) ve içeriği
        (kişisel verileriniz hariç) Bora Eren Erdem&apos;e aittir ve telif hakkıyla korunmaktadır. Uygulamayı
        izinsiz kopyalayamaz, tersine mühendislik yapamaz veya ticari amaçla yeniden dağıtamazsınız. Kendi
        girdiğiniz veriler (antrenman kayıtları, sohbet geçmişi vb.) size aittir; bunları Profil &gt; Verilerim
        bölümünden indirebilirsiniz.
      </P>

      <SectionTitle id="garanti-reddi">8. Hizmetin Sınırları ve Garanti Reddi</SectionTitle>
      <P>
        PulseCoach, bireysel bir geliştirici tarafından yürütülen, gelişmekte olan bir projedir. Uygulama
        &quot;olduğu gibi&quot; ve &quot;mevcut olduğu ölçüde&quot; sunulur; kesintisiz veya hatasız çalışacağı,
        belirli bir amaca uygun olacağı ya da yapay zekâ koçun önerilerinin her zaman doğru veya güncel olacağı
        garanti edilmez. Bakım, güncelleme veya teknik sorunlar nedeniyle Uygulama zaman zaman erişilemez
        olabilir.
      </P>

      <SectionTitle id="sorumluluk-sinirlamasi">9. Sorumluluğun Sınırlandırılması</SectionTitle>
      <P>
        Yürürlükteki mevzuatın izin verdiği azami ölçüde, Uygulamanın kullanımından veya kullanılamamasından
        kaynaklanan doğrudan veya dolaylı zararlardan (veri kaybı, kâr kaybı vb. dahil) sorumlu tutulamayız. Bu
        sınırlama, kasıt veya ağır kusurdan kaynaklanan sorumluluğu ortadan kaldırmaz.
      </P>

      <SectionTitle id="hesap-sonlandirma">10. Hesabın Sonlandırılması</SectionTitle>
      <P>
        Hesabınızı istediğiniz zaman Profil &gt; Hesabımı Sil bölümünden kalıcı olarak silebilirsiniz. Bu
        Koşulları ihlal etmeniz hâlinde hesabınızı askıya alma veya sonlandırma hakkımız saklıdır.
      </P>

      <SectionTitle id="degisiklikler">11. Değişiklikler</SectionTitle>
      <P>
        Bu Koşulları zaman zaman güncelleyebiliriz. Önemli değişikliklerde güncel tarih bu sayfanın başında
        belirtilir ve mümkün olduğunca uygulama içinden de bildirilir. Güncellemeden sonra Uygulamayı kullanmaya
        devam etmeniz, yeni Koşulları kabul ettiğiniz anlamına gelir.
      </P>

      <SectionTitle id="uygulanacak-hukuk">12. Uygulanacak Hukuk</SectionTitle>
      <P>Bu Koşullar, Türkiye Cumhuriyeti kanunlarına tabidir.</P>

      <SectionTitle id="iletisim">13. İletişim</SectionTitle>
      <P>
        Sorularınız için{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        adresinden bize ulaşabilirsiniz.
      </P>
    </>
  );
}

function EnContent() {
  return (
    <>
      <P>
        Last updated: September 14, 2026. These Terms of Service (&quot;Terms&quot;) govern the relationship
        between everyone (&quot;User&quot;, &quot;you&quot;) who uses PulseCoach (the &quot;App&quot;) and the
        App. For how your personal data is processed, see the{" "}
        <Link href="/kvkk" className="text-accent hover:underline">
          Privacy &amp; KVKK
        </Link>{" "}
        notice.
      </P>

      <SectionTitle id="kabul">1. Parties and Acceptance</SectionTitle>
      <P>
        PulseCoach is run by Bora Eren Erdem as an individual project. By downloading, registering for, or using
        the App, you confirm that you have read, understood, and agree to these Terms. If you do not agree to
        these Terms, you must not use the App.
      </P>

      <SectionTitle id="hizmet">2. Description of the Service</SectionTitle>
      <P>
        PulseCoach is a mobile and web app that tracks your workouts, nutrition, mood, and body measurements,
        and provides AI-powered personalized coaching recommendations based on that data. The AI coach in the
        app is a language model hosted on our own servers, and its recommendations are based on the data you
        provide.
      </P>

      <SectionTitle id="uygunluk">3. Eligibility and Your Account</SectionTitle>
      <P>
        You must be at least 18 years old to use the App; if you are under 18, you may not use it. When creating
        an account, you agree to provide accurate and up-to-date information, to keep your password
        confidential, and that you are responsible for all activity under your account. If you notice
        unauthorized use of your account, you should notify us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>

      <SectionTitle id="tibbi-sorumluluk-reddi">4. Medical Disclaimer</SectionTitle>
      <Highlight>
        PulseCoach is <strong>not</strong>{" "}a medical device, a diagnostic tool, or a healthcare provider. The
        workout, nutrition, and lifestyle recommendations provided by the AI coach are for general informational
        purposes only and do <strong>not</strong>{" "}replace the medical advice, diagnosis, or treatment of a
        physician, dietitian, physical therapist, or other health professional. Before starting any exercise or
        nutrition program — especially if you have an existing health condition, injury, are pregnant, or have a
        chronic condition — we strongly recommend consulting a physician. If you feel unwell or are in an
        emergency, call your local emergency number immediately or seek the nearest medical facility. By using
        the App, you agree that you follow its recommendations at your own responsibility.
      </Highlight>

      <SectionTitle id="kullanici-yukumlulukleri">5. User Obligations</SectionTitle>
      <P>
        You agree to use the App only for lawful purposes and in accordance with these Terms, and not to engage
        in any activity that damages the App&apos;s operation, attempts to breach its security, or harasses
        other users.
      </P>

      <SectionTitle id="ucretlendirme">6. Pricing</SectionTitle>
      <P>
        The App is currently offered entirely free of charge. If paid features or subscription plans are added
        in the future, this change will be clearly announced, and you will not be charged for continuing to use
        your existing free features without your prior consent.
      </P>

      <SectionTitle id="fikri-mulkiyet">7. Intellectual Property</SectionTitle>
      <P>
        The App&apos;s software, design, logo (including the &quot;PulseCoach&quot; name and mark), and content
        (excluding your personal data) belong to Bora Eren Erdem and are protected by copyright. You may not
        copy, reverse-engineer, or redistribute the App for commercial purposes without permission. The data you
        enter (workout logs, chat history, etc.) belongs to you; you can download it from Profile &gt; My Data.
      </P>

      <SectionTitle id="garanti-reddi">8. Service Limitations and Disclaimer of Warranties</SectionTitle>
      <P>
        PulseCoach is an evolving project run by an individual developer. The App is provided &quot;as is&quot;
        and &quot;as available&quot;; we do not guarantee that it will be uninterrupted or error-free, fit for a
        particular purpose, or that the AI coach&apos;s recommendations will always be accurate or up to date.
        The App may occasionally be unavailable due to maintenance, updates, or technical issues.
      </P>

      <SectionTitle id="sorumluluk-sinirlamasi">9. Limitation of Liability</SectionTitle>
      <P>
        To the maximum extent permitted by applicable law, we are not liable for direct or indirect damages
        (including data loss or loss of profit) arising from your use or inability to use the App. This
        limitation does not exclude liability arising from intent or gross negligence.
      </P>

      <SectionTitle id="hesap-sonlandirma">10. Account Termination</SectionTitle>
      <P>
        You can permanently delete your account at any time from Profile &gt; Delete My Account. We reserve the
        right to suspend or terminate your account if you violate these Terms.
      </P>

      <SectionTitle id="degisiklikler">11. Changes</SectionTitle>
      <P>
        We may update these Terms from time to time. For material changes, the updated date will be shown at the
        top of this page, and we also try to notify you within the app where possible. Continuing to use the App
        after an update means you accept the new Terms.
      </P>

      <SectionTitle id="uygulanacak-hukuk">12. Governing Law</SectionTitle>
      <P>These Terms are governed by the laws of the Republic of Turkey.</P>

      <SectionTitle id="iletisim">13. Contact</SectionTitle>
      <P>
        You can reach us with any questions at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>
    </>
  );
}

export default function TermsPage() {
  const { language } = useLanguage();

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-accent">
            <ArrowLeft className="h-4 w-4" />
            {language === "tr" ? "Geri" : "Back"}
          </Link>
          <div className="flex gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <PulseMark size={28} className="text-accent" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {language === "tr" ? "Kullanım Koşulları" : "Terms of Service"}
          </h1>
        </div>

        <Card>{language === "tr" ? <TrContent /> : <EnContent />}</Card>
      </div>
    </div>
  );
}
