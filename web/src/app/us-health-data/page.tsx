"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { LegalLayout } from "@/components/landing/LegalLayout";

// ABD Tüketici Sağlık Verisi Gizlilik Politikası (2026-10-21, ABD yayını). Washington
// My Health My Data Act (RCW 19.373.020) bu politikanın AYRI bir sayfa olmasını ve ana
// sayfada ayrı bir bağlantıyla yayınlanmasını istiyor; içerik yalnız yasaların istediği
// maddeler (Başsavcılık SSS'i). İçerik tools/legal_texts/'ten üretilir; /terms ile aynı
// sayfa deseni. Auth-korumalı (app) grubunun DIŞINDA - kayıt öncesi ve sonrası erişilebilir.
// Dil: language-context INDEXED_PATHS'te değil, tarayıcı diline göre açılır (ABD'de EN).

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-24 border-t border-[var(--l-line)] pt-8 text-[22px] font-bold leading-tight tracking-tight text-[var(--l-ink)] [font-family:var(--font-outfit)] first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-7 text-[var(--l-muted)] [&_strong]:text-[var(--l-ink)]">{children}</p>;
}

function TrContent() {
  return (
    <>
      <P>Yürürlük tarihi: 21 Ekim 2026. Bu Tüketici Sağlık Verisi Gizlilik Politikası, ABD eyaletlerinin tüketici sağlık verisi yasalarıyla korunan kullanıcılar için geçerlidir; bunlar arasında Washington&apos;ın My Health My Data Act yasası (RCW 19.373), Nevada&apos;nın tüketici sağlık verisi yasası (NRS Bölüm 603A, SB 370) ve Connecticut Veri Gizliliği Yasası&apos;nın tüketici sağlık verisi hükümleri bulunur. Bora Eren Erdem (&quot;biz&quot;) tarafından işletilen PulseCoach&apos;un tüketici sağlık verilerinizi nasıl topladığını, kullandığını ve paylaştığını ve haklarınızı nasıl kullanabileceğinizi açıklar. Genel gizlilik metnimiz: <Link href="/kvkk" className="font-medium text-[var(--l-link)] underline underline-offset-2">Gizlilik ve KVKK</Link>. İngilizce metin esastır.</P>
      <SectionTitle id="categories">1. Topladığımız Tüketici Sağlık Verileri ve Amaçları</SectionTitle>
      <P>Şu tüketici sağlık verisi kategorilerini toplarız:<br />• <strong>Egzersiz ve antrenman verileri:</strong> kaydettiğiniz antrenmanlar, egzersizler, setler, tekrarlar, ağırlıklar, süreler ve kardiyo.<br />• <strong>Beslenme verileri:</strong> kaydettiğiniz öğünler ve besinler, porsiyonlar, kalori ve besin değerleri ile yüklediğiniz yemek fotoğrafları.<br />• <strong>Vücut ölçümleri:</strong> kilo, boy, bel çevresi ve vücut yağ oranı.<br />• <strong>Sağlıkla ilgili profil bilgileri:</strong> hedefleriniz (ör. kilo vermek), aktivite seviyeniz, beslenme kısıtlamalarınız ve alerjileriniz ile kalori ihtiyacınızı tahmin etmek için kullanılan cinsiyetiniz ve doğum yılınız.<br />• <strong>Ruh hâli verileri:</strong> kaydettiğiniz ruh hâlleri.<br />• <strong>Yapay zeka koç sohbetleri:</strong> koça gönderdiğiniz ve paylaşmayı seçtiğiniz sağlık bilgilerini içerebilen mesajlar ile koçun yanıtları.<br />• <strong>Çıkarımlar:</strong> kendi yapay zeka modellerimizin yukarıdaki verilerden ürettiği kalori ve besin önerileri, ilerleme analizleri, içgörüler ve koç mesajları.</P>
      <P>Bu verileri yalnızca talep ettiğiniz özellikleri sunmak için kullanırız: antrenman, beslenme, ölçüm ve ruh hâli kayıtlarınızı tutmak ve göstermek; kalori ve besin önerilerinizi ve ilerlemenizi hesaplamak; yapay zeka koç aracılığıyla size özel geri bildirim, özet ve öneri sunmak; yemek fotoğraflarınızdaki besinleri tanımak; hesabınızı korumak ve kötüye kullanımı önlemek; taleplerinizi yanıtlamak ve yasalara uymak. Tüketici sağlık verilerini reklam veya pazarlama için kullanmayız, satmayız ve yapay zeka modellerini eğitmek için kullanmayız.</P>
      <SectionTitle id="sources">2. Tüketici Sağlık Verilerinin Kaynakları</SectionTitle>
      <P>Tüketici sağlık verilerini, uygulamayı veya web sitesini kullanırken <strong>doğrudan sizden</strong> toplarız (formlar, kayıt ekranları, sohbet ve fotoğraf yükleme). Çıkarımlar, sunucumuzda çalışan <strong>kendi yapay zeka modellerimiz</strong> tarafından verdiğiniz verilerden üretilir. Veri simsarları, reklam ağları veya başka uygulamalar gibi kaynaklardan tüketici sağlık verisi almayız. Apple veya Google ile giriş yaparsanız bu sağlayıcılar yalnızca e-posta adresinizi ve hesap kimliğinizi iletir; bunlar tüketici sağlık verisi değildir.</P>
      <SectionTitle id="sharing">3. Tüketici Sağlık Verilerinin Paylaşılması</SectionTitle>
      <P><strong>Tüketici sağlık verilerini satmayız ve üçüncü taraflarla veya iştiraklerle paylaşmayız.</strong> İştirakimiz yoktur. Bu nedenle paylaştığımız bir tüketici sağlık verisi kategorisi ve veri paylaştığımız bir üçüncü taraf veya iştirak bulunmaz.</P>
      <P>Verileriniz, adımıza veri işleyen olarak hizmet veren <strong>Cloudvist Bilişim Teknolojileri (İstanbul, Türkiye)</strong> tarafından barındırılan Türkiye&apos;deki sunucumuzda saklanır ve işlenir. <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> adresine yazmayı seçerseniz e-postanız, yine veri işleyen olarak hizmet veren e-posta sağlayıcımız <strong>Uzman Posta (Pusula İletişim, İstanbul, Türkiye)</strong> üzerinden geçer. Veri işleyenler verileri yalnızca talimatlarımız doğrultusunda ve bize hizmet sunmak için işleyebilir. Verileri bir kamu makamına veya mahkemeye yalnızca yasal zorunluluk hâlinde açıklayabiliriz.</P>
      <SectionTitle id="tracking">4. Üçüncü Tarafların Veri Toplaması</SectionTitle>
      <P>PulseCoach&apos;u kullanırken üçüncü tarafların tüketici sağlık verilerinizi zaman içinde ve farklı web siteleri veya çevrim içi hizmetler arasında toplamasına izin vermeyiz. Uygulamada ve web sitesinde reklam, analitik veya izleme aracı yoktur.</P>
      <SectionTitle id="rights">5. Haklarınız ve Nasıl Kullanacağınız</SectionTitle>
      <P>Yaşadığınız eyalete göre şu haklara sahipsiniz:<br />• <strong>Teyit ve erişim:</strong> tüketici sağlık verilerinizi toplayıp toplamadığımızı, paylaşıp paylaşmadığımızı veya satıp satmadığımızı öğrenmek ve bu verilere erişmek; buna verileri paylaştığımız veya sattığımız tüm üçüncü taraf ve iştiraklerin listesi ve iletişim bilgileri dahildir (verileri paylaşmadığımız ve satmadığımız için bu liste boştur).<br />• <strong>Rızayı geri çekme:</strong> tüketici sağlık verilerinizin toplanmasına ve paylaşılmasına verdiğiniz rızayı geri çekmek.<br />• <strong>Silme:</strong> tüketici sağlık verilerinizin silinmesini istemek.<br />Bu hakları kullandığınız için size ayrımcılık yapmayız.</P>
      <P><strong>Talep nasıl yapılır:</strong> Çoğu talebi doğrudan uygulamada tamamlayabilirsiniz: Profil &gt; Verilerim bölümünden tüm verilerinizi indirebilir, Profil &gt; Hesabımı Sil bölümünden hesabınızı ve verilerinizi kalıcı olarak silebilirsiniz. Ayrıca uygulamaya kayıtlı e-posta adresinizden &quot;Consumer Health Data Request&quot; konulu bir e-postayı <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> adresine gönderebilirsiniz. Verilerinizi korumak için talebin kayıtlı e-posta adresinizden geldiğini doğrularız; doğrulayamazsak ek bilgi isteyebiliriz. Talepte bulunmak için hesap oluşturmanız gerekmez; hesabınız yoksa sizinle ilgili tüketici sağlık verisi tutmayız.</P>
      <P>Talebinizi aldıktan sonra 45 gün içinde yanıtlarız. Daha fazla süre gerekirse bu süreyi bir kez daha 45 gün uzatabiliriz ve nedenini ilk 45 gün içinde size bildiririz. Talepler yılda iki defaya kadar ücretsizdir. Verilerinizi sildiğimizde canlı sistemlerimizden derhal, yedeklerimizden 30 gün içinde kaldırılır ve veri işleyenlerimize de silmeleri talimatını veririz.</P>
      <P><strong>İtiraz:</strong> Talebinizi reddedersek, kararımıza yanıt vererek veya &quot;Appeal&quot; konulu bir e-postayı <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> adresine göndererek itiraz edebilirsiniz. İtirazınızı 45 gün içinde, yapılan veya yapılmayan işlemi ve nedenini açıklayarak yazılı olarak yanıtlarız. İtirazınızı reddedersek eyaletinizin Başsavcılığına şikâyette bulunabilirsiniz; Washington&apos;da yaşayanlar bunu atg.wa.gov/file-complaint adresinden yapabilir.</P>
      <SectionTitle id="consent">6. Rıza ve Rızanın Geri Çekilmesi</SectionTitle>
      <P>Tüketici sağlık verilerini talep ettiğiniz hizmetleri sunmak için toplar ve kullanırız. Buna ek olarak, hesap oluştururken sağlık verilerinizin işlenmesi için ayrı ve açık rızanızı isteriz; bu rıza Kullanım Koşulları&apos;nın bir parçası değildir. Rızanızı dilediğiniz zaman Profil &gt; Hesabımı Sil bölümünden hesabınızı silerek veya <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> adresine yazarak geri çekebilirsiniz. Geri çekme ileriye dönük toplamayı durdurur ve sağlık verileriniz silinir; koçluk özellikleri bu verilere dayandığı için geri çektiğinizde sona erer. Bu politikayı güncellemeden ve rızanızı almadan yeni tüketici sağlık verisi kategorileri toplamayız, verileri yeni amaçlarla kullanmayız veya paylaşmayız.</P>
      <SectionTitle id="changes">7. Değişiklikler ve İletişim</SectionTitle>
      <P>Bu politikayı değiştirirsek yukarıdaki yürürlük tarihini güncelleriz ve önemli değişiklikleri yürürlüğe girmeden önce uygulama içinden duyururuz. Bu politikayla ilgili sorularınız için: <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
    </>
  );
}

function EnContent() {
  return (
    <>
      <P>Effective date: October 21, 2026. This Consumer Health Data Privacy Policy applies to consumers protected by U.S. state consumer health data laws, including Washington&apos;s My Health My Data Act (RCW 19.373), Nevada&apos;s consumer health data law (NRS Chapter 603A, SB 370) and the consumer health data provisions of the Connecticut Data Privacy Act. It explains how PulseCoach, operated by Bora Eren Erdem (&quot;we&quot;), collects, uses and shares your consumer health data and how you can exercise your rights. Our general privacy notice is available at <Link href="/kvkk?lang=en" className="font-medium text-[var(--l-link)] underline underline-offset-2">Privacy &amp; KVKK</Link>.</P>
      <SectionTitle id="categories">1. Consumer Health Data We Collect and Why</SectionTitle>
      <P>We collect the following categories of consumer health data:<br />• <strong>Fitness and exercise data:</strong> workouts, exercises, sets, repetitions, weights, durations and cardio sessions you log.<br />• <strong>Nutrition data:</strong> meals and foods you log, portions, calories and nutrients, and meal photos you upload.<br />• <strong>Body measurements:</strong> weight, height, waist circumference and body fat percentage.<br />• <strong>Health-related profile information:</strong> your goals (such as losing weight), activity level, dietary restrictions and allergies, and your sex and birth year, which are used to estimate your calorie needs.<br />• <strong>Mood data:</strong> the moods you record.<br />• <strong>AI coach conversations:</strong> messages you send to the AI coach, which may contain health information you choose to share, and the coach&apos;s replies.<br />• <strong>Inferences:</strong> calorie and nutrient recommendations, progress analyses, insights and coach messages that our own AI models derive from the data above.</P>
      <P>We use this data only to provide the features you request: to record and display your workouts, nutrition, measurements and moods; to calculate calorie and nutrient recommendations and progress; to give you personalized feedback, summaries and suggestions through the AI coach; to recognize foods in your meal photos; to keep your account secure and prevent abuse; and to respond to your requests and comply with the law. We do not use consumer health data for advertising or marketing, we do not sell it, and we do not use it to train AI models.</P>
      <SectionTitle id="sources">2. Sources of Consumer Health Data</SectionTitle>
      <P>We collect consumer health data <strong>directly from you</strong> when you use the app or website (forms, logging screens, chat and photo uploads). Inferences are <strong>derived by our own AI models</strong>, which run on our server, from the data you provide. We do not obtain consumer health data from other sources such as data brokers, advertising networks or other apps. If you sign in with Apple or Google, they provide only your email address and account identifier, which are not consumer health data.</P>
      <SectionTitle id="sharing">3. Sharing of Consumer Health Data</SectionTitle>
      <P><strong>We do not sell consumer health data, and we do not share it with third parties or affiliates.</strong> We have no affiliates. Accordingly, there are no categories of consumer health data that we share and no third parties or affiliates with whom we share it.</P>
      <P>Your data is stored and processed on our server in Turkey, which is hosted by <strong>Cloudvist Bilişim Teknolojileri (Istanbul, Turkey)</strong> acting as a processor on our behalf. If you choose to write to <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a>, your email passes through our email service provider <strong>Uzman Posta (Pusula İletişim, Istanbul, Turkey)</strong>, also acting as a processor. Processors may process data only on our instructions and to provide their services to us. We may disclose data to a government authority or court only where required by law.</P>
      <SectionTitle id="tracking">4. Collection by Third Parties</SectionTitle>
      <P>We do not allow third parties to collect your consumer health data over time and across different websites or online services when you use PulseCoach. The app and website contain no advertising, analytics or tracking tools.</P>
      <SectionTitle id="rights">5. Your Rights and How to Exercise Them</SectionTitle>
      <P>Depending on your state, you have the right to:<br />• <strong>Confirm and access:</strong> confirm whether we collect, share or sell your consumer health data and access that data, including a list of all third parties and affiliates with whom we have shared or sold it and their contact information (we do not share or sell it, so this list is empty).<br />• <strong>Withdraw consent:</strong> withdraw your consent to the collection and sharing of your consumer health data.<br />• <strong>Delete:</strong> have your consumer health data deleted.<br />We will not discriminate against you for exercising these rights.</P>
      <P><strong>How to make a request:</strong> Most requests can be completed directly in the app: download all your data from Profile &gt; My Data, and permanently delete your account and data from Profile &gt; Delete My Account. You can also email <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> with the subject &quot;Consumer Health Data Request&quot; from the email address registered in the app. To protect your data, we verify a request by confirming it came from your registered email address and may ask for additional information if we cannot verify it. You do not need to create an account to make a request; if you have no account, we hold no consumer health data about you.</P>
      <P>We respond within 45 days of receiving your request. If we need more time, we may extend this once by another 45 days and will tell you why within the first 45 days. Requests are free of charge up to twice a year. When we delete your data, it is removed from our live systems immediately and from our backups within 30 days, and we instruct our processors to delete it as well.</P>
      <P><strong>Appeals:</strong> If we decline your request, you can appeal by replying to our decision or emailing <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a> with the subject &quot;Appeal&quot;. We will respond in writing within 45 days, explaining any action taken or not taken and why. If we deny your appeal, you can submit a complaint to your state Attorney General; Washington residents can do so at atg.wa.gov/file-complaint.</P>
      <SectionTitle id="consent">6. Consent and Withdrawal</SectionTitle>
      <P>We collect and use consumer health data to provide the services you request. In addition, when you create an account we ask for your separate, explicit consent to process your health data; this consent is not part of the Terms of Service. You can withdraw it at any time by deleting your account in Profile &gt; Delete My Account or by emailing <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a>. Withdrawal stops future collection and your health data is deleted; because the coaching features depend on this data, they end when you withdraw. We will not collect new categories of consumer health data, use it for new purposes or share it without first updating this policy and obtaining your consent.</P>
      <SectionTitle id="changes">7. Changes and Contact</SectionTitle>
      <P>If we change this policy, we will update the effective date above and announce material changes in the app before they take effect. Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[var(--l-link)] underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
    </>
  );
}

export default function UsHealthDataPage() {
  const { language } = useLanguage();

  return (
    <LegalLayout
      title={language === "tr" ? "ABD Tüketici Sağlık Verisi Gizlilik Politikası" : "Consumer Health Data Privacy Policy"}
      intro={
        language === "tr"
          ? "ABD'de yaşıyorsan sağlık verilerinin nasıl toplandığı, kullanıldığı ve paylaşıldığı ile haklarını nasıl kullanacağın."
          : "For U.S. residents: how your health data is collected, used and shared, and how to exercise your rights."
      }
    >
      {language === "tr" ? <TrContent /> : <EnContent />}
    </LegalLayout>
  );
}
