"use client";

import { useLanguage } from "@/lib/language-context";
import { Card } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandLogo";

// KVKK Aydınlatma Metni + Açık Rıza Metinleri (ilk sürüm 2026-09-11,
// 2026-09-14'te benzer sağlık/fitness uygulamalarının KVKK metinleri
// araştırılıp gözden geçirildi - eklenenler: 1.5'e somut alıcı kategorileri
// + yapay zekânın self-hosted olduğu netliği, 1.6 Veri Güvenliği Tedbirleri,
// 1.9 Çerezler/Yerel Depolama, 1.10 Yaş Sınırı, 1.11'e başvuru usulü (30 gün)
// + Kurul'a şikâyet hakkı, 1.12 Metin Güncellemeleri, 3. bölüme tıbbi tavsiye
// yerine geçmediği notu (bkz. yeni /terms sayfası)).
// mobile/app/kvkk.tsx'in web portu - AYNI TR/EN içerik, üç bölüm de aynı
// anchor id'lerini taşıyor ki login sayfasındaki checkbox linkleri her iki
// platformda da aynı davransın. Auth-korumalı (app) grubunun DIŞINDA, üst
// seviye bir route: hem kayıt öncesi (login ekranından) hem kayıt sonrası
// (Profil > Gizlilik ve KVKK) erişilebilir olması gerekiyor - KVKK'nın
// "aydınlatma her zaman ulaşılabilir olmalı" ilkesi tek bir korumasız route
// ile ikisini birden karşılıyor.
//
// 2026-10-05 revizyonu (barındırma: Cloudvist, Türkiye): sunucu, yedek ve e-posta
// Türkiye'de; yurt dışına yalnız push (jenerik metin + jeton, Expo/Apple-Google)
// gidiyor. "Genel açık rıza" bölümü kaldırıldı - aydınlatma ile açık rıza aynı
// onayla alınamaz (Kurul 2018/90, Aydınlatma Tebliği md. 5/1-f) ve genel veriler
// zaten sözleşmenin ifası dayanağıyla işleniyor. İçerik tools/legal_texts/'ten
// üretilir; alıcı/kapsam değişirse user_service.CONSENT_VERSION artırılır.

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-6 scroll-mt-24 text-lg font-semibold text-zinc-900 first:mt-0 dark:text-zinc-50">
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
      <P>Son güncelleme: 5 Ekim 2026. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) madde 10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, PulseCoach&apos;u kullanırken işlenen kişisel verileriniz hakkında sizi bilgilendirmek için hazırlanmıştır. Aydınlatma metni bir onay metni değildir; sağlık verilerinizin işlenmesine ilişkin açık rızanız aşağıdaki 2. bölümde ayrıca istenir.</P>
      <SubTitle>1.1 Veri Sorumlusu</SubTitle>
      <P>PulseCoach, gerçek kişi Bora Eren Erdem tarafından bireysel ve ticari kâr amacı gütmeyen bir proje olarak işletilmektedir. KVKK kapsamında veri sorumlusu Bora Eren Erdem&apos;dir (&quot;biz&quot;). İletişim ve KVKK başvuruları: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
      <SubTitle>1.2 İşlenen Kişisel Veriler ve Hukuki Sebepleri</SubTitle>
      <P><strong>Kimlik ve iletişim:</strong> e-posta adresiniz; isteğe bağlı görünen adınız, doğum yılınız ve cinsiyetiniz (son ikisi yalnız kalori önerisi için). Google veya Apple ile giriş yaparsanız bu sağlayıcının bize ilettiği e-posta adresi ve hesap kimliği (Apple&apos;da &quot;E-postamı Gizle&quot;yi seçerseniz Apple&apos;ın aktarıcı adresi). Hukuki sebep: sözleşmenin kurulması ve ifası (KVKK md. 5/2-c).</P>
      <P><strong>Hesap ve işlem güvenliği:</strong> şifreniz (geri döndürülemez biçimde hash&apos;lenmiş), oturum jetonları, giriş ve şifre sıfırlama denemeleri, IP adresiniz ve isteklerin zamanı. Hukuki sebep: sözleşmenin ifası (md. 5/2-c), veri güvenliğini sağlama yükümlülüğümüz (md. 5/2-ç, md. 12) ve hesabınızı ve sistemi kötüye kullanıma karşı korumaya yönelik meşru menfaatimiz (md. 5/2-f).</P>
      <P><strong>Sağlık ve yaşam tarzı verileri (özel nitelikli kişisel veri):</strong> antrenman ve egzersiz kayıtlarınız (set, tekrar, ağırlık, süre, kardiyo), beslenme kayıtlarınız ve yemek fotoğraflarınız, vücut ölçümleriniz (kilo, boy, bel çevresi, vücut yağ oranı), hedefleriniz, profilde belirttiğiniz beslenme kısıtlamaları ve alerjiler, ruh hâli kayıtlarınız, yapay zekâ koç ile sohbet geçmişiniz ve bu verilere dayanan koç mesajları (check-in&apos;ler). Hukuki sebep: <strong>yalnızca açık rızanız</strong> (KVKK md. 6/3-a; bkz. 2. bölüm).</P>
      <P><strong>Uygulama tercihleri ve teknik veriler:</strong> dil, koç tonu, bildirim tercihleri ve hatırlatma saati, saat diliminiz ve günlük kullanım sayaçları. Hukuki sebep: sözleşmenin ifası (md. 5/2-c).</P>
      <P><strong>Onay ve başvuru kayıtları:</strong> kayıt sırasında verdiğiniz onayların tarihi ve metin sürümü, KVKK başvurularınız ve bizimle yazışmalarınız. Hukuki sebep: hukuki yükümlülüklerimizin yerine getirilmesi (md. 5/2-ç) ve bir hakkın tesisi, kullanılması veya korunması (md. 5/2-e).</P>
      <SubTitle>1.3 İşleme Amaçları</SubTitle>
      <P>Hesabınızı oluşturmak ve yönetmek; antrenman, beslenme, vücut ölçümü ve ruh hâli takibi sunmak; yapay zekâ koç aracılığıyla size özel geri bildirim, özet ve öneri üretmek; yemek fotoğraflarınızdaki besinleri tanımak; uygulama içi koç mesajları ve hatırlatmalar üretmek; hesap ve sistem güvenliğini sağlamak (kimlik doğrulama, deneme sınırlaması, şifre sıfırlama, günlük kullanım kotası); KVKK başvurularınızı ve taleplerinizi yanıtlamak; yasal yükümlülüklerimizi yerine getirmek. Verileriniz reklam, pazarlama veya profilleme yoluyla satış amacıyla işlenmez.</P>
      <SubTitle>1.4 Toplama Yöntemi</SubTitle>
      <P>Kişisel verileriniz uygulamayı kullanırken doğrudan sizden (kayıt ve profil formları, kayıt ekranları, sohbet, fotoğraf yükleme) elektronik ortamda; Google veya Apple ile giriş yaparsanız bu sağlayıcılardan; IP adresi ve istek zamanı gibi teknik kayıtlar ise sistem tarafından otomatik olarak toplanır.</P>
      <SubTitle>1.5 Yapay Zekâ Koç ve Otomatik İşleme</SubTitle>
      <P>Yapay zekâ koç ve yemek fotoğrafı analizi, <strong>Türkiye&apos;deki kendi sunucumuzda çalışan açık kaynaklı dil ve görüntü modelleriyle</strong> yapılır. Sohbetleriniz, fotoğraflarınız ve sağlık verileriniz OpenAI, Google veya benzeri üçüncü taraf yapay zekâ hizmetlerine <strong>gönderilmez</strong> ve modelleri eğitmek için <strong>kullanılmaz</strong>. Koçun önerileri verilerinizden otomatik olarak üretilir; ancak hakkınızda hukuki sonuç doğuran veya sizi önemli ölçüde etkileyen otomatik bir karar alınmaz. Münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıktığını düşünürseniz buna itiraz edebilirsiniz (1.10).</P>
      <SubTitle>1.6 Kişisel Verilerin Aktarılması</SubTitle>
      <P><strong>Yurt içi:</strong> Uygulama, veritabanı ve yapay zekâ modelleri, Türkiye&apos;deki bir veri merkezinde bulunan ve <strong>Cloudvist Bilişim Teknolojileri (İstanbul)</strong> tarafından sağlanan sunucuda çalışır; hesap, sağlık ve sohbet verileriniz yalnızca bu sunucuda saklanır ve işlenir. Sağlayıcı, KVKK md. 12 anlamında veri işleyen sıfatıyla yalnızca altyapıyı (donanım, elektrik, ağ) sağlar. Veritabanı yedekleri sunucudan çıkmadan şifrelenir ve <strong>Türkiye&apos;de</strong> ayrı bir depolama ortamında tutulur. Tek işlemsel e-postamız olan şifre sıfırlama e-postası ve <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresine yazdığınız e-postalar, <strong>Türkiye&apos;de yerleşik</strong> e-posta hizmet sağlayıcısı <strong>Uzman Posta (Pusula İletişim, İstanbul)</strong> aracılığıyla gönderilir ve alınır; bu sağlayıcı da yalnızca veri işleyen sıfatıyla hizmet verir. Kanunen yetkili kamu kurum ve kuruluşları ile yargı mercilerine, yalnızca yasal bir talep veya zorunluluk hâlinde aktarım yapılabilir.</P>
      <P><strong>Bildirimler:</strong> Bildirimleri açarsanız hatırlatma ve haftalık özet bildirimleri <strong>cihazınızda yerel olarak</strong> zamanlanır; sunucumuz bildirim göndermez, bu amaçla bildirim jetonu toplamaz ve hiçbir bildirim servisine veri aktarmaz. Bildirim metinleri genel niteliktedir ve sağlık verisi içermez. Bildirimleri dilediğiniz zaman cihaz ayarlarından veya Profil &gt; Bildirimler bölümünden kapatabilirsiniz; bildirimleri açmamanız uygulamanın diğer işlevlerini etkilemez.</P>
      <P><strong>E-posta teslimi ve Google/Apple ile giriş:</strong> E-postalarımız, bize verdiğiniz adrese teslim edilir; adresiniz yurt dışında sunucusu bulunan bir sağlayıcıdaysa (ör. Gmail, Outlook, iCloud veya Apple&apos;ın &quot;E-postamı Gizle&quot; aktarıcısı) e-posta o sağlayıcının sunucularına ulaşır. Bu nedenle e-postalarımıza sağlık verisi koymayız; uygulama yalnızca şifre sıfırlama bağlantısı gönderir. Google veya Apple ile giriş yaptığınızda kimliğinizi bu sağlayıcıların yayımladığı açık anahtarlarla doğrularız; bu sağlayıcılara sizinle ilgili bir veri göndermeyiz. Web sürümünde giriş ekranındaki &quot;Google ile devam edin&quot; düğmesi Google&apos;ın sunucularından yüklenir; bu sırada tarayıcınız Google&apos;a IP adresi gibi teknik bilgiler iletir ve bu işlem Google&apos;ın kendi gizlilik koşullarına tabidir. Bunu istemiyorsanız e-posta ve şifreyle kayıt olabilirsiniz.</P>
      <P>Verileriniz hiçbir koşulda <strong>reklam veya pazarlama amacıyla üçüncü kişilere satılmaz, kiralanmaz veya paylaşılmaz</strong>; uygulamada reklam, analitik veya izleme aracı bulunmaz.</P>
      <SubTitle>1.7 Saklama Süreleri</SubTitle>
      <P><strong>Hesap ve sağlık verileri:</strong> hesabınız açık olduğu sürece; hesabınızı sildiğinizde (Profil &gt; Hesabımı Sil) derhal ve kalıcı olarak.<br /><strong>Yemek fotoğrafları:</strong> en fazla 12 ay ve kişi başına en yeni 200 fotoğraf; daha eskileri otomatik silinir.<br /><strong>Giriş ve şifre sıfırlama denemeleri (e-posta/IP):</strong> 7 gün.<br /><strong>Sunucu erişim kayıtları (IP adresi, istek zamanı ve yolu):</strong> 14 gün.<br /><strong>Şifre sıfırlama bağlantıları:</strong> 1 saat geçerlidir ve tek kullanımlıktır.<br /><strong>Yedekler:</strong> sunucuda 14 gün, Türkiye&apos;deki ayrı yedekte 30 gün; silinen hesabın verileri yedeklerden en geç 30 gün içinde kendiliğinden çıkar ve bu sürede yedekler yalnızca bir arızadan sonra sistemi geri yüklemek için kullanılır.<br /><strong>Onay ve başvuru kayıtları:</strong> talebin sonuçlandırılması ve olası uyuşmazlıklar için gerekli süre boyunca, en fazla 10 yıl.<br />Süresi dolan veriler, Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik&apos;e uygun olarak silinir.</P>
      <SubTitle>1.8 Veri Güvenliği Tedbirleri</SubTitle>
      <P>Şifreniz geri döndürülemez biçimde hash&apos;lenerek saklanır ve tarafımızca dahi okunamaz. Uygulama ile sunucu arasındaki tüm iletişim şifrelenir (HTTPS/TLS). Veritabanı internete kapalıdır; sunucuya yalnızca veri sorumlusu, anahtar tabanlı kimlik doğrulamayla erişir. Yedekler şifrelenir; deneme sınırlaması ve günlük kullanım kotası kötüye kullanımı önler. Özel nitelikli kişisel veriler için Kişisel Verileri Koruma Kurulunun belirlediği yeterli önlemler esas alınır. Bir veri ihlali öğrenmemiz hâlinde Kurul&apos;a en geç 72 saat içinde, etkilenen kullanıcılara ise en kısa sürede bildirim yapılır. İnternet üzerinden hiçbir iletim veya saklama yönteminin yüzde yüz güvenli olmadığını hatırlatırız.</P>
      <SubTitle>1.9 Çerezler, Yerel Depolama ve Yaş Sınırı</SubTitle>
      <P>Uygulama reklam, analitik veya izleme amaçlı çerez kullanmaz. Oturumunuzu açık tutan giriş jetonları, dil ve tema tercihiniz ile zamanlanmış bildirimleriniz yalnızca cihazınızda (tarayıcı belleği veya mobil cihaz deposu) tutulur. PulseCoach 18 yaşından küçükler için tasarlanmamıştır; 18 yaşından küçüklerin uygulamayı kullanmasına izin verilmez. 18 yaş altı bir kullanıcıya ait veri fark edersek bu veriyi sileriz; bu konuda <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresinden bize ulaşabilirsiniz.</P>
      <SubTitle>1.10 Haklarınız ve Başvuru Usulü (KVKK md. 11)</SubTitle>
      <P>Bize başvurarak (a) kişisel verinizin işlenip işlenmediğini öğrenme, (b) işlenmişse buna ilişkin bilgi talep etme, (c) işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, (ç) yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, (d) eksik veya yanlış işlenmişse düzeltilmesini isteme, (e) KVKK md. 7 çerçevesinde silinmesini veya yok edilmesini isteme, (f) (d) ve (e) kapsamındaki işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, (g) münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve (ğ) kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</P>
      <P>Başvurunuzu, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca, <strong>uygulamaya kayıtlı e-posta adresinizden</strong> <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresine e-posta göndererek ya da güvenli elektronik imza, mobil imza veya kayıtlı elektronik posta (KEP) ile iletebilirsiniz. Başvuruda adınız, soyadınız, kimlik bilgileriniz, tebligata esas adresiniz veya e-posta adresiniz ve talebinizin konusu yer almalıdır. Başvurunuz talebin niteliğine göre en geç otuz gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul&apos;ca belirlenen tarifedeki ücret alınabilir. Başvurunuz reddedilir, cevabı yetersiz bulunur veya süresinde cevap verilmezse, cevabı öğrendiğiniz tarihten itibaren otuz gün ve her hâlde başvuru tarihinden itibaren altmış gün içinde Kişisel Verileri Koruma Kuruluna şikâyette bulunabilirsiniz. Ayrıca uygulamada Profil &gt; Verilerim bölümünden tüm verilerinizi indirebilir, Profil &gt; Hesabımı Sil bölümünden hesabınızı ve verilerinizi kalıcı olarak silebilirsiniz.</P>
      <SubTitle>1.11 Metin Güncellemeleri</SubTitle>
      <P>Bu metinde değişiklik yaptığımızda güncelleme tarihi yukarıda belirtilir ve önemli değişiklikler uygulama içinden duyurulur. Açık rızaya dayanan işlemelerde kapsam genişlerse rızanız yeniden istenir.</P>
      <SectionTitle id="saglik-verisi">2. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni</SectionTitle>
      <P>PulseCoach&apos;u kullanırken paylaşacağım antrenman ve egzersiz kayıtlarımın, beslenme kayıtlarımın ve yemek fotoğraflarımın, kilo, boy, bel çevresi ve vücut yağ oranı gibi vücut ölçümlerimin, hedeflerimin, beslenme kısıtlamalarım ve alerjilerimin, ruh hâli kayıtlarımın ve bu verilere dayanarak yapay zekâ koç ile yaptığım sohbetlerin KVKK md. 6 kapsamında <strong>özel nitelikli kişisel veri (sağlık verisi)</strong> olduğunu biliyorum.</P>
      <P>Aydınlatma Metni&apos;nde açıklandığı üzere bu verilerin, bana kişiselleştirilmiş antrenman ve beslenme takibi, ilerleme analizi ve yapay zekâ koçluk hizmeti sunulması amacıyla, Türkiye&apos;deki sunucuda veri sorumlusu Bora Eren Erdem tarafından işlenmesine, saklanmasına ve bu sunucunun barındırma hizmetini sağlayan veri işleyene emanet edilmesine <strong>AÇIK RIZA VERİYORUM</strong>. Bu verilerin yurt dışına aktarılmayacağı, üçüncü taraf yapay zekâ hizmetlerine gönderilmeyeceği ve reklam/pazarlama amacıyla kullanılmayacağı konusunda bilgilendirildim.</P>
      <P>Açık rızamın özgür irademe dayandığını; ancak koçluk hizmetinin doğası gereği bu veriler işlenmeden uygulamanın temel işlevlerinin sunulamayacağını biliyorum. Rızamı dilediğim zaman Profil &gt; Hesabımı Sil bölümünden ya da <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> adresine yazarak geri çekebilirim; geri çekmem ileriye etkili olur, sağlık verilerim silinir ve hizmetin bu verilere dayanan bölümü sona erer.</P>
      <P>Yapay zekâ koçun önerilerinin genel bilgilendirme amaçlı olduğunu, tıbbi teşhis veya tedavi yerine geçmediğini ve sağlığımla ilgili kararlar için bir hekime veya diyetisyene danışmam gerektiğini biliyorum (bkz. Kullanım Koşulları).</P>
    </>
  );
}

function EnContent() {
  return (
    <>
      <SectionTitle id="aydinlatma">1. Privacy Notice</SectionTitle>
      <P>Last updated: October 5, 2026. This notice explains, in line with Article 10 of Turkey&apos;s Law No. 6698 on the Protection of Personal Data (&quot;KVKK&quot;) and the Communiqué on the Procedures and Principles for the Obligation to Inform, how your personal data is processed while you use PulseCoach. This notice is not a consent form; your explicit consent to the processing of your health data is requested separately in section 2.</P>
      <SubTitle>1.1 Data Controller</SubTitle>
      <P>PulseCoach is operated by Bora Eren Erdem, a natural person, as an individual, non-commercial project. Bora Eren Erdem is the data controller under KVKK (&quot;we&quot;). Contact and data protection requests: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
      <SubTitle>1.2 Personal Data We Process and Legal Bases</SubTitle>
      <P><strong>Identity and contact:</strong> your email address; optionally your display name, birth year and sex (the latter two only for the calorie suggestion). If you sign in with Google or Apple, the email address and account identifier that provider shares with us (with Apple&apos;s &quot;Hide My Email&quot;, Apple&apos;s relay address). Legal basis: establishment and performance of the contract (KVKK Art. 5/2-c).</P>
      <P><strong>Account and transaction security:</strong> your password (stored irreversibly hashed), session tokens, sign-in and password reset attempts, your IP address and request times. Legal basis: performance of the contract (Art. 5/2-c), our legal obligation to keep data secure (Art. 5/2-ç, Art. 12), and our legitimate interest in protecting your account and the system against abuse (Art. 5/2-f).</P>
      <P><strong>Health and lifestyle data (special category personal data):</strong> your workout and exercise records (sets, reps, weight, duration, cardio), nutrition logs and meal photos, body measurements (weight, height, waist circumference, body fat percentage), goals, dietary restrictions and allergies you enter in your profile, mood logs, your chat history with the AI coach, and coach messages based on this data (check-ins). Legal basis: <strong>your explicit consent only</strong> (KVKK Art. 6/3-a; see section 2).</P>
      <P><strong>App preferences and technical data:</strong> language, coach tone, notification preferences and reminder time, your time zone and daily usage counters. Legal basis: performance of the contract (Art. 5/2-c).</P>
      <P><strong>Consent and request records:</strong> the date and text version of the confirmations you give at sign-up, your data protection requests and our correspondence. Legal basis: fulfilling our legal obligations (Art. 5/2-ç) and establishing, exercising or protecting a right (Art. 5/2-e).</P>
      <SubTitle>1.3 Purposes of Processing</SubTitle>
      <P>Creating and managing your account; providing workout, nutrition, body measurement and mood tracking; generating personalized feedback, summaries and recommendations through the AI coach; recognizing foods in your meal photos; generating in-app coach messages and reminders; securing your account and the system (authentication, rate limiting, password resets, daily usage quota); responding to your data protection requests; and complying with our legal obligations. Your data is not processed for advertising, marketing or sale through profiling.</P>
      <SubTitle>1.4 How Data Is Collected</SubTitle>
      <P>Your personal data is collected electronically, directly from you while you use the app (sign-up and profile forms, logging screens, chat, photo uploads); from Google or Apple if you sign in with them; and technical records such as IP address and request time are collected automatically by the system.</P>
      <SubTitle>1.5 AI Coach and Automated Processing</SubTitle>
      <P>The AI coach and meal photo analysis run on <strong>open-source language and vision models hosted on our own server in Turkey</strong>. Your chats, photos and health data are <strong>never sent</strong> to third-party AI services such as OpenAI or Google and are <strong>not used</strong> to train models. The coach&apos;s recommendations are generated automatically from your data; however, no automated decision producing legal effects or similarly significantly affecting you is made. If you believe an exclusively automated analysis led to a result to your detriment, you can object (1.10).</P>
      <SubTitle>1.6 Data Transfers</SubTitle>
      <P><strong>Within Turkey:</strong> The app, database and AI models run on a server located in a data center in Turkey and provided by <strong>Cloudvist Bilişim Teknolojileri (Istanbul)</strong>; your account, health and chat data is stored and processed only on this server. The provider acts as a data processor under KVKK Art. 12 and supplies only the infrastructure (hardware, power, network). Database backups are encrypted before they leave the server and are kept on separate storage <strong>in Turkey</strong>. Our only transactional email, the password reset email, and the emails you send to <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> are sent and received through <strong>Uzman Posta (Pusula İletişim, Istanbul)</strong>, an email service provider <strong>established in Turkey</strong>, which also acts only as a data processor. Data may be disclosed to competent public authorities and courts only upon a lawful request or obligation.</P>
      <P><strong>Notifications:</strong> If you enable notifications, reminder and weekly summary notifications are scheduled <strong>locally on your device</strong>; our server does not send notifications, does not collect a notification token for this purpose and does not transfer any data to a notification service. Notification texts are generic and contain no health data. You can turn notifications off at any time in your device settings or in Profile &gt; Notifications; not enabling notifications does not affect any other feature.</P>
      <P><strong>Email delivery and Google/Apple sign-in:</strong> Our emails are delivered to the address you give us; if your address is with a provider whose servers are abroad (e.g. Gmail, Outlook, iCloud or Apple&apos;s &quot;Hide My Email&quot; relay), the email reaches that provider&apos;s servers. For this reason we never put health data in emails; the app only sends password reset links. When you sign in with Google or Apple, we verify your identity using the public keys those providers publish; we do not send them any data about you. On the web version, the &quot;Continue with Google&quot; button on the sign-in screen is loaded from Google&apos;s servers; while it loads, your browser sends Google technical information such as your IP address, which is subject to Google&apos;s own privacy terms. If you prefer to avoid this, you can sign up with email and password.</P>
      <P>Your data is <strong>never sold, rented or shared with third parties for advertising or marketing</strong>; the app contains no advertising, analytics or tracking tools.</P>
      <SubTitle>1.7 Retention Periods</SubTitle>
      <P><strong>Account and health data:</strong> as long as your account is open; deleted immediately and permanently when you delete your account (Profile &gt; Delete My Account).<br /><strong>Meal photos:</strong> at most 12 months and the latest 200 photos per person; older ones are deleted automatically.<br /><strong>Sign-in and password reset attempts (email/IP):</strong> 7 days.<br /><strong>Server access logs (IP address, request time and path):</strong> 14 days.<br /><strong>Password reset links:</strong> valid for 1 hour and single-use.<br /><strong>Backups:</strong> 14 days on the server and 30 days in the separate backup in Turkey; data of a deleted account drops out of backups automatically within 30 days at the latest, and during that time backups are used only to restore the system after a failure.<br /><strong>Consent and request records:</strong> for as long as needed to resolve the request and any dispute, at most 10 years.<br />Data whose retention period has expired is deleted in line with the Regulation on the Deletion, Destruction or Anonymization of Personal Data.</P>
      <SubTitle>1.8 Data Security Measures</SubTitle>
      <P>Your password is stored irreversibly hashed and cannot be read even by us. All communication between the app and the server is encrypted (HTTPS/TLS). The database is not reachable from the internet; only the data controller accesses the server, using key-based authentication. Backups are encrypted; rate limiting and a daily usage quota prevent abuse. The adequate measures set by the Personal Data Protection Board for special category data are applied. If we learn of a data breach, we notify the Board within 72 hours at the latest and the affected users as soon as possible. Please note that no method of transmission or storage over the internet is 100% secure.</P>
      <SubTitle>1.9 Cookies, Local Storage and Age Limit</SubTitle>
      <P>The app does not use cookies for advertising, analytics or tracking. The tokens that keep you signed in, your language and theme preference and your scheduled notifications are stored only on your device (browser storage or mobile device storage). PulseCoach is not designed for children; users under 18 are not allowed to use the app. If we become aware of data belonging to a user under 18, we delete it; you can reach us about this at <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>.</P>
      <SubTitle>1.10 Your Rights and How to Apply (KVKK Art. 11)</SubTitle>
      <P>You may contact us to (a) learn whether your personal data is processed, (b) request information about it if so, (c) learn the purpose of processing and whether data is used accordingly, (d) know the third parties to whom it is transferred in Turkey or abroad, (e) request correction if it is incomplete or inaccurate, (f) request erasure or destruction under KVKK Art. 7, (g) request that actions under (e) and (f) be notified to third parties it was transferred to, (h) object to a result to your detriment arising exclusively from automated analysis, and (i) claim compensation for damage caused by unlawful processing.</P>
      <P>Under the Communiqué on the Procedures and Principles of Application to the Data Controller, you can apply by emailing <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a> <strong>from the email address registered in the app</strong>, or by secure electronic signature, mobile signature or registered electronic mail (KEP). Your application should include your name, surname, identity details, an address or email address for notification and the subject of your request. We respond free of charge within thirty days at the latest depending on the nature of the request; if the action requires additional cost, a fee set by the Board may apply. If your application is rejected, the response is insufficient or no response is given in time, you can file a complaint with the Personal Data Protection Board within thirty days of learning the response and in any case within sixty days of the application date. You can also download all your data from Profile &gt; My Data and permanently delete your account and data from Profile &gt; Delete My Account.</P>
      <SubTitle>1.11 Changes to This Notice</SubTitle>
      <P>When we change this notice, the update date above changes and material changes are announced in the app. If the scope of processing based on explicit consent expands, your consent is requested again.</P>
      <SectionTitle id="saglik-verisi">2. Explicit Consent for Processing Health Data</SectionTitle>
      <P>I understand that the workout and exercise records, nutrition logs and meal photos, body measurements such as weight, height, waist circumference and body fat percentage, goals, dietary restrictions and allergies, mood logs, and chats with the AI coach based on this data that I share while using PulseCoach are <strong>special category personal data (health data)</strong> under KVKK Art. 6.</P>
      <P>As explained in the Privacy Notice, I <strong>GIVE MY EXPLICIT CONSENT</strong> for this data to be processed and stored by the data controller Bora Eren Erdem on the server in Turkey, and entrusted to the data processor providing that server&apos;s hosting, for the purpose of providing me with personalized workout and nutrition tracking, progress analysis and AI coaching. I have been informed that this data will not be transferred abroad, will not be sent to third-party AI services and will not be used for advertising or marketing.</P>
      <P>I understand that my consent is freely given, but that by the nature of the coaching service the app&apos;s core features cannot be provided without processing this data. I can withdraw my consent at any time from Profile &gt; Delete My Account or by writing to <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">{CONTACT_EMAIL}</a>; withdrawal takes effect for the future, my health data is deleted and the part of the service relying on it ends.</P>
      <P>I understand that the AI coach&apos;s recommendations are for general information only, do not replace medical diagnosis or treatment, and that I should consult a physician or dietitian for decisions about my health (see the Terms of Service).</P>
    </>
  );
}

export default function KvkkPage() {
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
            {language === "tr" ? "Gizlilik ve KVKK" : "Privacy & KVKK"}
          </h1>
        </div>

        <Card>{language === "tr" ? <TrContent /> : <EnContent />}</Card>
      </div>
    </div>
  );
}
