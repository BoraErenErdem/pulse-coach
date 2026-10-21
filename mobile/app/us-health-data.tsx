import { ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { useLanguage } from "@/lib/language-context";
import { Card, DetailScreen, type ThemeColors, useThemeColors } from "@/components/ui";

// ABD Tüketici Sağlık Verisi Gizlilik Politikası (2026-10-21) - web/src/app/us-health-data
// sayfasının mobil portu, AYNI TR/EN içerik (tools/legal_texts/'ten üretilir). Washington
// My Health My Data Act uygulama içinden (ayarlar sayfası gibi) bir bağlantı istiyor
// (RCW 19.373.010 "homepage"): Profil > Hesap ve Ayarlar ve kayıt onayından açılır.
// Üst seviye, GRUPSUZ bir route - giriş öncesi ve sonrası erişilebilir, terms.tsx gibi.

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

export default function UsHealthDataScreen() {
  const { language } = useLanguage();
  const c = useThemeColors();
  const s = makeStyles(c);

  return (
    <DetailScreen title={language === "tr" ? "ABD Sağlık Verisi Politikası" : "Consumer Health Data Policy"}>
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

function TrContent({ s }: { s: Styles }) {
  return (
    <>
      <P s={s}>Yürürlük tarihi: 21 Ekim 2026. Bu Tüketici Sağlık Verisi Gizlilik Politikası, ABD eyaletlerinin tüketici sağlık verisi yasalarıyla korunan kullanıcılar için geçerlidir; bunlar arasında Washington&apos;ın My Health My Data Act yasası (RCW 19.373), Nevada&apos;nın tüketici sağlık verisi yasası (NRS Bölüm 603A, SB 370) ve Connecticut Veri Gizliliği Yasası&apos;nın tüketici sağlık verisi hükümleri bulunur. Bora Eren Erdem (&quot;biz&quot;) tarafından işletilen PulseCoach&apos;un tüketici sağlık verilerinizi nasıl topladığını, kullandığını ve paylaştığını ve haklarınızı nasıl kullanabileceğinizi açıklar. Genel gizlilik metnimiz: <Text style={s.linkLike} onPress={() => router.push("/kvkk")}>Gizlilik ve KVKK</Text>. İngilizce metin esastır.</P>
      <SectionTitle s={s}>1. Topladığımız Tüketici Sağlık Verileri ve Amaçları</SectionTitle>
      <P s={s}>Şu tüketici sağlık verisi kategorilerini toplarız:{"\n"}• <Text style={s.bold}>Egzersiz ve antrenman verileri:</Text> kaydettiğiniz antrenmanlar, egzersizler, setler, tekrarlar, ağırlıklar, süreler ve kardiyo.{"\n"}• <Text style={s.bold}>Beslenme verileri:</Text> kaydettiğiniz öğünler ve besinler, porsiyonlar, kalori ve besin değerleri ile yüklediğiniz yemek fotoğrafları.{"\n"}• <Text style={s.bold}>Vücut ölçümleri:</Text> kilo, boy, bel çevresi ve vücut yağ oranı.{"\n"}• <Text style={s.bold}>Sağlıkla ilgili profil bilgileri:</Text> hedefleriniz (ör. kilo vermek), aktivite seviyeniz, beslenme kısıtlamalarınız ve alerjileriniz ile kalori ihtiyacınızı tahmin etmek için kullanılan cinsiyetiniz ve doğum yılınız.{"\n"}• <Text style={s.bold}>Ruh hâli verileri:</Text> kaydettiğiniz ruh hâlleri.{"\n"}• <Text style={s.bold}>Yapay zekâ koç sohbetleri:</Text> koça gönderdiğiniz ve paylaşmayı seçtiğiniz sağlık bilgilerini içerebilen mesajlar ile koçun yanıtları.{"\n"}• <Text style={s.bold}>Çıkarımlar:</Text> kendi yapay zekâ modellerimizin yukarıdaki verilerden ürettiği kalori ve besin önerileri, ilerleme analizleri, içgörüler ve koç mesajları.</P>
      <P s={s}>Bu verileri yalnızca talep ettiğiniz özellikleri sunmak için kullanırız: antrenman, beslenme, ölçüm ve ruh hâli kayıtlarınızı tutmak ve göstermek; kalori ve besin önerilerinizi ve ilerlemenizi hesaplamak; yapay zekâ koç aracılığıyla size özel geri bildirim, özet ve öneri sunmak; yemek fotoğraflarınızdaki besinleri tanımak; hesabınızı korumak ve kötüye kullanımı önlemek; taleplerinizi yanıtlamak ve yasalara uymak. Tüketici sağlık verilerini reklam veya pazarlama için kullanmayız, satmayız ve yapay zekâ modellerini eğitmek için kullanmayız.</P>
      <SectionTitle s={s}>2. Tüketici Sağlık Verilerinin Kaynakları</SectionTitle>
      <P s={s}>Tüketici sağlık verilerini, uygulamayı veya web sitesini kullanırken <Text style={s.bold}>doğrudan sizden</Text> toplarız (formlar, kayıt ekranları, sohbet ve fotoğraf yükleme). Çıkarımlar, sunucumuzda çalışan <Text style={s.bold}>kendi yapay zekâ modellerimiz</Text> tarafından verdiğiniz verilerden üretilir. Veri simsarları, reklam ağları veya başka uygulamalar gibi kaynaklardan tüketici sağlık verisi almayız. Apple veya Google ile giriş yaparsanız bu sağlayıcılar yalnızca e-posta adresinizi ve hesap kimliğinizi iletir; bunlar tüketici sağlık verisi değildir.</P>
      <SectionTitle s={s}>3. Tüketici Sağlık Verilerinin Paylaşılması</SectionTitle>
      <P s={s}><Text style={s.bold}>Tüketici sağlık verilerini satmayız ve üçüncü taraflarla veya iştiraklerle paylaşmayız.</Text> İştirakimiz yoktur. Bu nedenle paylaştığımız bir tüketici sağlık verisi kategorisi ve veri paylaştığımız bir üçüncü taraf veya iştirak bulunmaz.</P>
      <P s={s}>Verileriniz, adımıza veri işleyen olarak hizmet veren <Text style={s.bold}>Cloudvist Bilişim Teknolojileri (İstanbul, Türkiye)</Text> tarafından barındırılan Türkiye&apos;deki sunucumuzda saklanır ve işlenir. <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine yazmayı seçerseniz e-postanız, yine veri işleyen olarak hizmet veren e-posta sağlayıcımız <Text style={s.bold}>Uzman Posta (Pusula İletişim, İstanbul, Türkiye)</Text> üzerinden geçer. Veri işleyenler verileri yalnızca talimatlarımız doğrultusunda ve bize hizmet sunmak için işleyebilir. Verileri bir kamu makamına veya mahkemeye yalnızca yasal zorunluluk hâlinde açıklayabiliriz.</P>
      <SectionTitle s={s}>4. Üçüncü Tarafların Veri Toplaması</SectionTitle>
      <P s={s}>PulseCoach&apos;u kullanırken üçüncü tarafların tüketici sağlık verilerinizi zaman içinde ve farklı web siteleri veya çevrim içi hizmetler arasında toplamasına izin vermeyiz. Uygulamada ve web sitesinde reklam, analitik veya izleme aracı yoktur.</P>
      <SectionTitle s={s}>5. Haklarınız ve Nasıl Kullanacağınız</SectionTitle>
      <P s={s}>Yaşadığınız eyalete göre şu haklara sahipsiniz:{"\n"}• <Text style={s.bold}>Teyit ve erişim:</Text> tüketici sağlık verilerinizi toplayıp toplamadığımızı, paylaşıp paylaşmadığımızı veya satıp satmadığımızı öğrenmek ve bu verilere erişmek; buna verileri paylaştığımız veya sattığımız tüm üçüncü taraf ve iştiraklerin listesi ve iletişim bilgileri dahildir (verileri paylaşmadığımız ve satmadığımız için bu liste boştur).{"\n"}• <Text style={s.bold}>Rızayı geri çekme:</Text> tüketici sağlık verilerinizin toplanmasına ve paylaşılmasına verdiğiniz rızayı geri çekmek.{"\n"}• <Text style={s.bold}>Silme:</Text> tüketici sağlık verilerinizin silinmesini istemek.{"\n"}Bu hakları kullandığınız için size ayrımcılık yapmayız.</P>
      <P s={s}><Text style={s.bold}>Talep nasıl yapılır:</Text> Çoğu talebi doğrudan uygulamada tamamlayabilirsiniz: Profil &gt; Verilerim bölümünden tüm verilerinizi indirebilir, Profil &gt; Hesabımı Sil bölümünden hesabınızı ve verilerinizi kalıcı olarak silebilirsiniz. Ayrıca uygulamaya kayıtlı e-posta adresinizden &quot;Consumer Health Data Request&quot; konulu bir e-postayı <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine gönderebilirsiniz. Verilerinizi korumak için talebin kayıtlı e-posta adresinizden geldiğini doğrularız; doğrulayamazsak ek bilgi isteyebiliriz. Talepte bulunmak için hesap oluşturmanız gerekmez; hesabınız yoksa sizinle ilgili tüketici sağlık verisi tutmayız.</P>
      <P s={s}>Talebinizi aldıktan sonra 45 gün içinde yanıtlarız. Daha fazla süre gerekirse bu süreyi bir kez daha 45 gün uzatabiliriz ve nedenini ilk 45 gün içinde size bildiririz. Talepler yılda iki defaya kadar ücretsizdir. Verilerinizi sildiğimizde canlı sistemlerimizden derhal, yedeklerimizden 30 gün içinde kaldırılır ve veri işleyenlerimize de silmeleri talimatını veririz.</P>
      <P s={s}><Text style={s.bold}>İtiraz:</Text> Talebinizi reddedersek, kararımıza yanıt vererek veya &quot;Appeal&quot; konulu bir e-postayı <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine göndererek itiraz edebilirsiniz. İtirazınızı 45 gün içinde, yapılan veya yapılmayan işlemi ve nedenini açıklayarak yazılı olarak yanıtlarız. İtirazınızı reddedersek eyaletinizin Başsavcılığına şikâyette bulunabilirsiniz; Washington&apos;da yaşayanlar bunu atg.wa.gov/file-complaint adresinden yapabilir.</P>
      <SectionTitle s={s}>6. Rıza ve Rızanın Geri Çekilmesi</SectionTitle>
      <P s={s}>Tüketici sağlık verilerini talep ettiğiniz hizmetleri sunmak için toplar ve kullanırız. Buna ek olarak, hesap oluştururken sağlık verilerinizin işlenmesi için ayrı ve açık rızanızı isteriz; bu rıza Kullanım Koşulları&apos;nın bir parçası değildir. Rızanızı dilediğiniz zaman Profil &gt; Hesabımı Sil bölümünden hesabınızı silerek veya <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine yazarak geri çekebilirsiniz. Geri çekme ileriye dönük toplamayı durdurur ve sağlık verileriniz silinir; koçluk özellikleri bu verilere dayandığı için geri çektiğinizde sona erer. Bu politikayı güncellemeden ve rızanızı almadan yeni tüketici sağlık verisi kategorileri toplamayız, verileri yeni amaçlarla kullanmayız veya paylaşmayız.</P>
      <SectionTitle s={s}>7. Değişiklikler ve İletişim</SectionTitle>
      <P s={s}>Bu politikayı değiştirirsek yukarıdaki yürürlük tarihini güncelleriz ve önemli değişiklikleri yürürlüğe girmeden önce uygulama içinden duyururuz. Bu politikayla ilgili sorularınız için: <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
    </>
  );
}

function EnContent({ s }: { s: Styles }) {
  return (
    <>
      <P s={s}>Effective date: October 21, 2026. This Consumer Health Data Privacy Policy applies to consumers protected by U.S. state consumer health data laws, including Washington&apos;s My Health My Data Act (RCW 19.373), Nevada&apos;s consumer health data law (NRS Chapter 603A, SB 370) and the consumer health data provisions of the Connecticut Data Privacy Act. It explains how PulseCoach, operated by Bora Eren Erdem (&quot;we&quot;), collects, uses and shares your consumer health data and how you can exercise your rights. Our general privacy notice is available at <Text style={s.linkLike} onPress={() => router.push("/kvkk")}>Privacy &amp; KVKK</Text>.</P>
      <SectionTitle s={s}>1. Consumer Health Data We Collect and Why</SectionTitle>
      <P s={s}>We collect the following categories of consumer health data:{"\n"}• <Text style={s.bold}>Fitness and exercise data:</Text> workouts, exercises, sets, repetitions, weights, durations and cardio sessions you log.{"\n"}• <Text style={s.bold}>Nutrition data:</Text> meals and foods you log, portions, calories and nutrients, and meal photos you upload.{"\n"}• <Text style={s.bold}>Body measurements:</Text> weight, height, waist circumference and body fat percentage.{"\n"}• <Text style={s.bold}>Health-related profile information:</Text> your goals (such as losing weight), activity level, dietary restrictions and allergies, and your sex and birth year, which are used to estimate your calorie needs.{"\n"}• <Text style={s.bold}>Mood data:</Text> the moods you record.{"\n"}• <Text style={s.bold}>AI coach conversations:</Text> messages you send to the AI coach, which may contain health information you choose to share, and the coach&apos;s replies.{"\n"}• <Text style={s.bold}>Inferences:</Text> calorie and nutrient recommendations, progress analyses, insights and coach messages that our own AI models derive from the data above.</P>
      <P s={s}>We use this data only to provide the features you request: to record and display your workouts, nutrition, measurements and moods; to calculate calorie and nutrient recommendations and progress; to give you personalized feedback, summaries and suggestions through the AI coach; to recognize foods in your meal photos; to keep your account secure and prevent abuse; and to respond to your requests and comply with the law. We do not use consumer health data for advertising or marketing, we do not sell it, and we do not use it to train AI models.</P>
      <SectionTitle s={s}>2. Sources of Consumer Health Data</SectionTitle>
      <P s={s}>We collect consumer health data <Text style={s.bold}>directly from you</Text> when you use the app or website (forms, logging screens, chat and photo uploads). Inferences are <Text style={s.bold}>derived by our own AI models</Text>, which run on our server, from the data you provide. We do not obtain consumer health data from other sources such as data brokers, advertising networks or other apps. If you sign in with Apple or Google, they provide only your email address and account identifier, which are not consumer health data.</P>
      <SectionTitle s={s}>3. Sharing of Consumer Health Data</SectionTitle>
      <P s={s}><Text style={s.bold}>We do not sell consumer health data, and we do not share it with third parties or affiliates.</Text> We have no affiliates. Accordingly, there are no categories of consumer health data that we share and no third parties or affiliates with whom we share it.</P>
      <P s={s}>Your data is stored and processed on our server in Turkey, which is hosted by <Text style={s.bold}>Cloudvist Bilişim Teknolojileri (Istanbul, Turkey)</Text> acting as a processor on our behalf. If you choose to write to <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>, your email passes through our email service provider <Text style={s.bold}>Uzman Posta (Pusula İletişim, Istanbul, Turkey)</Text>, also acting as a processor. Processors may process data only on our instructions and to provide their services to us. We may disclose data to a government authority or court only where required by law.</P>
      <SectionTitle s={s}>4. Collection by Third Parties</SectionTitle>
      <P s={s}>We do not allow third parties to collect your consumer health data over time and across different websites or online services when you use PulseCoach. The app and website contain no advertising, analytics or tracking tools.</P>
      <SectionTitle s={s}>5. Your Rights and How to Exercise Them</SectionTitle>
      <P s={s}>Depending on your state, you have the right to:{"\n"}• <Text style={s.bold}>Confirm and access:</Text> confirm whether we collect, share or sell your consumer health data and access that data, including a list of all third parties and affiliates with whom we have shared or sold it and their contact information (we do not share or sell it, so this list is empty).{"\n"}• <Text style={s.bold}>Withdraw consent:</Text> withdraw your consent to the collection and sharing of your consumer health data.{"\n"}• <Text style={s.bold}>Delete:</Text> have your consumer health data deleted.{"\n"}We will not discriminate against you for exercising these rights.</P>
      <P s={s}><Text style={s.bold}>How to make a request:</Text> Most requests can be completed directly in the app: download all your data from Profile &gt; My Data, and permanently delete your account and data from Profile &gt; Delete My Account. You can also email <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> with the subject &quot;Consumer Health Data Request&quot; from the email address registered in the app. To protect your data, we verify a request by confirming it came from your registered email address and may ask for additional information if we cannot verify it. You do not need to create an account to make a request; if you have no account, we hold no consumer health data about you.</P>
      <P s={s}>We respond within 45 days of receiving your request. If we need more time, we may extend this once by another 45 days and will tell you why within the first 45 days. Requests are free of charge up to twice a year. When we delete your data, it is removed from our live systems immediately and from our backups within 30 days, and we instruct our processors to delete it as well.</P>
      <P s={s}><Text style={s.bold}>Appeals:</Text> If we decline your request, you can appeal by replying to our decision or emailing <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> with the subject &quot;Appeal&quot;. We will respond in writing within 45 days, explaining any action taken or not taken and why. If we deny your appeal, you can submit a complaint to your state Attorney General; Washington residents can do so at atg.wa.gov/file-complaint.</P>
      <SectionTitle s={s}>6. Consent and Withdrawal</SectionTitle>
      <P s={s}>We collect and use consumer health data to provide the services you request. In addition, when you create an account we ask for your separate, explicit consent to process your health data; this consent is not part of the Terms of Service. You can withdraw it at any time by deleting your account in Profile &gt; Delete My Account or by emailing <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>. Withdrawal stops future collection and your health data is deleted; because the coaching features depend on this data, they end when you withdraw. We will not collect new categories of consumer health data, use it for new purposes or share it without first updating this policy and obtaining your consent.</P>
      <SectionTitle s={s}>7. Changes and Contact</SectionTitle>
      <P s={s}>If we change this policy, we will update the effective date above and announce material changes in the app before they take effect. Questions about this policy: <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
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
  });
}
