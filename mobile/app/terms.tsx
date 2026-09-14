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

const CONTACT_EMAIL = "pulsecoach26@gmail.com";

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
      <P s={s}>
        Son güncelleme: 14 Eylül 2026. Bu Kullanım Koşulları (&quot;Koşullar&quot;), PulseCoach&apos;u
        (&quot;Uygulama&quot;) kullanan herkes (&quot;Kullanıcı&quot;, &quot;siz&quot;) ile Uygulama arasındaki
        ilişkiyi düzenler. Kişisel verilerinizin nasıl işlendiği hakkında Profil &gt; Gizlilik ve KVKK
        metnine bakabilirsiniz.
      </P>

      <SectionTitle s={s}>1. Taraflar ve Kabul</SectionTitle>
      <P s={s}>
        PulseCoach, Bora Eren Erdem tarafından bireysel bir proje olarak işletilmektedir. Uygulamayı indirerek,
        hesap oluşturarak veya kullanarak bu Koşulları okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş
        olursunuz. Koşulları kabul etmiyorsanız Uygulamayı kullanmamalısınız.
      </P>

      <SectionTitle s={s}>2. Hizmetin Tanımı</SectionTitle>
      <P s={s}>
        PulseCoach; antrenman, beslenme, ruh hâli ve vücut ölçümü takibi ile bunlara dayanan, yapay zekâ
        destekli kişiselleştirilmiş koçluk önerileri sunan bir mobil ve web uygulamasıdır. Uygulama içindeki
        yapay zekâ koç kendi sunucularımızda barındırılan bir dil modelidir ve verdiği öneriler girdiğiniz
        verilere dayanır.
      </P>

      <SectionTitle s={s}>3. Uygunluk ve Hesap</SectionTitle>
      <P s={s}>
        Uygulamayı kullanabilmek için en az 18 yaşında olmanız gerekir; 18 yaşından küçükseniz Uygulamayı
        kullanamazsınız. Hesap oluştururken doğru ve güncel bilgi vermekle, şifrenizin gizliliğini korumakla ve
        hesabınız altında gerçekleşen tüm işlemlerden sorumlu olduğunuzu kabul edersiniz. Hesabınızla ilgili
        yetkisiz bir kullanım fark ederseniz bizi <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>{" "}adresinden
        bilgilendirmelisiniz.
      </P>

      <SectionTitle s={s}>4. Tıbbi Sorumluluk Reddi</SectionTitle>
      <Highlight s={s}>
        PulseCoach bir tıbbi cihaz, teşhis aracı veya sağlık hizmeti sağlayıcısı{" "}
        <Text style={s.bold}>değildir</Text>. Uygulama içindeki yapay zekâ koçun sunduğu antrenman, beslenme ve
        yaşam tarzı önerileri yalnızca genel bilgilendirme amaçlıdır; bir doktorun, diyetisyenin, fizyoterapistin
        veya diğer bir sağlık profesyonelinin tıbbi tavsiyesinin, teşhisinin veya tedavisinin{" "}
        <Text style={s.bold}>yerine geçmez</Text>. Herhangi bir egzersiz veya beslenme programına başlamadan
        önce, özellikle mevcut bir sağlık probleminiz, sakatlığınız, hamileliğiniz veya kronik bir
        rahatsızlığınız varsa bir hekime danışmanız önemle tavsiye edilir. Kendinizi kötü hissediyorsanız veya
        acil bir durumdaysanız derhal 112&apos;yi arayın veya en yakın sağlık kuruluşuna başvurun. Uygulamayı
        kullanarak önerileri kendi sorumluluğunuzda uyguladığınızı kabul edersiniz.
      </Highlight>

      <SectionTitle s={s}>5. Kullanıcı Yükümlülükleri</SectionTitle>
      <P s={s}>
        Uygulamayı yalnızca yasal amaçlarla ve bu Koşullara uygun şekilde kullanacağınızı; Uygulamanın
        işleyişine zarar verecek, güvenliğini aşmaya çalışacak veya diğer kullanıcıları rahatsız edecek herhangi
        bir eylemde bulunmayacağınızı kabul edersiniz.
      </P>

      <SectionTitle s={s}>6. Ücretlendirme</SectionTitle>
      <P s={s}>
        Uygulama şu anda tamamen ücretsiz olarak sunulmaktadır. İleride ücretli özellikler veya abonelik
        planları eklenmesi hâlinde bu değişiklik açıkça duyurulacak; mevcut ücretsiz özelliklerinizden
        yararlanmaya devam etmeniz için önceden onayınız olmadan sizden ücret talep edilmeyecektir.
      </P>

      <SectionTitle s={s}>7. Fikri Mülkiyet</SectionTitle>
      <P s={s}>
        Uygulamanın yazılımı, tasarımı, logosu (&quot;PulseCoach&quot; adı ve markası dahil) ve içeriği
        (kişisel verileriniz hariç) Bora Eren Erdem&apos;e aittir ve telif hakkıyla korunmaktadır. Uygulamayı
        izinsiz kopyalayamaz, tersine mühendislik yapamaz veya ticari amaçla yeniden dağıtamazsınız. Kendi
        girdiğiniz veriler (antrenman kayıtları, sohbet geçmişi vb.) size aittir; bunları Profil &gt; Verilerim
        bölümünden indirebilirsiniz.
      </P>

      <SectionTitle s={s}>8. Hizmetin Sınırları ve Garanti Reddi</SectionTitle>
      <P s={s}>
        PulseCoach, bireysel bir geliştirici tarafından yürütülen, gelişmekte olan bir projedir. Uygulama
        &quot;olduğu gibi&quot; ve &quot;mevcut olduğu ölçüde&quot; sunulur; kesintisiz veya hatasız çalışacağı,
        belirli bir amaca uygun olacağı ya da yapay zekâ koçun önerilerinin her zaman doğru veya güncel olacağı
        garanti edilmez. Bakım, güncelleme veya teknik sorunlar nedeniyle Uygulama zaman zaman erişilemez
        olabilir.
      </P>

      <SectionTitle s={s}>9. Sorumluluğun Sınırlandırılması</SectionTitle>
      <P s={s}>
        Yürürlükteki mevzuatın izin verdiği azami ölçüde, Uygulamanın kullanımından veya kullanılamamasından
        kaynaklanan doğrudan veya dolaylı zararlardan (veri kaybı, kâr kaybı vb. dahil) sorumlu tutulamayız. Bu
        sınırlama, kasıt veya ağır kusurdan kaynaklanan sorumluluğu ortadan kaldırmaz.
      </P>

      <SectionTitle s={s}>10. Hesabın Sonlandırılması</SectionTitle>
      <P s={s}>
        Hesabınızı istediğiniz zaman Profil &gt; Hesabımı Sil bölümünden kalıcı olarak silebilirsiniz. Bu
        Koşulları ihlal etmeniz hâlinde hesabınızı askıya alma veya sonlandırma hakkımız saklıdır.
      </P>

      <SectionTitle s={s}>11. Değişiklikler</SectionTitle>
      <P s={s}>
        Bu Koşulları zaman zaman güncelleyebiliriz. Önemli değişikliklerde güncel tarih bu sayfanın başında
        belirtilir ve mümkün olduğunca uygulama içinden de bildirilir. Güncellemeden sonra Uygulamayı kullanmaya
        devam etmeniz, yeni Koşulları kabul ettiğiniz anlamına gelir.
      </P>

      <SectionTitle s={s}>12. Uygulanacak Hukuk</SectionTitle>
      <P s={s}>Bu Koşullar, Türkiye Cumhuriyeti kanunlarına tabidir.</P>

      <SectionTitle s={s}>13. İletişim</SectionTitle>
      <P s={s}>
        Sorularınız için <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>{" "}adresinden bize ulaşabilirsiniz.
      </P>
    </>
  );
}

function EnContent({ s }: { s: Styles }) {
  return (
    <>
      <P s={s}>
        Last updated: September 14, 2026. These Terms of Service (&quot;Terms&quot;) govern the relationship
        between everyone (&quot;User&quot;, &quot;you&quot;) who uses PulseCoach (the &quot;App&quot;) and the
        App. For how your personal data is processed, see Profile &gt; Privacy &amp; KVKK.
      </P>

      <SectionTitle s={s}>1. Parties and Acceptance</SectionTitle>
      <P s={s}>
        PulseCoach is run by Bora Eren Erdem as an individual project. By downloading, registering for, or using
        the App, you confirm that you have read, understood, and agree to these Terms. If you do not agree to
        these Terms, you must not use the App.
      </P>

      <SectionTitle s={s}>2. Description of the Service</SectionTitle>
      <P s={s}>
        PulseCoach is a mobile and web app that tracks your workouts, nutrition, mood, and body measurements,
        and provides AI-powered personalized coaching recommendations based on that data. The AI coach in the
        app is a language model hosted on our own servers, and its recommendations are based on the data you
        provide.
      </P>

      <SectionTitle s={s}>3. Eligibility and Your Account</SectionTitle>
      <P s={s}>
        You must be at least 18 years old to use the App; if you are under 18, you may not use it. When creating
        an account, you agree to provide accurate and up-to-date information, to keep your password
        confidential, and that you are responsible for all activity under your account. If you notice
        unauthorized use of your account, you should notify us at <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.
      </P>

      <SectionTitle s={s}>4. Medical Disclaimer</SectionTitle>
      <Highlight s={s}>
        PulseCoach is <Text style={s.bold}>not</Text>{" "}a medical device, a diagnostic tool, or a healthcare
        provider. The workout, nutrition, and lifestyle recommendations provided by the AI coach are for general
        informational purposes only and do <Text style={s.bold}>not</Text>{" "}replace the medical advice,
        diagnosis, or treatment of a physician, dietitian, physical therapist, or other health professional.
        Before starting any exercise or nutrition program — especially if you have an existing health condition,
        injury, are pregnant, or have a chronic condition — we strongly recommend consulting a physician. If you
        feel unwell or are in an emergency, call your local emergency number immediately or seek the nearest
        medical facility. By using the App, you agree that you follow its recommendations at your own
        responsibility.
      </Highlight>

      <SectionTitle s={s}>5. User Obligations</SectionTitle>
      <P s={s}>
        You agree to use the App only for lawful purposes and in accordance with these Terms, and not to engage
        in any activity that damages the App&apos;s operation, attempts to breach its security, or harasses
        other users.
      </P>

      <SectionTitle s={s}>6. Pricing</SectionTitle>
      <P s={s}>
        The App is currently offered entirely free of charge. If paid features or subscription plans are added
        in the future, this change will be clearly announced, and you will not be charged for continuing to use
        your existing free features without your prior consent.
      </P>

      <SectionTitle s={s}>7. Intellectual Property</SectionTitle>
      <P s={s}>
        The App&apos;s software, design, logo (including the &quot;PulseCoach&quot; name and mark), and content
        (excluding your personal data) belong to Bora Eren Erdem and are protected by copyright. You may not
        copy, reverse-engineer, or redistribute the App for commercial purposes without permission. The data you
        enter (workout logs, chat history, etc.) belongs to you; you can download it from Profile &gt; My Data.
      </P>

      <SectionTitle s={s}>8. Service Limitations and Disclaimer of Warranties</SectionTitle>
      <P s={s}>
        PulseCoach is an evolving project run by an individual developer. The App is provided &quot;as is&quot;
        and &quot;as available&quot;; we do not guarantee that it will be uninterrupted or error-free, fit for a
        particular purpose, or that the AI coach&apos;s recommendations will always be accurate or up to date.
        The App may occasionally be unavailable due to maintenance, updates, or technical issues.
      </P>

      <SectionTitle s={s}>9. Limitation of Liability</SectionTitle>
      <P s={s}>
        To the maximum extent permitted by applicable law, we are not liable for direct or indirect damages
        (including data loss or loss of profit) arising from your use or inability to use the App. This
        limitation does not exclude liability arising from intent or gross negligence.
      </P>

      <SectionTitle s={s}>10. Account Termination</SectionTitle>
      <P s={s}>
        You can permanently delete your account at any time from Profile &gt; Delete My Account. We reserve the
        right to suspend or terminate your account if you violate these Terms.
      </P>

      <SectionTitle s={s}>11. Changes</SectionTitle>
      <P s={s}>
        We may update these Terms from time to time. For material changes, the updated date will be shown at the
        top of this page, and we also try to notify you within the app where possible. Continuing to use the App
        after an update means you accept the new Terms.
      </P>

      <SectionTitle s={s}>12. Governing Law</SectionTitle>
      <P s={s}>These Terms are governed by the laws of the Republic of Turkey.</P>

      <SectionTitle s={s}>13. Contact</SectionTitle>
      <P s={s}>
        You can reach us with any questions at <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.
      </P>
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
