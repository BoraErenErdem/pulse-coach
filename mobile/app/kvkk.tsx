import { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useLanguage } from "@/lib/language-context";
import { Card, DetailScreen, type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/app/kvkk/page.tsx'in mobil portu - AYNI TR/EN içerik ve aynı
// üç bölüm (aydinlatma/acik-riza/saglik-verisi). 2026-09-14'te web'le
// birlikte gözden geçirildi (bkz. web dosyasındaki değişiklik notu: somut
// alıcı kategorileri, veri güvenliği/çerez/yaş sınırı maddeleri, başvuru
// usulü + Kurul'a şikâyet hakkı, tıbbi tavsiye ayrımı - yeni /terms
// sayfasına atıf). Web'in URL anchor'ı
// (#aydinlatma) yerine RN'de `section` route param'ı + measureLayout ile
// ölçülen hedef y'ye scrollTo kullanılıyor (native'de URL fragment
// scroll'u yok, bkz. registerSectionNode). Üst seviye,
// GRUPSUZ bir route (mobile/app/kvkk.tsx) - Stack.Protected SADECE (auth) ve
// (tabs) grubunu koruyor, bu dosya listede olmadığı için hem giriş
// ÖNCESİNDE (register checkbox'larından) hem giriş SONRASINDA (Profil >
// Gizlilik ve KVKK) erişilebilir - tek dosyayla KVKK'nın "aydınlatma her
// zaman ulaşılabilir olmalı" ilkesini iki senaryoda da karşılıyor.
//
// Sunucu konumu (bkz. "1.5 Aktarım" bölümü) HENÜZ netleşmedi - RunPod'da GPU
// kiralanıp canlıya alınınca (bkz. memory: project_pulsecoach_launch_plan)
// buradaki genel ifade gerçek ülke/bölge ile GÜNCELLENMELİ.

const CONTACT_EMAIL = "pulsecoach26@gmail.com";

export default function KvkkScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { language } = useLanguage();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const scrollRef = useRef<ScrollView>(null);
  // Canlı testte İKİ ayrı bug bulundu ve sırayla düzeltildi:
  // 1) onLayout'un verdiği y, ScrollView'e göre DEĞİL kendi PARENT'ına
  //    (Card) göreydi - scrollTo(y) çok küçük kalan bir hedefe gidiyordu.
  //    measureLayout'a (hedef View'ın bir ATA'ya göre GERÇEK y'sini
  //    ölçen standart RN deseni) geçildi.
  // 2) measureLayout'un ilk argümanı olarak `findNodeHandle(scrollRef)`
  //    kullanmak web'de ÇÖKÜYORDU ("findNodeHandle is not supported on
  //    web. Use the ref property on the component instead." - RN Web'in
  //    kendi hata mesajı, LogBox'ta sessizce yakalanıyor, scrollTo hiç
  //    çağrılmıyordu). Doğrudan `scrollRef.current`'ı (node handle'a
  //    SARMADAN) geçmek hem native'de hem web'de çalışan ortak yol.
  const sectionNodesRef = useRef<Record<string, View | null>>({});
  const hasScrolledRef = useRef(false);

  function registerSectionNode(id: string, node: View | null) {
    sectionNodesRef.current[id] = node;
    if (!node || section !== id || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    // Bir sonraki tick - metin uzun olduğu için layout aşamalı oturuyor,
    // hemen ölçüm henüz kararlı olmayabilir.
    requestAnimationFrame(() => {
      const scrollNode = scrollRef.current;
      if (!scrollNode) return;
      // ScrollView'ın TS tipleri measureLayout'un beklediği NativeMethods
      // arayüzünü içermiyor (measure/measureLayout/focus/blur eksik) ama
      // hem native'de hem react-native-web'de gerçek instance bunu
      // destekliyor - measureLayout'un "relativeTo" hedefi olarak
      // kullanmak için tip sistemine dar bir cast gerekiyor.
      node.measureLayout(
        scrollNode as unknown as NonNullable<Parameters<typeof node.measureLayout>[0]>,
        (_x: number, y: number) => scrollNode.scrollTo({ y: Math.max(0, y - 12), animated: true }),
        () => {}
      );
    });
  }

  return (
    <DetailScreen title={language === "tr" ? "Gizlilik ve KVKK" : "Privacy & KVKK"}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.container}>
        <Card>
          {language === "tr" ? (
            <TrContent s={s} onSectionRef={registerSectionNode} />
          ) : (
            <EnContent s={s} onSectionRef={registerSectionNode} />
          )}
        </Card>
      </ScrollView>
    </DetailScreen>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Section({
  id,
  title,
  onSectionRef,
  s,
  children,
}: {
  id: string;
  title: string;
  onSectionRef: (id: string, node: View | null) => void;
  s: Styles;
  children: React.ReactNode;
}) {
  return (
    <View ref={(node) => onSectionRef(id, node)}>
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

function TrContent({ s, onSectionRef }: { s: Styles; onSectionRef: (id: string, node: View | null) => void }) {
  return (
    <>
      <Section id="aydinlatma" title="1. Aydınlatma Metni" onSectionRef={onSectionRef} s={s}>
        <P s={s}>
          Son güncelleme: 26 Eylül 2026. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
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
          <Text style={s.bold}>Kimlik/İletişim:</Text>{" "}e-posta adresiniz ve isteğe bağlı olarak girdiğiniz görünen ad, doğum yılı ve cinsiyet (son ikisi kalori önerisi için).{"\n"}
          <Text style={s.bold}>Hesap güvenliği:</Text>{" "}şifreniz (geri döndürülemez biçimde şifrelenmiş olarak
          saklanır), giriş denemesi kayıtları, kötüye kullanımı önlemek amacıyla IP adresiniz.{"\n"}
          <Text style={s.bold}>Sağlık ve yaşam tarzı verileri (özel nitelikli):</Text>{" "}antrenman/egzersiz
          kayıtlarınız (set, tekrar, ağırlık, süre), beslenme kayıtlarınız ve yemek fotoğraflarınız, vücut
          ölçümleriniz (kilo, boy, bel çevresi, vücut yağ oranı vb.), ruh hâli (mood) kayıtlarınız ve check-in
          mesajlarınız, yapay zekâ koç ile sohbet geçmişiniz.{"\n"}
          <Text style={s.bold}>Kullanım/teknik veriler:</Text>{" "}dil ve tema tercihiniz, push bildirim
          token&apos;ı, hedefler, koç tonu ve bildirim tercihleri (hatırlatma saati dahil) gibi uygulama içi
          tercihleriniz.
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
          Verileriniz, hizmetin verilebilmesi için gerekli olduğu ölçüde ve yalnızca aşağıdaki kategorilerdeki
          hizmet sağlayıcılarla paylaşılır: (i) sunucu barındırma/altyapı sağlayıcımız (sunucu konumu
          netleştiğinde bu metin güncellenecektir), (ii) işlemsel e-postalar (ör. şifre sıfırlama) için
          kullandığımız e-posta gönderim altyapısı, (iii) izin vermeniz hâlinde push bildirim gönderebilmek
          için kullanılan bildirim servisi (bu servis aracılığıyla cihazınızın işletim sistemine bağlı olarak
          Apple veya Google&apos;ın bildirim altyapısı). Yapay zekâ koç,{" "}
          <Text style={s.bold}>kendi sunucularımızda barındırdığımız bir modeldir</Text>; sohbet ve sağlık
          verileriniz OpenAI, Google veya benzeri üçüncü taraf yapay zekâ sağlayıcılarına{" "}
          <Text style={s.bold}>gönderilmez</Text>. Yasal bir zorunluluk bulunması hâlinde yetkili kamu kurum ve
          kuruluşlarına aktarılabilir. Verileriniz hiçbir şekilde{" "}
          <Text style={s.bold}>pazarlama/reklam amacıyla üçüncü taraflara satılmaz veya paylaşılmaz</Text>.
        </P>

        <Sub s={s}>1.6 Veri Güvenliği Tedbirleri</Sub>
        <P s={s}>
          Şifreniz geri döndürülemez biçimde (hash&apos;lenerek) saklanır ve tarafımızca dahi okunamaz.
          Uygulama ile sunucularımız arasındaki tüm iletişim şifrelenir (HTTPS/TLS). Verilerinize erişim,
          hizmetin sağlanması için gerekli olan teknik yetkilendirmeyle sınırlıdır. Bununla birlikte internet
          üzerinden hiçbir iletim veya elektronik saklama yönteminin yüzde yüz güvenli olmadığını; makul teknik
          ve idari tedbirleri aldığımızı, ancak mutlak güvenliği garanti edemeyeceğimizi bilmenizi isteriz.
        </P>

        <Sub s={s}>1.7 Toplama Yöntemi</Sub>
        <P s={s}>
          Kişisel verileriniz, uygulamayı kullanırken doğrudan sizin tarafınızdan (kayıt formu, antrenman/
          beslenme kaydı, sohbet vb. aracılığıyla) elektronik ortamda toplanır.
        </P>

        <Sub s={s}>1.8 Saklama Süresi</Sub>
        <P s={s}>
          Verileriniz, hesabınız aktif olduğu sürece saklanır. Hesabınızı sildiğinizde (Profil &gt; Hesabımı
          Sil) tüm kişisel verileriniz sistemden kalıcı olarak silinir.
        </P>

        <Sub s={s}>1.9 Çerezler ve Yerel Depolama</Sub>
        <P s={s}>
          Bu uygulama pazarlama, reklam veya izleme amaçlı çerez (cookie) kullanmaz. Oturumunuzu açık tutan
          giriş jetonlarınız ile dil/tema tercihiniz yalnızca cihazınızda tutulur ve bu bilgi ayrıca
          sunucularımıza gönderilmez.
        </P>

        <Sub s={s}>1.10 Yaş Sınırı</Sub>
        <P s={s}>
          PulseCoach 18 yaşından küçükler için tasarlanmamıştır ve bilerek 18 yaş altı kullanıcılardan veri
          toplamayız. 18 yaşından küçükseniz lütfen uygulamayı kullanmayın. Bir çocuğun bize kişisel veri
          sağladığını fark edersek bu veriyi sistemden sileriz; bu konuda bizimle{" "}
          <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>{" "}adresinden iletişime geçebilirsiniz.
        </P>

        <Sub s={s}>1.11 Haklarınız (KVKK madde 11)</Sub>
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
          kullanabilirsiniz. Başvurunuz, talebin niteliğine göre en geç otuz gün içinde ücretsiz sonuçlandırılır;
          işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulunca belirlenen
          tarifedeki ücret talep edilebilir. Başvurunuzun reddedilmesi, yetersiz bulunması veya süresinde cevap
          verilmemesi hâlinde, cevabı öğrendiğiniz tarihten itibaren otuz gün ve herhâlde başvuru tarihinizden
          itibaren altmış gün içinde Kişisel Verileri Koruma Kuruluna şikâyette bulunma hakkınız bulunmaktadır.
          Ayrıca uygulama içinden Profil &gt; Verilerim bölümünden tüm verinizi indirebilir, Profil &gt;
          Hesabımı Sil bölümünden hesabınızı ve tüm verinizi kalıcı olarak silebilirsiniz.
        </P>

        <Sub s={s}>1.12 Metin Güncellemeleri</Sub>
        <P s={s}>
          Bu metinde değişiklik yaptığımızda güncel tarih yukarıda belirtilir; önemli değişiklikleri mümkün
          olduğunca uygulama içinden de bildirmeye çalışırız.
        </P>
      </Section>

      <Section
        id="acik-riza"
        title="2. Genel Kişisel Verilerin İşlenmesine İlişkin Açık Rıza Metni"
        onSectionRef={onSectionRef}
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
        onSectionRef={onSectionRef}
        s={s}
      >
        <P s={s}>
          PulseCoach&apos;u kullanırken paylaşacağım aşağıdaki sağlık ve yaşam tarzı verilerimin — antrenman/
          egzersiz kayıtlarım, beslenme kayıtlarım ve yemek fotoğraflarım, kilo/boy/bel çevresi/vücut yağ oranı gibi
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
          Yapay zekâ koçun sunduğu önerilerin genel bilgilendirme amaçlı olduğunu, tıbbi teşhis veya tedavi
          yerine geçmediğini; sağlık durumumla ilgili kararlar için bir hekime veya diyetisyene danışmam
          gerektiğini biliyorum (bkz. Kullanım Koşulları).
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

function EnContent({ s, onSectionRef }: { s: Styles; onSectionRef: (id: string, node: View | null) => void }) {
  return (
    <>
      <Section id="aydinlatma" title="1. Privacy Notice" onSectionRef={onSectionRef} s={s}>
        <P s={s}>
          Last updated: September 26, 2026. This notice explains, in line with Article 10 of Turkey&apos;s Law
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
          <Text style={s.bold}>Identity/contact:</Text>{" "}your email address and, optionally, the display name, birth year and sex you enter (the latter two for the calorie suggestion).{"\n"}
          <Text style={s.bold}>Account security:</Text>{" "}your password (stored irreversibly hashed), login
          attempt records, and your IP address (to prevent abuse).{"\n"}
          <Text style={s.bold}>Health and lifestyle data (special category):</Text>{" "}your workout/exercise
          records (sets, reps, weight, duration), nutrition logs and meal photos, body measurements (weight, height,
          waist circumference, body fat percentage, etc.), mood logs and check-in messages, and your chat
          history with the AI coach.{"\n"}
          <Text style={s.bold}>Usage/technical data:</Text>{" "}your language and theme preference, push
          notification token, and in-app preferences such as goals, coach tone and notification preferences
          (including the reminder time).
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
          Your data is shared, only to the extent necessary to deliver the service, with the following
          categories of service providers: (i) our server hosting/infrastructure provider (once the server
          location is finalized, this notice will be updated), (ii) the email delivery infrastructure we use
          for transactional emails (e.g. password resets), (iii) if you opt in, the push notification service
          used to deliver notifications (which in turn relies on Apple&apos;s or Google&apos;s notification
          infrastructure depending on your device). The AI coach{" "}
          <Text style={s.bold}>runs on our own servers</Text>; your chat and health data is{" "}
          <Text style={s.bold}>never sent</Text>{" "}to third-party AI providers such as OpenAI or Google. Data
          may be shared with competent public authorities where legally required. Your data is{" "}
          <Text style={s.bold}>never sold or shared with third parties for marketing or advertising purposes</Text>.
        </P>

        <Sub s={s}>1.6 Data Security Measures</Sub>
        <P s={s}>
          Your password is stored irreversibly hashed and cannot be read even by us. All communication between
          the app and our servers is encrypted (HTTPS/TLS). Access to your data is limited to the technical
          authorization necessary to provide the service. That said, no method of transmission over the
          internet or electronic storage is 100% secure; we take reasonable technical and organizational
          measures but cannot guarantee absolute security.
        </P>

        <Sub s={s}>1.7 How Data Is Collected</Sub>
        <P s={s}>
          Your personal data is collected electronically, directly from you, while you use the app (via the
          registration form, workout/nutrition logging, chat, etc.).
        </P>

        <Sub s={s}>1.8 Retention Period</Sub>
        <P s={s}>
          Your data is retained for as long as your account is active. When you delete your account (Profile
          &gt; Delete My Account), all your personal data is permanently deleted from our systems.
        </P>

        <Sub s={s}>1.9 Cookies and Local Storage</Sub>
        <P s={s}>
          This app does not use cookies for marketing, advertising, or tracking purposes. The login tokens that
          keep you signed in, along with your language/theme preference, are stored only on your device and are
          not otherwise transmitted to our servers.
        </P>

        <Sub s={s}>1.10 Age Restriction</Sub>
        <P s={s}>
          PulseCoach is not designed for children under 18, and we do not knowingly collect data from users
          under 18. If you are under 18, please do not use the app. If we become aware that a child has
          provided us with personal data, we will delete it; you can reach us about this at{" "}
          <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.
        </P>

        <Sub s={s}>1.11 Your Rights (KVKK Article 11)</Sub>
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
          You can exercise these rights by writing to <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>. Depending
          on the nature of your request, we will respond free of charge within thirty days at the latest; if the
          request requires additional cost, a fee set by the Personal Data Protection Board may apply. If your
          request is rejected, found insufficient, or not answered in time, you have the right to file a
          complaint with the Personal Data Protection Board within thirty days of learning the response and, in
          any case, within sixty days of your original request. You can also download all your data from
          Profile &gt; My Data, and permanently delete your account and all your data from Profile &gt; Delete
          My Account.
        </P>

        <Sub s={s}>1.12 Changes to This Notice</Sub>
        <P s={s}>
          If we change this notice, the updated date will be shown above; we also try to notify you of material
          changes within the app where possible.
        </P>
      </Section>

      <Section
        id="acik-riza"
        title="2. General Explicit Consent for Personal Data Processing"
        onSectionRef={onSectionRef}
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
        onSectionRef={onSectionRef}
        s={s}
      >
        <P s={s}>
          I understand that the following health and lifestyle data I will share while using PulseCoach — my
          workout/exercise records, my nutrition logs and meal photos, body measurements such as weight/height/waist
          circumference/body fat percentage, my mood logs, and my chats with the AI coach based on this data —
          qualifies as &quot;special category personal data&quot; under Article 6 of KVKK.
        </P>
        <P s={s}>
          I confirm that I give my <Text style={s.bold}>EXPLICIT CONSENT</Text>{" "}for this data to be processed by
          PulseCoach for the purpose of providing me with personalized workout/nutrition tracking and AI
          coaching.
        </P>
        <P s={s}>
          I understand that the AI coach&apos;s recommendations are for general informational purposes only and
          do not constitute medical diagnosis or treatment, and that I should consult a physician or dietitian
          for decisions about my health (see the Terms of Service).
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
