"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { Card } from "@/components/ui";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PulseMark } from "@/components/PulseMark";

// KVKK Aydınlatma Metni + Açık Rıza Metinleri (2026-09-11).
// mobile/app/kvkk.tsx'in web portu - AYNI TR/EN içerik, üç bölüm de aynı
// anchor id'lerini taşıyor ki login sayfasındaki checkbox linkleri her iki
// platformda da aynı davransın. Auth-korumalı (app) grubunun DIŞINDA, üst
// seviye bir route: hem kayıt öncesi (login ekranından) hem kayıt sonrası
// (Profil > Gizlilik ve KVKK) erişilebilir olması gerekiyor - KVKK'nın
// "aydınlatma her zaman ulaşılabilir olmalı" ilkesi tek bir korumasız route
// ile ikisini birden karşılıyor.
//
// Sunucu konumu (bkz. "3. Aktarım" bölümü) HENÜZ netleşmedi - RunPod'da GPU
// kiralanıp canlıya alınınca (bkz. memory: project_pulsecoach_launch_plan)
// buradaki genel ifade gerçek ülke/bölge ile GÜNCELLENMELİ.

const CONTACT_EMAIL = "pulsecoach26@gmail.com";

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>;
}

function TrContent() {
  return (
    <>
      <SectionTitle id="aydinlatma">1. Aydınlatma Metni</SectionTitle>
      <P>
        Son güncelleme: 11 Eylül 2026. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
        madde 10 uyarınca PulseCoach&apos;u kullanırken işlenen kişisel verileriniz hakkında sizi bilgilendirmek
        için hazırlanmıştır.
      </P>

      <SubTitle>1.1 Veri Sorumlusu</SubTitle>
      <P>
        PulseCoach, Bora Eren Erdem tarafından bireysel bir proje olarak, ticari kâr amacı gütmeden
        işletilmektedir. KVKK uyarınca &quot;veri sorumlusu&quot; sıfatıyla hareket ediyoruz. İletişim: {" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>

      <SubTitle>1.2 İşlenen Kişisel Veriler</SubTitle>
      <P>
        <strong>Kimlik/İletişim:</strong>{" "}e-posta adresiniz.
        <br />
        <strong>Hesap güvenliği:</strong>{" "}şifreniz (geri döndürülemez biçimde şifrelenmiş olarak saklanır), giriş
        denemesi kayıtları, kötüye kullanımı önlemek amacıyla IP adresiniz.
        <br />
        <strong>Sağlık ve yaşam tarzı verileri (özel nitelikli):</strong>{" "}antrenman/egzersiz kayıtlarınız (set,
        tekrar, ağırlık, süre), beslenme kayıtlarınız ve yemek fotoğraflarınız, vücut ölçümleriniz (kilo, bel
        çevresi, vücut yağ oranı vb.), ruh hâli (mood) kayıtlarınız ve check-in mesajlarınız, yapay zekâ koç ile
        sohbet geçmişiniz.
        <br />
        <strong>Kullanım/teknik veriler:</strong>{" "}dil ve tema tercihiniz, push bildirim token&apos;ı, hedefler ve
        koç tonu gibi uygulama içi tercihleriniz.
      </P>

      <SubTitle>1.3 İşlenme Amaçları</SubTitle>
      <P>
        Kişiselleştirilmiş antrenman/beslenme takibi ve yapay zekâ koçluk hizmeti sunmak; ilerlemenizi (kilo,
        antrenman hacmi, beslenme, ruh hâli) analiz ederek size özel geri bildirim ve öneri üretmek; hesap
        güvenliğini sağlamak (kimlik doğrulama, kötüye kullanım/deneme sınırlaması, şifre sıfırlama); talep
        etmeniz hâlinde push bildirim göndermek; uygulamanın işleyişini ölçmek ve iyileştirmek.
      </P>

      <SubTitle>1.4 Hukuki Sebep</SubTitle>
      <P>
        E-posta adresiniz ve hesap bilgileriniz gibi genel kişisel veriler, KVKK madde 5 kapsamında sözleşmenin
        kurulması ve ifası için işlenir. Sağlık ve yaşam tarzı verileriniz gibi özel nitelikli kişisel veriler ise
        KVKK madde 6 uyarınca <strong>yalnızca açık rızanıza</strong>{" "}dayanılarak işlenir (bkz. aşağıdaki 3. bölüm).
      </P>

      <SubTitle>1.5 Kişisel Verilerin Aktarılması</SubTitle>
      <P>
        Verileriniz, hizmetin verilebilmesi için gerekli olduğu ölçüde bulut barındırma/altyapı sağlayıcımızın
        sunucularında teknik olarak saklanır; sunucu konumu (yurt içi/yurt dışı) netleştiğinde bu metin
        güncellenecektir. Yasal bir zorunluluk bulunması hâlinde yetkili kamu kurum ve kuruluşlarına
        aktarılabilir. Verileriniz hiçbir şekilde <strong>pazarlama/reklam amacıyla üçüncü taraflara satılmaz
        veya paylaşılmaz</strong>.
      </P>

      <SubTitle>1.6 Toplama Yöntemi</SubTitle>
      <P>
        Kişisel verileriniz, uygulamayı kullanırken doğrudan sizin tarafınızdan (kayıt formu, antrenman/beslenme
        kaydı, sohbet vb. aracılığıyla) elektronik ortamda toplanır.
      </P>

      <SubTitle>1.7 Saklama Süresi</SubTitle>
      <P>
        Verileriniz, hesabınız aktif olduğu sürece saklanır. Hesabınızı sildiğinizde (Profil &gt; Hesabımı Sil)
        tüm kişisel verileriniz sistemden kalıcı olarak silinir.
      </P>

      <SubTitle>1.8 Haklarınız (KVKK madde 11)</SubTitle>
      <P>
        Bize başvurarak: (a) kişisel verinizin işlenip işlenmediğini öğrenme, (b) işlenmişse buna ilişkin bilgi
        talep etme, (c) işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, (ç) yurt içinde
        veya yurt dışında aktarıldığı üçüncü kişileri bilme, (d) eksik veya yanlış işlenmişse düzeltilmesini
        isteme, (e) KVKK madde 7&apos;deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme, (f) (d)
        ve (e) kapsamında yapılan işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, (g) münhasıran
        otomatik sistemlerle (ör. yapay zekâ koçun ürettiği öneriler) analiz edilmesi sonucu aleyhinize bir
        sonuç çıkmasına itiraz etme, (ğ) kanuna aykırı işlenme nedeniyle zarara uğramanız hâlinde zararın
        giderilmesini talep etme haklarına sahipsiniz.
      </P>
      <P>
        Bu haklarınızı{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        adresine yazılı olarak başvurarak kullanabilirsiniz. Ayrıca uygulama içinden Profil &gt; Verilerim
        bölümünden tüm verinizi indirebilir, Profil &gt; Hesabımı Sil bölümünden hesabınızı ve tüm verinizi
        kalıcı olarak silebilirsiniz.
      </P>

      <SectionTitle id="acik-riza">2. Genel Kişisel Verilerin İşlenmesine İlişkin Açık Rıza Metni</SectionTitle>
      <P>
        Yukarıdaki Aydınlatma Metni&apos;ni okuduğumu ve anladığımı; e-posta adresim ve hesap bilgilerim dahil
        kişisel verilerimin, PulseCoach tarafından yukarıda açıklanan amaçlarla, KVKK&apos;ya uygun şekilde
        işlenmesine <strong>açık rızam olduğunu</strong>{" "}beyan ederim. Bu rızamı istediğim zaman hesabımı
        silerek veya {CONTACT_EMAIL} adresine yazarak geri çekebileceğimi biliyorum.
      </P>

      <SectionTitle id="saglik-verisi">
        3. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni (Özel Nitelikli Kişisel Veri)
      </SectionTitle>
      <P>
        PulseCoach&apos;u kullanırken paylaşacağım aşağıdaki sağlık ve yaşam tarzı verilerimin — antrenman/egzersiz
        kayıtlarım, beslenme kayıtlarım ve yemek fotoğraflarım, kilo/bel çevresi/vücut yağ oranı gibi vücut
        ölçümlerim, ruh hâli (mood) kayıtlarım ve bu verilere dayanarak yapay zekâ koç ile yaptığım sohbetler —
        KVKK&apos;nın 6. maddesi kapsamında &quot;özel nitelikli kişisel veri&quot; olduğunu biliyorum.
      </P>
      <P>
        Bu verilerin, bana kişiselleştirilmiş antrenman/beslenme takibi ve yapay zekâ koçluk hizmeti sunmak
        amacıyla PulseCoach tarafından işlenmesine <strong>AÇIK RIZAM olduğunu</strong>{" "}beyan ederim.
      </P>
      <P>
        Bu rızayı vermezsem uygulamanın temel işlevlerini (kişiselleştirilmiş koçluk) kullanamayacağımı; rızamı
        istediğim zaman hesabımı kalıcı olarak silerek geri çekebileceğimi ve geri çektiğimde bu verilerin
        sistemden silineceğini biliyorum.
      </P>
    </>
  );
}

function EnContent() {
  return (
    <>
      <SectionTitle id="aydinlatma">1. Privacy Notice</SectionTitle>
      <P>
        Last updated: September 11, 2026. This notice explains, in line with Article 10 of Turkey&apos;s Law No.
        6698 on the Protection of Personal Data (&quot;KVKK&quot;), what personal data is processed while you use
        PulseCoach.
      </P>

      <SubTitle>1.1 Data Controller</SubTitle>
      <P>
        PulseCoach is run by Bora Eren Erdem as an individual, non-commercial project. We act as the &quot;data
        controller&quot; under KVKK. Contact: {" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>

      <SubTitle>1.2 Personal Data We Process</SubTitle>
      <P>
        <strong>Identity/contact:</strong>{" "}your email address.
        <br />
        <strong>Account security:</strong>{" "}your password (stored irreversibly hashed), login attempt records, and
        your IP address (to prevent abuse).
        <br />
        <strong>Health and lifestyle data (special category):</strong>{" "}your workout/exercise records (sets, reps,
        weight, duration), nutrition logs and meal photos, body measurements (weight, waist circumference, body
        fat percentage, etc.), mood logs and check-in messages, and your chat history with the AI coach.
        <br />
        <strong>Usage/technical data:</strong>{" "}your language and theme preference, push notification token, and
        in-app preferences such as goals and coach tone.
      </P>

      <SubTitle>1.3 Purposes of Processing</SubTitle>
      <P>
        Providing personalized workout/nutrition tracking and AI coaching; analyzing your progress (weight,
        training volume, nutrition, mood) to generate feedback and recommendations tailored to you; securing your
        account (authentication, abuse/rate-limit prevention, password resets); sending push notifications if you
        opt in; measuring and improving how the app works.
      </P>

      <SubTitle>1.4 Legal Basis</SubTitle>
      <P>
        General personal data such as your email and account details is processed under KVKK Article 5, for the
        establishment and performance of the service contract. Special category data such as your health and
        lifestyle records is processed <strong>only on the basis of your explicit consent</strong>{" "}under KVKK
        Article 6 (see section 3 below).
      </P>

      <SubTitle>1.5 Data Transfers</SubTitle>
      <P>
        Your data is technically stored on our cloud hosting/infrastructure provider&apos;s servers, to the extent
        necessary to deliver the service; once the server location (domestic/international) is finalized, this
        notice will be updated. Data may be shared with competent public authorities where legally required. Your
        data is <strong>never sold or shared with third parties for marketing or advertising purposes</strong>.
      </P>

      <SubTitle>1.6 How Data Is Collected</SubTitle>
      <P>
        Your personal data is collected electronically, directly from you, while you use the app (via the
        registration form, workout/nutrition logging, chat, etc.).
      </P>

      <SubTitle>1.7 Retention Period</SubTitle>
      <P>
        Your data is retained for as long as your account is active. When you delete your account (Profile &gt;
        Delete My Account), all your personal data is permanently deleted from our systems.
      </P>

      <SubTitle>1.8 Your Rights (KVKK Article 11)</SubTitle>
      <P>
        You may contact us to: (a) learn whether your personal data is being processed, (b) request information
        about it if so, (c) learn the purpose of processing and whether data is used accordingly, (d) know the
        third parties to whom your data is transferred, domestically or abroad, (e) request correction if it is
        incomplete or inaccurate, (f) request erasure or destruction under the conditions of KVKK Article 7, (g)
        request that any correction or erasure under (e) and (f) be notified to third parties your data was
        transferred to, (h) object to a result that is to your detriment arising solely from automated analysis
        of your data (e.g. recommendations generated by the AI coach), and (i) claim compensation for damages
        arising from unlawful processing.
      </P>
      <P>
        You can exercise these rights by writing to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
          {CONTACT_EMAIL}
        </a>
        . You can also download all your data from Profile &gt; My Data, and permanently delete your account and
        all your data from Profile &gt; Delete My Account.
      </P>

      <SectionTitle id="acik-riza">2. General Explicit Consent for Personal Data Processing</SectionTitle>
      <P>
        I confirm that I have read and understood the Privacy Notice above, and I give my{" "}
        <strong>explicit consent</strong>{" "}for my personal data — including my email address and account
        details — to be processed by PulseCoach for the purposes described above, in accordance with KVKK. I
        understand I can withdraw this consent at any time by deleting my account or writing to {CONTACT_EMAIL}.
      </P>

      <SectionTitle id="saglik-verisi">
        3. Explicit Consent for Processing Health Data (Special Category Personal Data)
      </SectionTitle>
      <P>
        I understand that the following health and lifestyle data I will share while using PulseCoach — my
        workout/exercise records, my nutrition logs and meal photos, body measurements such as weight/waist
        circumference/body fat percentage, my mood logs, and my chats with the AI coach based on this data —
        qualifies as &quot;special category personal data&quot; under Article 6 of KVKK.
      </P>
      <P>
        I confirm that I give my <strong>EXPLICIT CONSENT</strong>{" "}for this data to be processed by PulseCoach
        for the purpose of providing me with personalized workout/nutrition tracking and AI coaching.
      </P>
      <P>
        I understand that without this consent I will not be able to use the app&apos;s core functionality
        (personalized coaching); that I can withdraw this consent at any time by permanently deleting my
        account; and that doing so will delete this data from the system.
      </P>
    </>
  );
}

export default function KvkkPage() {
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
            {language === "tr" ? "Gizlilik ve KVKK" : "Privacy & KVKK"}
          </h1>
        </div>

        <Card>{language === "tr" ? <TrContent /> : <EnContent />}</Card>
      </div>
    </div>
  );
}
