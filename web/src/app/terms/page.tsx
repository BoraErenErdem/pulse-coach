"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { Card } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandLogo";

// Kullanım Koşulları (2026-09-14; 2026-10-05 revizyonu, içerik tools/legal_texts/'ten üretilir).
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

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-6 scroll-mt-24 text-lg font-semibold text-zinc-900 first:mt-0 dark:text-zinc-50">
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
      <P>Son güncelleme: 5 Ekim 2026. Bu Kullanım Koşulları (&quot;Koşullar&quot;), PulseCoach&apos;u (&quot;Uygulama&quot;) kullanan herkes (&quot;Kullanıcı&quot;, &quot;siz&quot;) ile Uygulamayı işleten Bora Eren Erdem (&quot;biz&quot;) arasındaki ilişkiyi düzenler. Kişisel verilerinizin nasıl işlendiği <Link href="/kvkk" className="text-accent underline underline-offset-2">Gizlilik ve KVKK</Link> metninde açıklanmıştır.</P>
      <SectionTitle id="kabul">1. Taraflar ve Kabul</SectionTitle>
      <P>PulseCoach, gerçek kişi Bora Eren Erdem tarafından bireysel ve ticari kâr amacı gütmeyen bir proje olarak işletilmektedir. Hesap oluştururken bu Koşulları onaylayarak ya da Uygulamayı kullanarak Koşulları okuduğunuzu ve kabul ettiğinizi beyan edersiniz. Koşulları kabul etmiyorsanız Uygulamayı kullanmamalısınız.</P>
      <SectionTitle id="hizmet">2. Hizmetin Tanımı</SectionTitle>
      <P>PulseCoach; antrenman, beslenme, ruh hâli ve vücut ölçümü takibi ile bu verilere dayanan, yapay zekâ destekli kişiselleştirilmiş öneriler sunan bir mobil ve web uygulamasıdır. Yapay zekâ koç ve yemek fotoğrafı analizi, Türkiye&apos;deki sunucumuzda çalışan açık kaynaklı modellerle yapılır. Yapay zekâ <strong>hata yapabilir</strong>: kalori, makro, egzersiz ve fotoğraftan tahmin edilen miktarlar yaklaşıktır; kayıtlarınızı kontrol etmeniz ve önemli kararları yalnızca bu çıktılara dayandırmamanız gerekir.</P>
      <SectionTitle id="uygunluk">3. Uygunluk ve Hesap</SectionTitle>
      <P>Uygulamayı kullanmak için <strong>en az 18 yaşında</strong> olmanız gerekir. Hesap oluştururken doğru bilgi vermeyi, şifrenizi gizli tutmayı ve hesabınızda gerçekleşen işlemlerden sorumlu olduğunuzu kabul edersiniz. Her kişi yalnızca kendi adına hesap açabilir. Yetkisiz bir kullanım fark ederseniz bizi <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresinden bilgilendirmelisiniz.</P>
      <SectionTitle id="tibbi-sorumluluk-reddi">4. Tıbbi Sorumluluk Reddi</SectionTitle>
      <Highlight>PulseCoach bir tıbbi cihaz, teşhis aracı veya sağlık hizmeti sağlayıcısı <strong>değildir</strong> ve bu amaçlarla kullanılmamalıdır. Yapay zekâ koçun antrenman, beslenme ve yaşam tarzı önerileri yalnızca genel bilgilendirme amaçlıdır; bir hekimin, diyetisyenin, fizyoterapistin veya psikoloğun tavsiyesinin, teşhisinin veya tedavisinin <strong>yerine geçmez</strong>. Kalori önerisi genel bir formüle dayanan bir tahmindir. Bir egzersiz veya beslenme programına başlamadan önce, özellikle mevcut bir hastalığınız, sakatlığınız, hamileliğiniz, yeme bozukluğu öykünüz veya kronik bir rahatsızlığınız varsa hekiminize danışın. Kendinizi kötü hissediyorsanız, kendinize zarar verme düşünceleriniz varsa veya acil bir durumdaysanız derhal <strong>112</strong>&apos;yi arayın ya da en yakın sağlık kuruluşuna başvurun. Önerileri uygulayıp uygulamamak sizin kararınızdır.</Highlight>
      <SectionTitle id="kullanici-yukumlulukleri">5. Kullanıcı Yükümlülükleri</SectionTitle>
      <P>Uygulamayı yalnızca hukuka uygun amaçlarla ve bu Koşullara uygun şekilde kullanacağınızı kabul edersiniz. Özellikle: Uygulamanın güvenliğini aşmaya, sistemleri aşırı yüklemeye veya otomatik araçlarla veri toplamaya çalışmamayı; yapay zekâ koçu zararlı, yasa dışı veya başkalarını hedef alan içerik üretmeye yönlendirmemeyi; başkalarına ait kişisel verileri, özellikle başka kişilerin yüzlerini içeren fotoğrafları yüklememeyi ve günlük kullanım sınırlarını aşmaya yönelik girişimlerde bulunmamayı kabul edersiniz.</P>
      <SectionTitle id="icerik">6. Kullanıcı İçeriği</SectionTitle>
      <P>Girdiğiniz kayıtlar, sohbetler ve fotoğraflar size aittir; bunları Profil &gt; Verilerim bölümünden indirebilirsiniz. Hizmeti sunabilmemiz için bu içerikleri yalnızca Uygulamanın işleyişi kapsamında ve <Link href="/kvkk" className="text-accent underline underline-offset-2">Gizlilik ve KVKK</Link> metnine uygun olarak saklama ve işleme iznini bize vermiş olursunuz. İçerikleriniz yapay zekâ modellerini eğitmek, reklam veya pazarlama amacıyla kullanılmaz.</P>
      <SectionTitle id="ucretlendirme">7. Ücretlendirme</SectionTitle>
      <P>Uygulama tamamen ücretsizdir; uygulama içi satın alma veya abonelik yoktur. İleride ücretli bir özellik eklenirse bu açıkça duyurulur ve açık onayınız olmadan sizden ücret alınmaz.</P>
      <SectionTitle id="fikri-mulkiyet">8. Fikri Mülkiyet</SectionTitle>
      <P>Uygulamanın yazılımı, tasarımı, &quot;PulseCoach&quot; adı ve logosu Bora Eren Erdem&apos;e aittir. Uygulamayı izinsiz kopyalayamaz, değiştiremez, tersine mühendislik yapamaz veya ticari amaçla dağıtamazsınız. Uygulamada kullanılan açık kaynaklı bileşenler ve veri setleri (ör. besin ve egzersiz katalogları) kendi lisanslarına tabidir.</P>
      <SectionTitle id="garanti-reddi">9. Hizmetin Sınırları, Süresi ve Garanti Reddi</SectionTitle>
      <P>PulseCoach, bireysel bir geliştirici tarafından yürütülen ve sınırlı bir süre için sunulabilecek bir projedir. Uygulama &quot;olduğu gibi&quot; ve &quot;mevcut olduğu ölçüde&quot; sunulur; kesintisiz veya hatasız çalışacağı ve yapay zekâ çıktılarının her zaman doğru olacağı garanti edilmez. Bakım veya teknik sorunlar nedeniyle Uygulama zaman zaman erişilemez olabilir. Hizmeti tamamen sonlandırmamız hâlinde bunu <strong>en az 30 gün önceden</strong> uygulama içinden ve kayıtlı e-posta adresinize duyurur, verilerinizi indirmeniz için süre tanır ve süre sonunda tüm kişisel verileri sileriz.</P>
      <SectionTitle id="sorumluluk-sinirlamasi">10. Sorumluluğun Sınırlandırılması</SectionTitle>
      <P>Yürürlükteki mevzuatın izin verdiği ölçüde, Uygulamanın kullanımından veya kullanılamamasından doğan dolaylı zararlardan sorumlu değiliz. Bu sınırlama, kasıt veya ağır ihmalden, kişisel verilerin hukuka aykırı işlenmesinden ya da kanunen sınırlandırılamayan hâllerden doğan sorumluluğu ortadan kaldırmaz ve tüketici olarak kanundan doğan haklarınızı etkilemez.</P>
      <SectionTitle id="hesap-sonlandirma">11. Hesabın Sonlandırılması</SectionTitle>
      <P>Hesabınızı dilediğiniz zaman Profil &gt; Hesabımı Sil bölümünden kalıcı olarak silebilirsiniz. Bu Koşulları ağır şekilde ihlal etmeniz hâlinde hesabınızı, mümkünse önceden bildirimde bulunarak, askıya alabilir veya kapatabiliriz; bu durumda da verilerinizi indirme talebiniz karşılanır.</P>
      <SectionTitle id="degisiklikler">12. Değişiklikler</SectionTitle>
      <P>Bu Koşulları güncelleyebiliriz. Güncelleme tarihi bu sayfanın başında belirtilir; önemli değişiklikler yürürlüğe girmeden önce uygulama içinden duyurulur. Değişikliği kabul etmiyorsanız hesabınızı silerek sözleşmeyi sona erdirebilirsiniz.</P>
      <SectionTitle id="app-store">13. Apple App Store</SectionTitle>
      <P>Uygulamayı Apple App Store&apos;dan indirdiyseniz: bu Koşullar Apple ile değil, sizinle Bora Eren Erdem arasındadır ve Uygulamadan ve içeriğinden Apple değil biz sorumluyuz. Apple&apos;ın Uygulama için bakım veya destek yükümlülüğü yoktur. Uygulamanın herhangi bir garantiye uymaması hâlinde Apple&apos;a bildirebilirsiniz; Apple varsa satın alma bedelini iade eder (Uygulama ücretsizdir) ve kanunun izin verdiği ölçüde başka bir garanti yükümlülüğü yoktur. Uygulamayla ilgili ürün sorumluluğu, mevzuata uygunluk, tüketici koruma ve fikri mülkiyet ihlali talepleri Apple&apos;a değil bize yöneltilmelidir. Uygulamayı App Store Kullanım Kurallarına uygun kullanmanız gerekir. Apple ve iştirakleri bu Koşulların üçüncü taraf lehtarıdır ve bu Koşulları size karşı uygulama hakkına sahiptir.</P>
      <SectionTitle id="uygulanacak-hukuk">14. Uygulanacak Hukuk ve Uyuşmazlıklar</SectionTitle>
      <P>Bu Koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri ve icra daireleri yetkilidir; tüketici olarak tüketici hakem heyetlerine ve tüketici mahkemelerine başvuru hakkınız saklıdır.</P>
      <SectionTitle id="iletisim">15. İletişim</SectionTitle>
      <P>Sorularınız ve talepleriniz için <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresinden bize ulaşabilirsiniz.</P>
    </>
  );
}

function EnContent() {
  return (
    <>
      <P>Last updated: October 5, 2026. These Terms of Service (&quot;Terms&quot;) govern the relationship between everyone who uses PulseCoach (the &quot;App&quot;) (&quot;User&quot;, &quot;you&quot;) and Bora Eren Erdem, who operates the App (&quot;we&quot;). How your personal data is processed is explained in the <Link href="/kvkk" className="text-accent underline underline-offset-2">Privacy &amp; KVKK</Link> notice.</P>
      <SectionTitle id="kabul">1. Parties and Acceptance</SectionTitle>
      <P>PulseCoach is operated by Bora Eren Erdem, a natural person, as an individual, non-commercial project. By accepting these Terms when you create an account, or by using the App, you confirm that you have read and agree to them. If you do not agree, you must not use the App.</P>
      <SectionTitle id="hizmet">2. Description of the Service</SectionTitle>
      <P>PulseCoach is a mobile and web app that tracks workouts, nutrition, mood and body measurements and provides AI-assisted personalized recommendations based on that data. The AI coach and meal photo analysis run on open-source models hosted on our server in Turkey. AI <strong>can make mistakes</strong>: calories, macros, exercises and amounts estimated from photos are approximate; you should check your records and not base important decisions on these outputs alone.</P>
      <SectionTitle id="uygunluk">3. Eligibility and Your Account</SectionTitle>
      <P>You must be <strong>at least 18 years old</strong> to use the App. When creating an account you agree to provide accurate information, keep your password confidential and be responsible for activity under your account. Each person may only create an account for themselves. If you notice unauthorized use, notify us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
      <SectionTitle id="tibbi-sorumluluk-reddi">4. Medical Disclaimer</SectionTitle>
      <Highlight>PulseCoach is <strong>not</strong> a medical device, a diagnostic tool or a healthcare provider and must not be used for these purposes. The AI coach&apos;s workout, nutrition and lifestyle recommendations are for general information only and do <strong>not</strong> replace the advice, diagnosis or treatment of a physician, dietitian, physical therapist or psychologist. The calorie suggestion is an estimate based on a general formula. Before starting an exercise or nutrition program, consult your physician, especially if you have an existing condition, injury, pregnancy, a history of eating disorders or a chronic illness. If you feel unwell, have thoughts of harming yourself or are in an emergency, call your local emergency number (<strong>112</strong> in Turkey) immediately or go to the nearest medical facility. Whether you follow the recommendations is your decision.</Highlight>
      <SectionTitle id="kullanici-yukumlulukleri">5. User Obligations</SectionTitle>
      <P>You agree to use the App only for lawful purposes and in line with these Terms. In particular, you agree not to try to breach the App&apos;s security, overload its systems or scrape data with automated tools; not to steer the AI coach into producing harmful, unlawful or targeted content; not to upload other people&apos;s personal data, especially photos showing other people&apos;s faces; and not to try to circumvent daily usage limits.</P>
      <SectionTitle id="icerik">6. Your Content</SectionTitle>
      <P>The logs, chats and photos you enter belong to you; you can download them from Profile &gt; My Data. So that we can provide the service, you allow us to store and process this content only for the App&apos;s operation and in line with the <Link href="/kvkk" className="text-accent underline underline-offset-2">Privacy &amp; KVKK</Link> notice. Your content is not used to train AI models or for advertising or marketing.</P>
      <SectionTitle id="ucretlendirme">7. Pricing</SectionTitle>
      <P>The App is entirely free; there are no in-app purchases or subscriptions. If a paid feature is added in the future, it will be clearly announced and you will not be charged without your explicit approval.</P>
      <SectionTitle id="fikri-mulkiyet">8. Intellectual Property</SectionTitle>
      <P>The App&apos;s software, design, the &quot;PulseCoach&quot; name and logo belong to Bora Eren Erdem. You may not copy, modify, reverse-engineer or commercially distribute the App without permission. Open-source components and datasets used in the App (e.g. food and exercise catalogs) are subject to their own licenses.</P>
      <SectionTitle id="garanti-reddi">9. Service Limitations, Duration and Disclaimer</SectionTitle>
      <P>PulseCoach is a project run by an individual developer and may be offered for a limited time. The App is provided &quot;as is&quot; and &quot;as available&quot;; we do not guarantee that it will be uninterrupted or error-free or that AI outputs will always be accurate. The App may occasionally be unavailable due to maintenance or technical issues. If we discontinue the service entirely, we will announce it <strong>at least 30 days in advance</strong> in the app and to your registered email address, give you time to download your data, and delete all personal data at the end of that period.</P>
      <SectionTitle id="sorumluluk-sinirlamasi">10. Limitation of Liability</SectionTitle>
      <P>To the extent permitted by applicable law, we are not liable for indirect damages arising from your use of or inability to use the App. This limitation does not exclude liability for intent or gross negligence, for unlawful processing of personal data or in cases where liability cannot be limited by law, and it does not affect your statutory rights as a consumer.</P>
      <SectionTitle id="hesap-sonlandirma">11. Account Termination</SectionTitle>
      <P>You can permanently delete your account at any time from Profile &gt; Delete My Account. If you seriously violate these Terms, we may suspend or close your account, with prior notice where possible; even then, your request to download your data will be honored.</P>
      <SectionTitle id="degisiklikler">12. Changes</SectionTitle>
      <P>We may update these Terms. The update date is shown at the top of this page; material changes are announced in the app before they take effect. If you do not accept a change, you can end the agreement by deleting your account.</P>
      <SectionTitle id="app-store">13. Apple App Store</SectionTitle>
      <P>If you downloaded the App from the Apple App Store: these Terms are between you and Bora Eren Erdem, not Apple, and we, not Apple, are responsible for the App and its content. Apple has no obligation to provide maintenance or support for the App. If the App fails to conform to any warranty, you may notify Apple, and Apple will refund the purchase price, if any (the App is free); to the extent permitted by law, Apple has no other warranty obligation. Product liability, regulatory compliance, consumer protection and intellectual property claims relating to the App must be directed to us, not Apple. You must use the App in compliance with the App Store usage rules. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.</P>
      <SectionTitle id="uygulanacak-hukuk">14. Governing Law and Disputes</SectionTitle>
      <P>These Terms are governed by the laws of the Republic of Turkey. The courts and enforcement offices of the Republic of Turkey have jurisdiction over disputes; your right as a consumer to apply to consumer arbitration committees and consumer courts is reserved.</P>
      <SectionTitle id="iletisim">15. Contact</SectionTitle>
      <P>You can reach us with questions and requests at <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
    </>
  );
}

export default function TermsPage() {
  const { language } = useLanguage();

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <BackLink />
          <div className="flex gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <BrandMark size={26} className="text-accent" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {language === "tr" ? "Kullanım Koşulları" : "Terms of Service"}
          </h1>
        </div>

        <Card>{language === "tr" ? <TrContent /> : <EnContent />}</Card>
      </div>
    </div>
  );
}
