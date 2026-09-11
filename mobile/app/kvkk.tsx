import { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useLanguage } from "@/lib/language-context";
import { Card, DetailScreen, type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/app/kvkk/page.tsx'in mobil portu - AYNI TR/EN içerik ve aynı
// üç bölüm (aydinlatma/acik-riza/saglik-verisi). Web'in URL anchor'ı
// (#aydinlatma) yerine RN'de `section` route param'ı + onLayout ile ölçülen
// y-offset kullanılıyor (native'de URL fragment scroll'u yok). Üst seviye,
// GRUPSUZ bir route (mobile/app/kvkk.tsx) - Stack.Protected SADECE (auth) ve
// (tabs) grubunu koruyor, bu dosya listede olmadığı için hem giriş
// ÖNCESİNDE (register checkbox'larından) hem giriş SONRASINDA (Profil >
// Gizlilik ve KVKK) erişilebilir - tek dosyayla KVKK'nın "aydınlatma her
// zaman ulaşılabilir olmalı" ilkesini iki senaryoda da karşılıyor.
//
// Sunucu konumu (bkz. "3. Aktarım" bölümü) HENÜZ netleşmedi - RunPod'da GPU
// kiralanıp canlıya alınınca (bkz. memory: project_pulsecoach_launch_plan)
// buradaki genel ifade gerçek ülke/bölge ile GÜNCELLENMELİ.

const CONTACT_EMAIL = "pulsecoach26@gmail.com";

export default function KvkkScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { language } = useLanguage();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<Record<string, number>>({});

  function registerOffset(id: string, y: number) {
    offsetsRef.current[id] = y;
    if (section === id) {
      // Layout'lar aşamalı geldiği için (metin uzun) bir sonraki tick'te
      // scrollTo çağırmak, henüz ölçülmemiş bir offset'e atlamayı önlüyor.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      });
    }
  }

  return (
    <DetailScreen title={language === "tr" ? "Gizlilik ve KVKK" : "Privacy & KVKK"}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.container}>
        <Card>{language === "tr" ? <TrContent s={s} onSectionLayout={registerOffset} /> : <EnContent s={s} onSectionLayout={registerOffset} />}</Card>
      </ScrollView>
    </DetailScreen>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Section({
  id,
  title,
  onSectionLayout,
  s,
  children,
}: {
  id: string;
  title: string;
  onSectionLayout: (id: string, y: number) => void;
  s: Styles;
  children: React.ReactNode;
}) {
  return (
    <View onLayout={(e) => onSectionLayout(id, e.nativeEvent.layout.y)}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Sub({ s, children }: { s: Styles; children: React.ReactNode }) {
  return <Text style={s.subTitle}>{children}</Text>;
}

function P({ s, children }: { s: Styles; children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>;
}

function TrContent({ s, onSectionLayout }: { s: Styles; onSectionLayout: (id: string, y: number) => void }) {
  return (
    <>
      <Section id="aydinlatma" title="1. Aydınlatma Metni" onSectionLayout={onSectionLayout} s={s}>
        <P s={s}>
          Son güncelleme: 11 Eylül 2026. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
          madde 10 uyarınca PulseCoach&apos;u kullanırken işlenen kişisel verileriniz hakkında sizi bilgilendirmek
          için hazırlanmıştır.
        </P>

        <Sub s={s}>1.1 Veri Sorumlusu</Sub>
        <P s={s}>
          PulseCoach, Bora Eren Erdem tarafından bireysel bir proje olarak, ticari kâr amacı gütmeden
          işletilmektedir. KVKK uyarınca &quot;veri sorumlusu&quot; sıfatıyla hareket ediyoruz. İletişim:{" "}
          <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.
        </P>

        <Sub s={s}>1.2 İşlenen Kişisel Veriler</Sub>
        <P s={s}>
          <Text style={s.bold}>Kimlik/İletişim:</Text>{" "}e-posta adresiniz.{"\n"}
          <Text style={s.bold}>Hesap güvenliği:</Text>{" "}şifreniz (geri döndürülemez biçimde şifrelenmiş olarak
          saklanır), giriş denemesi kayıtları, kötüye kullanımı önlemek amacıyla IP adresiniz.{"\n"}
          <Text style={s.bold}>Sağlık ve yaşam tarzı verileri (özel nitelikli):</Text>{" "}antrenman/egzersiz
          kayıtlarınız (set, tekrar, ağırlık, süre), beslenme kayıtlarınız ve yemek fotoğraflarınız, vücut
          ölçümleriniz (kilo, bel çevresi, vücut yağ oranı vb.), ruh hâli (mood) kayıtlarınız ve check-in
          mesajlarınız, yapay zekâ koç ile sohbet geçmişiniz.{"\n"}
          <Text style={s.bold}>Kullanım/teknik veriler:</Text>{" "}dil ve tema tercihiniz, push bildirim
          token&apos;ı, hedefler ve koç tonu gibi uygulama içi tercihleriniz.
        </P>

        <Sub s={s}>1.3 İşlenme Amaçları</Sub>
        <P s={s}>
          Kişiselleştirilmiş antrenman/beslenme takibi ve yapay zekâ koçluk hizmeti sunmak; ilerlemenizi (kilo,
          antrenman hacmi, beslenme, ruh hâli) analiz ederek size özel geri bildirim ve öneri üretmek; hesap
          güvenliğini sağlamak (kimlik doğrulama, kötüye kullanım/deneme sınırlaması, şifre sıfırlama); talep
          etmeniz hâlinde push bildirim göndermek; uygulamanın işleyişini ölçmek ve iyileştirmek.
        </P>

        <Sub s={s}>1.4 Hukuki Sebep</Sub>
        <P s={s}>
          E-posta adresiniz ve hesap bilgileriniz gibi genel kişisel veriler, KVKK madde 5 kapsamında sözleşmenin
          kurulması ve ifası için işlenir. Sağlık ve yaşam tarzı verileriniz gibi özel nitelikli kişisel veriler
          ise KVKK madde 6 uyarınca <Text style={s.bold}>yalnızca açık rızanıza</Text>{" "}dayanılarak işlenir (bkz.
          aşağıdaki 3. bölüm).
        </P>

        <Sub s={s}>1.5 Kişisel Verilerin Aktarılması</Sub>
        <P s={s}>
          Verileriniz, hizmetin verilebilmesi için gerekli olduğu ölçüde bulut barındırma/altyapı
          sağlayıcımızın sunucularında teknik olarak saklanır; sunucu konumu (yurt içi/yurt dışı) netleştiğinde
          bu metin güncellenecektir. Yasal bir zorunluluk bulunması hâlinde yetkili kamu kurum ve kuruluşlarına
          aktarılabilir. Verileriniz hiçbir şekilde{" "}
          <Text style={s.bold}>pazarlama/reklam amacıyla üçüncü taraflara satılmaz veya paylaşılmaz</Text>.
        </P>

        <Sub s={s}>1.6 Toplama Yöntemi</Sub>
        <P s={s}>
          Kişisel verileriniz, uygulamayı kullanırken doğrudan sizin tarafınızdan (kayıt formu, antrenman/
          beslenme kaydı, sohbet vb. aracılığıyla) elektronik ortamda toplanır.
        </P>

        <Sub s={s}>1.7 Saklama Süresi</Sub>
        <P s={s}>
          Verileriniz, hesabınız aktif olduğu sürece saklanır. Hesabınızı sildiğinizde (Profil &gt; Hesabımı
          Sil) tüm kişisel verileriniz sistemden kalıcı olarak silinir.
        </P>

        <Sub s={s}>1.8 Haklarınız (KVKK madde 11)</Sub>
        <P s={s}>
          Bize başvurarak: (a) kişisel verinizin işlenip işlenmediğini öğrenme, (b) işlenmişse buna ilişkin bilgi
          talep etme, (c) işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, (ç) yurt içinde
          veya yurt dışında aktarıldığı üçüncü kişileri bilme, (d) eksik veya yanlış işlenmişse düzeltilmesini
          isteme, (e) KVKK madde 7&apos;deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme, (f)
          (d) ve (e) kapsamında yapılan işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, (g)
          münhasıran otomatik sistemlerle (ör. yapay zekâ koçun ürettiği öneriler) analiz edilmesi sonucu
          aleyhinize bir sonuç çıkmasına itiraz etme, (ğ) kanuna aykırı işlenme nedeniyle zarara uğramanız
          hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.
        </P>
        <P s={s}>
          Bu haklarınızı <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>{" "}adresine yazılı olarak başvurarak
          kullanabilirsiniz. Ayrıca uygulama içinden Profil &gt; Verilerim bölümünden tüm verinizi indirebilir,
          Profil &gt; Hesabımı Sil bölümünden hesabınızı ve tüm verinizi kalıcı olarak silebilirsiniz.
        </P>
      </Section>

      <Section
        id="acik-riza"
        title="2. Genel Kişisel Verilerin İşlenmesine İlişkin Açık Rıza Metni"
        onSectionLayout={onSectionLayout}
        s={s}
      >
        <P s={s}>
          Yukarıdaki Aydınlatma Metni&apos;ni okuduğumu ve anladığımı; e-posta adresim ve hesap bilgilerim dahil
          kişisel verilerimin, PulseCoach tarafından yukarıda açıklanan amaçlarla, KVKK&apos;ya uygun şekilde
          işlenmesine <Text style={s.bold}>açık rızam olduğunu</Text>{" "}beyan ederim. Bu rızamı istediğim zaman
          hesabımı silerek veya {CONTACT_EMAIL} adresine yazarak geri çekebileceğimi biliyorum.
        </P>
      </Section>

      <Section
        id="saglik-verisi"
        title="3. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni (Özel Nitelikli Kişisel Veri)"
        onSectionLayout={onSectionLayout}
        s={s}
      >
        <P s={s}>
          PulseCoach&apos;u kullanırken paylaşacağım aşağıdaki sağlık ve yaşam tarzı verilerimin — antrenman/
          egzersiz kayıtlarım, beslenme kayıtlarım ve yemek fotoğraflarım, kilo/bel çevresi/vücut yağ oranı gibi
          vücut ölçümlerim, ruh hâli (mood) kayıtlarım ve bu verilere dayanarak yapay zekâ koç ile yaptığım
          sohbetler — KVKK&apos;nın 6. maddesi kapsamında &quot;özel nitelikli kişisel veri&quot; olduğunu
          biliyorum.
        </P>
        <P s={s}>
          Bu verilerin, bana kişiselleştirilmiş antrenman/beslenme takibi ve yapay zekâ koçluk hizmeti sunmak
          amacıyla PulseCoach tarafından işlenmesine <Text style={s.bold}>AÇIK RIZAM olduğunu</Text>{" "}beyan
          ederim.
        </P>
        <P s={s}>
          Bu rızayı vermezsem uygulamanın temel işlevlerini (kişiselleştirilmiş koçluk) kullanamayacağımı;
          rızamı istediğim zaman hesabımı kalıcı olarak silerek geri çekebileceğimi ve geri çektiğimde bu
          verilerin sistemden silineceğini biliyorum.
        </P>
      </Section>
    </>
  );
}

function EnContent({ s, onSectionLayout }: { s: Styles; onSectionLayout: (id: string, y: number) => void }) {
  return (
    <>
      <Section id="aydinlatma" title="1. Privacy Notice" onSectionLayout={onSectionLayout} s={s}>
        <P s={s}>
          Last updated: September 11, 2026. This notice explains, in line with Article 10 of Turkey&apos;s Law
          No. 6698 on the Protection of Personal Data (&quot;KVKK&quot;), what personal data is processed while
          you use PulseCoach.
        </P>

        <Sub s={s}>1.1 Data Controller</Sub>
        <P s={s}>
          PulseCoach is run by Bora Eren Erdem as an individual, non-commercial project. We act as the &quot;data
          controller&quot; under KVKK. Contact: <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.
        </P>

        <Sub s={s}>1.2 Personal Data We Process</Sub>
        <P s={s}>
          <Text style={s.bold}>Identity/contact:</Text>{" "}your email address.{"\n"}
          <Text style={s.bold}>Account security:</Text>{" "}your password (stored irreversibly hashed), login
          attempt records, and your IP address (to prevent abuse).{"\n"}
          <Text style={s.bold}>Health and lifestyle data (special category):</Text>{" "}your workout/exercise
          records (sets, reps, weight, duration), nutrition logs and meal photos, body measurements (weight,
          waist circumference, body fat percentage, etc.), mood logs and check-in messages, and your chat
          history with the AI coach.{"\n"}
          <Text style={s.bold}>Usage/technical data:</Text>{" "}your language and theme preference, push
          notification token, and in-app preferences such as goals and coach tone.
        </P>

        <Sub s={s}>1.3 Purposes of Processing</Sub>
        <P s={s}>
          Providing personalized workout/nutrition tracking and AI coaching; analyzing your progress (weight,
          training volume, nutrition, mood) to generate feedback and recommendations tailored to you; securing
          your account (authentication, abuse/rate-limit prevention, password resets); sending push
          notifications if you opt in; measuring and improving how the app works.
        </P>

        <Sub s={s}>1.4 Legal Basis</Sub>
        <P s={s}>
          General personal data such as your email and account details is processed under KVKK Article 5, for
          the establishment and performance of the service contract. Special category data such as your health
          and lifestyle records is processed{" "}
          <Text style={s.bold}>only on the basis of your explicit consent</Text>{" "}under KVKK Article 6 (see
          section 3 below).
        </P>

        <Sub s={s}>1.5 Data Transfers</Sub>
        <P s={s}>
          Your data is technically stored on our cloud hosting/infrastructure provider&apos;s servers, to the
          extent necessary to deliver the service; once the server location (domestic/international) is
          finalized, this notice will be updated. Data may be shared with competent public authorities where
          legally required. Your data is{" "}
          <Text style={s.bold}>never sold or shared with third parties for marketing or advertising purposes</Text>.
        </P>

        <Sub s={s}>1.6 How Data Is Collected</Sub>
        <P s={s}>
          Your personal data is collected electronically, directly from you, while you use the app (via the
          registration form, workout/nutrition logging, chat, etc.).
        </P>

        <Sub s={s}>1.7 Retention Period</Sub>
        <P s={s}>
          Your data is retained for as long as your account is active. When you delete your account (Profile
          &gt; Delete My Account), all your personal data is permanently deleted from our systems.
        </P>

        <Sub s={s}>1.8 Your Rights (KVKK Article 11)</Sub>
        <P s={s}>
          You may contact us to: (a) learn whether your personal data is being processed, (b) request
          information about it if so, (c) learn the purpose of processing and whether data is used accordingly,
          (d) know the third parties to whom your data is transferred, domestically or abroad, (e) request
          correction if it is incomplete or inaccurate, (f) request erasure or destruction under the conditions
          of KVKK Article 7, (g) request that any correction or erasure under (e) and (f) be notified to third
          parties your data was transferred to, (h) object to a result that is to your detriment arising solely
          from automated analysis of your data (e.g. recommendations generated by the AI coach), and (i) claim
          compensation for damages arising from unlawful processing.
        </P>
        <P s={s}>
          You can exercise these rights by writing to <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>. You can
          also download all your data from Profile &gt; My Data, and permanently delete your account and all
          your data from Profile &gt; Delete My Account.
        </P>
      </Section>

      <Section
        id="acik-riza"
        title="2. General Explicit Consent for Personal Data Processing"
        onSectionLayout={onSectionLayout}
        s={s}
      >
        <P s={s}>
          I confirm that I have read and understood the Privacy Notice above, and I give my{" "}
          <Text style={s.bold}>explicit consent</Text>{" "}for my personal data — including my email address and
          account details — to be processed by PulseCoach for the purposes described above, in accordance with
          KVKK. I understand I can withdraw this consent at any time by deleting my account or writing to{" "}
          {CONTACT_EMAIL}.
        </P>
      </Section>

      <Section
        id="saglik-verisi"
        title="3. Explicit Consent for Processing Health Data (Special Category Personal Data)"
        onSectionLayout={onSectionLayout}
        s={s}
      >
        <P s={s}>
          I understand that the following health and lifestyle data I will share while using PulseCoach — my
          workout/exercise records, my nutrition logs and meal photos, body measurements such as weight/waist
          circumference/body fat percentage, my mood logs, and my chats with the AI coach based on this data —
          qualifies as &quot;special category personal data&quot; under Article 6 of KVKK.
        </P>
        <P s={s}>
          I confirm that I give my <Text style={s.bold}>EXPLICIT CONSENT</Text>{" "}for this data to be processed by
          PulseCoach for the purpose of providing me with personalized workout/nutrition tracking and AI
          coaching.
        </P>
        <P s={s}>
          I understand that without this consent I will not be able to use the app&apos;s core functionality
          (personalized coaching); that I can withdraw this consent at any time by permanently deleting my
          account; and that doing so will delete this data from the system.
        </P>
      </Section>
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
    subTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: c.text,
      marginTop: 12,
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
