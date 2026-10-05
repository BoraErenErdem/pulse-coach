import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/lib/language-context";
import { Card, DetailScreen, type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/app/terms/page.tsx'in mobil portu - AYNI TR/EN içerik. kvkk.tsx'in
// aksine bu ekrana section-param'lı derin bağlantı yok, o yüzden
// measureLayout/scrollTo mekanizması burada gereksiz - düz bir ScrollView
// yeterli. Üst seviye, GRUPSUZ bir route (Stack.Protected'ın DIŞINDA) - hem
// giriş öncesi hem sonrası erişilebilir olmalı, tıpkı kvkk.tsx gibi.
//
// KVKK metnindeki "3. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza"
// bölümü buradaki "4. Tıbbi Sorumluluk Reddi" maddesine atıf yapıyor -
// ikisi birbirini tamamlıyor.

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

export default function TermsScreen() {
  const { language } = useLanguage();
  const c = useThemeColors();
  const s = makeStyles(c);

  return (
    <DetailScreen title={language === "tr" ? "Kullanım Koşulları" : "Terms of Service"}>
      <ScrollView contentContainerStyle={s.container}>
        <Card>{language === "tr" ? <TrContent s={s} /> : <EnContent s={s} />}</Card>
      </ScrollView>
    </DetailScreen>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function SectionTitle({ s, children }: { s: Styles; children: React.ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

function P({ s, children }: { s: Styles; children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>;
}

function Highlight({ s, children }: { s: Styles; children: React.ReactNode }) {
  return (
    <View style={s.highlight}>
      <Text style={s.highlightText}>{children}</Text>
    </View>
  );
}

function TrContent({ s }: { s: Styles }) {
  return (
    <>
      <P s={s}>Son güncelleme: 5 Ekim 2026. Bu Kullanım Koşulları (&quot;Koşullar&quot;), PulseCoach&apos;u (&quot;Uygulama&quot;) kullanan herkes (&quot;Kullanıcı&quot;, &quot;siz&quot;) ile Uygulamayı işleten Bora Eren Erdem (&quot;biz&quot;) arasındaki ilişkiyi düzenler. Kişisel verilerinizin nasıl işlendiği <Text style={s.linkLike}>Gizlilik ve KVKK</Text> metninde açıklanmıştır.</P>
      <SectionTitle s={s}>1. Taraflar ve Kabul</SectionTitle>
      <P s={s}>PulseCoach, gerçek kişi Bora Eren Erdem tarafından bireysel ve ticari kâr amacı gütmeyen bir proje olarak işletilmektedir. Hesap oluştururken bu Koşulları onaylayarak ya da Uygulamayı kullanarak Koşulları okuduğunuzu ve kabul ettiğinizi beyan edersiniz. Koşulları kabul etmiyorsanız Uygulamayı kullanmamalısınız.</P>
      <SectionTitle s={s}>2. Hizmetin Tanımı</SectionTitle>
      <P s={s}>PulseCoach; antrenman, beslenme, ruh hâli ve vücut ölçümü takibi ile bu verilere dayanan, yapay zekâ destekli kişiselleştirilmiş öneriler sunan bir mobil ve web uygulamasıdır. Yapay zekâ koç ve yemek fotoğrafı analizi, Türkiye&apos;deki sunucumuzda çalışan açık kaynaklı modellerle yapılır. Yapay zekâ <Text style={s.bold}>hata yapabilir</Text>: kalori, makro, egzersiz ve fotoğraftan tahmin edilen miktarlar yaklaşıktır; kayıtlarınızı kontrol etmeniz ve önemli kararları yalnızca bu çıktılara dayandırmamanız gerekir.</P>
      <SectionTitle s={s}>3. Uygunluk ve Hesap</SectionTitle>
      <P s={s}>Uygulamayı kullanmak için <Text style={s.bold}>en az 18 yaşında</Text> olmanız gerekir. Hesap oluştururken doğru bilgi vermeyi, şifrenizi gizli tutmayı ve hesabınızda gerçekleşen işlemlerden sorumlu olduğunuzu kabul edersiniz. Her kişi yalnızca kendi adına hesap açabilir. Yetkisiz bir kullanım fark ederseniz bizi <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresinden bilgilendirmelisiniz.</P>
      <SectionTitle s={s}>4. Tıbbi Sorumluluk Reddi</SectionTitle>
      <Highlight s={s}>PulseCoach bir tıbbi cihaz, teşhis aracı veya sağlık hizmeti sağlayıcısı <Text style={s.bold}>değildir</Text> ve bu amaçlarla kullanılmamalıdır. Yapay zekâ koçun antrenman, beslenme ve yaşam tarzı önerileri yalnızca genel bilgilendirme amaçlıdır; bir hekimin, diyetisyenin, fizyoterapistin veya psikoloğun tavsiyesinin, teşhisinin veya tedavisinin <Text style={s.bold}>yerine geçmez</Text>. Kalori önerisi genel bir formüle dayanan bir tahmindir. Bir egzersiz veya beslenme programına başlamadan önce, özellikle mevcut bir hastalığınız, sakatlığınız, hamileliğiniz, yeme bozukluğu öykünüz veya kronik bir rahatsızlığınız varsa hekiminize danışın. Kendinizi kötü hissediyorsanız, kendinize zarar verme düşünceleriniz varsa veya acil bir durumdaysanız derhal <Text style={s.bold}>112</Text>&apos;yi arayın ya da en yakın sağlık kuruluşuna başvurun. Önerileri uygulayıp uygulamamak sizin kararınızdır.</Highlight>
      <SectionTitle s={s}>5. Kullanıcı Yükümlülükleri</SectionTitle>
      <P s={s}>Uygulamayı yalnızca hukuka uygun amaçlarla ve bu Koşullara uygun şekilde kullanacağınızı kabul edersiniz. Özellikle: Uygulamanın güvenliğini aşmaya, sistemleri aşırı yüklemeye veya otomatik araçlarla veri toplamaya çalışmamayı; yapay zekâ koçu zararlı, yasa dışı veya başkalarını hedef alan içerik üretmeye yönlendirmemeyi; başkalarına ait kişisel verileri, özellikle başka kişilerin yüzlerini içeren fotoğrafları yüklememeyi ve günlük kullanım sınırlarını aşmaya yönelik girişimlerde bulunmamayı kabul edersiniz.</P>
      <SectionTitle s={s}>6. Kullanıcı İçeriği</SectionTitle>
      <P s={s}>Girdiğiniz kayıtlar, sohbetler ve fotoğraflar size aittir; bunları Profil &gt; Verilerim bölümünden indirebilirsiniz. Hizmeti sunabilmemiz için bu içerikleri yalnızca Uygulamanın işleyişi kapsamında ve <Text style={s.linkLike}>Gizlilik ve KVKK</Text> metnine uygun olarak saklama ve işleme iznini bize vermiş olursunuz. İçerikleriniz yapay zekâ modellerini eğitmek, reklam veya pazarlama amacıyla kullanılmaz.</P>
      <SectionTitle s={s}>7. Ücretlendirme</SectionTitle>
      <P s={s}>Uygulama tamamen ücretsizdir; uygulama içi satın alma veya abonelik yoktur. İleride ücretli bir özellik eklenirse bu açıkça duyurulur ve açık onayınız olmadan sizden ücret alınmaz.</P>
      <SectionTitle s={s}>8. Fikri Mülkiyet</SectionTitle>
      <P s={s}>Uygulamanın yazılımı, tasarımı, &quot;PulseCoach&quot; adı ve logosu Bora Eren Erdem&apos;e aittir. Uygulamayı izinsiz kopyalayamaz, değiştiremez, tersine mühendislik yapamaz veya ticari amaçla dağıtamazsınız. Uygulamada kullanılan açık kaynaklı bileşenler ve veri setleri (ör. besin ve egzersiz katalogları) kendi lisanslarına tabidir.</P>
      <SectionTitle s={s}>9. Hizmetin Sınırları, Süresi ve Garanti Reddi</SectionTitle>
      <P s={s}>PulseCoach, bireysel bir geliştirici tarafından yürütülen ve sınırlı bir süre için sunulabilecek bir projedir. Uygulama &quot;olduğu gibi&quot; ve &quot;mevcut olduğu ölçüde&quot; sunulur; kesintisiz veya hatasız çalışacağı ve yapay zekâ çıktılarının her zaman doğru olacağı garanti edilmez. Bakım veya teknik sorunlar nedeniyle Uygulama zaman zaman erişilemez olabilir. Hizmeti tamamen sonlandırmamız hâlinde bunu <Text style={s.bold}>en az 30 gün önceden</Text> uygulama içinden ve kayıtlı e-posta adresinize duyurur, verilerinizi indirmeniz için süre tanır ve süre sonunda tüm kişisel verileri sileriz.</P>
      <SectionTitle s={s}>10. Sorumluluğun Sınırlandırılması</SectionTitle>
      <P s={s}>Yürürlükteki mevzuatın izin verdiği ölçüde, Uygulamanın kullanımından veya kullanılamamasından doğan dolaylı zararlardan sorumlu değiliz. Bu sınırlama, kasıt veya ağır ihmalden, kişisel verilerin hukuka aykırı işlenmesinden ya da kanunen sınırlandırılamayan hâllerden doğan sorumluluğu ortadan kaldırmaz ve tüketici olarak kanundan doğan haklarınızı etkilemez.</P>
      <SectionTitle s={s}>11. Hesabın Sonlandırılması</SectionTitle>
      <P s={s}>Hesabınızı dilediğiniz zaman Profil &gt; Hesabımı Sil bölümünden kalıcı olarak silebilirsiniz. Bu Koşulları ağır şekilde ihlal etmeniz hâlinde hesabınızı, mümkünse önceden bildirimde bulunarak, askıya alabilir veya kapatabiliriz; bu durumda da verilerinizi indirme talebiniz karşılanır.</P>
      <SectionTitle s={s}>12. Değişiklikler</SectionTitle>
      <P s={s}>Bu Koşulları güncelleyebiliriz. Güncelleme tarihi bu sayfanın başında belirtilir; önemli değişiklikler yürürlüğe girmeden önce uygulama içinden duyurulur. Değişikliği kabul etmiyorsanız hesabınızı silerek sözleşmeyi sona erdirebilirsiniz.</P>
      <SectionTitle s={s}>13. Apple App Store</SectionTitle>
      <P s={s}>Uygulamayı Apple App Store&apos;dan indirdiyseniz: bu Koşullar Apple ile değil, sizinle Bora Eren Erdem arasındadır ve Uygulamadan ve içeriğinden Apple değil biz sorumluyuz. Apple&apos;ın Uygulama için bakım veya destek yükümlülüğü yoktur. Uygulamanın herhangi bir garantiye uymaması hâlinde Apple&apos;a bildirebilirsiniz; Apple varsa satın alma bedelini iade eder (Uygulama ücretsizdir) ve kanunun izin verdiği ölçüde başka bir garanti yükümlülüğü yoktur. Uygulamayla ilgili ürün sorumluluğu, mevzuata uygunluk, tüketici koruma ve fikri mülkiyet ihlali talepleri Apple&apos;a değil bize yöneltilmelidir. Uygulamayı App Store Kullanım Kurallarına uygun kullanmanız gerekir. Apple ve iştirakleri bu Koşulların üçüncü taraf lehtarıdır ve bu Koşulları size karşı uygulama hakkına sahiptir.</P>
      <SectionTitle s={s}>14. Uygulanacak Hukuk ve Uyuşmazlıklar</SectionTitle>
      <P s={s}>Bu Koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri ve icra daireleri yetkilidir; tüketici olarak tüketici hakem heyetlerine ve tüketici mahkemelerine başvuru hakkınız saklıdır.</P>
      <SectionTitle s={s}>15. İletişim</SectionTitle>
      <P s={s}>Sorularınız ve talepleriniz için <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresinden bize ulaşabilirsiniz.</P>
    </>
  );
}

function EnContent({ s }: { s: Styles }) {
  return (
    <>
      <P s={s}>Last updated: October 5, 2026. These Terms of Service (&quot;Terms&quot;) govern the relationship between everyone who uses PulseCoach (the &quot;App&quot;) (&quot;User&quot;, &quot;you&quot;) and Bora Eren Erdem, who operates the App (&quot;we&quot;). How your personal data is processed is explained in the <Text style={s.linkLike}>Privacy &amp; KVKK</Text> notice.</P>
      <SectionTitle s={s}>1. Parties and Acceptance</SectionTitle>
      <P s={s}>PulseCoach is operated by Bora Eren Erdem, a natural person, as an individual, non-commercial project. By accepting these Terms when you create an account, or by using the App, you confirm that you have read and agree to them. If you do not agree, you must not use the App.</P>
      <SectionTitle s={s}>2. Description of the Service</SectionTitle>
      <P s={s}>PulseCoach is a mobile and web app that tracks workouts, nutrition, mood and body measurements and provides AI-assisted personalized recommendations based on that data. The AI coach and meal photo analysis run on open-source models hosted on our server in Turkey. AI <Text style={s.bold}>can make mistakes</Text>: calories, macros, exercises and amounts estimated from photos are approximate; you should check your records and not base important decisions on these outputs alone.</P>
      <SectionTitle s={s}>3. Eligibility and Your Account</SectionTitle>
      <P s={s}>You must be <Text style={s.bold}>at least 18 years old</Text> to use the App. When creating an account you agree to provide accurate information, keep your password confidential and be responsible for activity under your account. Each person may only create an account for themselves. If you notice unauthorized use, notify us at <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
      <SectionTitle s={s}>4. Medical Disclaimer</SectionTitle>
      <Highlight s={s}>PulseCoach is <Text style={s.bold}>not</Text> a medical device, a diagnostic tool or a healthcare provider and must not be used for these purposes. The AI coach&apos;s workout, nutrition and lifestyle recommendations are for general information only and do <Text style={s.bold}>not</Text> replace the advice, diagnosis or treatment of a physician, dietitian, physical therapist or psychologist. The calorie suggestion is an estimate based on a general formula. Before starting an exercise or nutrition program, consult your physician, especially if you have an existing condition, injury, pregnancy, a history of eating disorders or a chronic illness. If you feel unwell, have thoughts of harming yourself or are in an emergency, call your local emergency number (<Text style={s.bold}>112</Text> in Turkey) immediately or go to the nearest medical facility. Whether you follow the recommendations is your decision.</Highlight>
      <SectionTitle s={s}>5. User Obligations</SectionTitle>
      <P s={s}>You agree to use the App only for lawful purposes and in line with these Terms. In particular, you agree not to try to breach the App&apos;s security, overload its systems or scrape data with automated tools; not to steer the AI coach into producing harmful, unlawful or targeted content; not to upload other people&apos;s personal data, especially photos showing other people&apos;s faces; and not to try to circumvent daily usage limits.</P>
      <SectionTitle s={s}>6. Your Content</SectionTitle>
      <P s={s}>The logs, chats and photos you enter belong to you; you can download them from Profile &gt; My Data. So that we can provide the service, you allow us to store and process this content only for the App&apos;s operation and in line with the <Text style={s.linkLike}>Privacy &amp; KVKK</Text> notice. Your content is not used to train AI models or for advertising or marketing.</P>
      <SectionTitle s={s}>7. Pricing</SectionTitle>
      <P s={s}>The App is entirely free; there are no in-app purchases or subscriptions. If a paid feature is added in the future, it will be clearly announced and you will not be charged without your explicit approval.</P>
      <SectionTitle s={s}>8. Intellectual Property</SectionTitle>
      <P s={s}>The App&apos;s software, design, the &quot;PulseCoach&quot; name and logo belong to Bora Eren Erdem. You may not copy, modify, reverse-engineer or commercially distribute the App without permission. Open-source components and datasets used in the App (e.g. food and exercise catalogs) are subject to their own licenses.</P>
      <SectionTitle s={s}>9. Service Limitations, Duration and Disclaimer</SectionTitle>
      <P s={s}>PulseCoach is a project run by an individual developer and may be offered for a limited time. The App is provided &quot;as is&quot; and &quot;as available&quot;; we do not guarantee that it will be uninterrupted or error-free or that AI outputs will always be accurate. The App may occasionally be unavailable due to maintenance or technical issues. If we discontinue the service entirely, we will announce it <Text style={s.bold}>at least 30 days in advance</Text> in the app and to your registered email address, give you time to download your data, and delete all personal data at the end of that period.</P>
      <SectionTitle s={s}>10. Limitation of Liability</SectionTitle>
      <P s={s}>To the extent permitted by applicable law, we are not liable for indirect damages arising from your use of or inability to use the App. This limitation does not exclude liability for intent or gross negligence, for unlawful processing of personal data or in cases where liability cannot be limited by law, and it does not affect your statutory rights as a consumer.</P>
      <SectionTitle s={s}>11. Account Termination</SectionTitle>
      <P s={s}>You can permanently delete your account at any time from Profile &gt; Delete My Account. If you seriously violate these Terms, we may suspend or close your account, with prior notice where possible; even then, your request to download your data will be honored.</P>
      <SectionTitle s={s}>12. Changes</SectionTitle>
      <P s={s}>We may update these Terms. The update date is shown at the top of this page; material changes are announced in the app before they take effect. If you do not accept a change, you can end the agreement by deleting your account.</P>
      <SectionTitle s={s}>13. Apple App Store</SectionTitle>
      <P s={s}>If you downloaded the App from the Apple App Store: these Terms are between you and Bora Eren Erdem, not Apple, and we, not Apple, are responsible for the App and its content. Apple has no obligation to provide maintenance or support for the App. If the App fails to conform to any warranty, you may notify Apple, and Apple will refund the purchase price, if any (the App is free); to the extent permitted by law, Apple has no other warranty obligation. Product liability, regulatory compliance, consumer protection and intellectual property claims relating to the App must be directed to us, not Apple. You must use the App in compliance with the App Store usage rules. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.</P>
      <SectionTitle s={s}>14. Governing Law and Disputes</SectionTitle>
      <P s={s}>These Terms are governed by the laws of the Republic of Turkey. The courts and enforcement offices of the Republic of Turkey have jurisdiction over disputes; your right as a consumer to apply to consumer arbitration committees and consumer courts is reserved.</P>
      <SectionTitle s={s}>15. Contact</SectionTitle>
      <P s={s}>You can reach us with questions and requests at <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { padding: 16, paddingBottom: 32 },
    sectionTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: c.text,
      marginTop: 18,
    },
    p: {
      fontSize: 13,
      lineHeight: 19,
      color: c.muted,
      marginTop: 6,
    },
    bold: {
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    linkLike: {
      color: c.accent,
      fontFamily: "Inter_600SemiBold",
    },
    highlight: {
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.info,
      backgroundColor: c.infoBg,
      padding: 12,
    },
    highlightText: {
      fontSize: 13,
      lineHeight: 19,
      color: c.text,
    },
  });
}
