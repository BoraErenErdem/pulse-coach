import { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useLanguage } from "@/lib/language-context";
import { Card, DetailScreen, type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/app/kvkk/page.tsx'in mobil portu - AYNI TR/EN içerik ve aynı
// iki bölüm (aydinlatma/saglik-verisi). 2026-09-14'te web'le
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
// 2026-10-05 revizyonu (barındırma: Cloudvist, Türkiye): sunucu, yedek ve e-posta
// Türkiye'de; yurt dışına yalnız push (jenerik metin + jeton, Expo/Apple-Google)
// gidiyor. "Genel açık rıza" bölümü kaldırıldı - aydınlatma ile açık rıza aynı
// onayla alınamaz (Kurul 2018/90, Aydınlatma Tebliği md. 5/1-f) ve genel veriler
// zaten sözleşmenin ifası dayanağıyla işleniyor. İçerik tools/legal_texts/'ten
// üretilir; alıcı/kapsam değişirse user_service.CONSENT_VERSION artırılır.

const CONTACT_EMAIL = "destek@pulsecoachapp.com";

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
      <Section id="aydinlatma" title={"1. Aydınlatma Metni"} onSectionRef={onSectionRef} s={s}>
        <P s={s}>Son güncelleme: 5 Ekim 2026. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) madde 10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, PulseCoach&apos;u kullanırken işlenen kişisel verileriniz hakkında sizi bilgilendirmek için hazırlanmıştır. Aydınlatma metni bir onay metni değildir; sağlık verilerinizin işlenmesine ilişkin açık rızanız aşağıdaki 2. bölümde ayrıca istenir.</P>
        <Sub s={s}>1.1 Veri Sorumlusu</Sub>
        <P s={s}>PulseCoach, gerçek kişi Bora Eren Erdem tarafından bireysel ve ticari kâr amacı gütmeyen bir proje olarak işletilmektedir. KVKK kapsamında veri sorumlusu Bora Eren Erdem&apos;dir (&quot;biz&quot;). İletişim ve KVKK başvuruları: <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
        <Sub s={s}>1.2 İşlenen Kişisel Veriler ve Hukuki Sebepleri</Sub>
        <P s={s}><Text style={s.bold}>Kimlik ve iletişim:</Text> e-posta adresiniz; isteğe bağlı görünen adınız, doğum yılınız ve cinsiyetiniz (son ikisi yalnız kalori önerisi için). Google veya Apple ile giriş yaparsanız bu sağlayıcının bize ilettiği e-posta adresi ve hesap kimliği (Apple&apos;da &quot;E-postamı Gizle&quot;yi seçerseniz Apple&apos;ın aktarıcı adresi). Hukuki sebep: sözleşmenin kurulması ve ifası (KVKK md. 5/2-c).</P>
        <P s={s}><Text style={s.bold}>Hesap ve işlem güvenliği:</Text> şifreniz (geri döndürülemez biçimde hash&apos;lenmiş), oturum jetonları, giriş ve şifre sıfırlama denemeleri, IP adresiniz ve isteklerin zamanı. Hukuki sebep: sözleşmenin ifası (md. 5/2-c), veri güvenliğini sağlama yükümlülüğümüz (md. 5/2-ç, md. 12) ve hesabınızı ve sistemi kötüye kullanıma karşı korumaya yönelik meşru menfaatimiz (md. 5/2-f).</P>
        <P s={s}><Text style={s.bold}>Sağlık ve yaşam tarzı verileri (özel nitelikli kişisel veri):</Text> antrenman ve egzersiz kayıtlarınız (set, tekrar, ağırlık, süre, kardiyo), beslenme kayıtlarınız ve yemek fotoğraflarınız, vücut ölçümleriniz (kilo, boy, bel çevresi, vücut yağ oranı), hedefleriniz, profilde belirttiğiniz beslenme kısıtlamaları ve alerjiler, ruh hâli kayıtlarınız, yapay zekâ koç ile sohbet geçmişiniz ve bu verilere dayanan koç mesajları (check-in&apos;ler). Hukuki sebep: <Text style={s.bold}>yalnızca açık rızanız</Text> (KVKK md. 6/3-a; bkz. 2. bölüm).</P>
        <P s={s}><Text style={s.bold}>Uygulama tercihleri ve teknik veriler:</Text> dil, koç tonu, bildirim tercihleri ve hatırlatma saati, saat diliminiz, günlük kullanım sayaçları ve bildirimleri açarsanız cihazınızın bildirim jetonu. Hukuki sebep: sözleşmenin ifası (md. 5/2-c).</P>
        <P s={s}><Text style={s.bold}>Onay ve başvuru kayıtları:</Text> kayıt sırasında verdiğiniz onayların tarihi ve metin sürümü, KVKK başvurularınız ve bizimle yazışmalarınız. Hukuki sebep: hukuki yükümlülüklerimizin yerine getirilmesi (md. 5/2-ç) ve bir hakkın tesisi, kullanılması veya korunması (md. 5/2-e).</P>
        <Sub s={s}>1.3 İşleme Amaçları</Sub>
        <P s={s}>Hesabınızı oluşturmak ve yönetmek; antrenman, beslenme, vücut ölçümü ve ruh hâli takibi sunmak; yapay zekâ koç aracılığıyla size özel geri bildirim, özet ve öneri üretmek; yemek fotoğraflarınızdaki besinleri tanımak; hatırlatma ve bildirim göndermek (açmanız hâlinde); hesap ve sistem güvenliğini sağlamak (kimlik doğrulama, deneme sınırlaması, şifre sıfırlama, günlük kullanım kotası); KVKK başvurularınızı ve taleplerinizi yanıtlamak; yasal yükümlülüklerimizi yerine getirmek. Verileriniz reklam, pazarlama veya profilleme yoluyla satış amacıyla işlenmez.</P>
        <Sub s={s}>1.4 Toplama Yöntemi</Sub>
        <P s={s}>Kişisel verileriniz uygulamayı kullanırken doğrudan sizden (kayıt ve profil formları, kayıt ekranları, sohbet, fotoğraf yükleme) elektronik ortamda; Google veya Apple ile giriş yaparsanız bu sağlayıcılardan; IP adresi ve istek zamanı gibi teknik kayıtlar ise sistem tarafından otomatik olarak toplanır.</P>
        <Sub s={s}>1.5 Yapay Zekâ Koç ve Otomatik İşleme</Sub>
        <P s={s}>Yapay zekâ koç ve yemek fotoğrafı analizi, <Text style={s.bold}>Türkiye&apos;deki kendi sunucumuzda çalışan açık kaynaklı dil ve görüntü modelleriyle</Text> yapılır. Sohbetleriniz, fotoğraflarınız ve sağlık verileriniz OpenAI, Google veya benzeri üçüncü taraf yapay zekâ hizmetlerine <Text style={s.bold}>gönderilmez</Text> ve modelleri eğitmek için <Text style={s.bold}>kullanılmaz</Text>. Koçun önerileri verilerinizden otomatik olarak üretilir; ancak hakkınızda hukuki sonuç doğuran veya sizi önemli ölçüde etkileyen otomatik bir karar alınmaz. Münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıktığını düşünürseniz buna itiraz edebilirsiniz (1.10).</P>
        <Sub s={s}>1.6 Kişisel Verilerin Aktarılması</Sub>
        <P s={s}><Text style={s.bold}>Yurt içi:</Text> Uygulama, veritabanı ve yapay zekâ modelleri, Türkiye&apos;deki bir veri merkezinde bulunan ve <Text style={s.bold}>Cloudvist Bilişim Teknolojileri (İstanbul)</Text> tarafından sağlanan sunucuda çalışır; hesap, sağlık ve sohbet verileriniz yalnızca bu sunucuda saklanır ve işlenir. Sağlayıcı, KVKK md. 12 anlamında veri işleyen sıfatıyla yalnızca altyapıyı (donanım, elektrik, ağ) sağlar. Veritabanı yedekleri sunucudan çıkmadan şifrelenir ve <Text style={s.bold}>Türkiye&apos;de</Text> ayrı bir depolama ortamında tutulur. İşlemsel e-postalar (şifre sıfırlama, haftalık check-in haberi) <Text style={s.bold}>Türkiye&apos;de yerleşik</Text> bir e-posta hizmet sağlayıcısı aracılığıyla gönderilir. Kanunen yetkili kamu kurum ve kuruluşları ile yargı mercilerine, yalnızca yasal bir talep veya zorunluluk hâlinde aktarım yapılabilir.</P>
        <P s={s}><Text style={s.bold}>Yurt dışı (yalnızca bildirimleri açarsanız):</Text> Push bildirimleri, Expo (650 Industries, Inc., ABD) bildirim servisi ve cihazınıza göre Apple veya Google&apos;ın bildirim altyapısı üzerinden iletilir. Bu servislere yalnızca cihazınızın bildirim jetonu ve <Text style={s.bold}>genel nitelikte</Text> bir bildirim metni (ör. &quot;Koçundan yeni bir mesaj var&quot;) aktarılır; bildirim metinlerinde sağlık verisi, kilo, egzersiz veya ruh hâli bilgisi <Text style={s.bold}>yer almaz</Text>. Bu aktarım KVKK md. 9 uyarınca, Kişisel Verileri Koruma Kurulunca ilan edilen standart sözleşmeye dayanılarak yapılır. Bildirimleri dilediğiniz zaman cihaz ayarlarından veya Profil &gt; Bildirimler bölümünden kapatabilirsiniz; bildirimleri açmamanız uygulamanın diğer işlevlerini etkilemez.</P>
        <P s={s}><Text style={s.bold}>E-posta teslimi ve Google/Apple ile giriş:</Text> E-postalarımız, bize verdiğiniz adrese teslim edilir; adresiniz yurt dışında sunucusu bulunan bir sağlayıcıdaysa (ör. Gmail, Outlook, iCloud veya Apple&apos;ın &quot;E-postamı Gizle&quot; aktarıcısı) e-posta o sağlayıcının sunucularına ulaşır. Bu nedenle e-postalarımıza sağlık verisi koymayız; yalnızca şifre sıfırlama bağlantısı ve &quot;haftalık mesajın hazır&quot; haberi gönderilir. Google veya Apple ile giriş yaptığınızda kimliğinizi bu sağlayıcıların yayımladığı açık anahtarlarla doğrularız; bu sağlayıcılara sizinle ilgili bir veri göndermeyiz. Web sürümünde giriş ekranındaki &quot;Google ile devam edin&quot; düğmesi Google&apos;ın sunucularından yüklenir; bu sırada tarayıcınız Google&apos;a IP adresi gibi teknik bilgiler iletir ve bu işlem Google&apos;ın kendi gizlilik koşullarına tabidir. Bunu istemiyorsanız e-posta ve şifreyle kayıt olabilirsiniz.</P>
        <P s={s}>Verileriniz hiçbir koşulda <Text style={s.bold}>reklam veya pazarlama amacıyla üçüncü kişilere satılmaz, kiralanmaz veya paylaşılmaz</Text>; uygulamada reklam, analitik veya izleme aracı bulunmaz.</P>
        <Sub s={s}>1.7 Saklama Süreleri</Sub>
        <P s={s}><Text style={s.bold}>Hesap ve sağlık verileri:</Text> hesabınız açık olduğu sürece; hesabınızı sildiğinizde (Profil &gt; Hesabımı Sil) derhal ve kalıcı olarak.{"\n"}<Text style={s.bold}>Yemek fotoğrafları:</Text> en fazla 12 ay ve kişi başına en yeni 200 fotoğraf; daha eskileri otomatik silinir.{"\n"}<Text style={s.bold}>Giriş ve şifre sıfırlama denemeleri (e-posta/IP):</Text> 7 gün.{"\n"}<Text style={s.bold}>Sunucu erişim kayıtları (IP adresi, istek zamanı ve yolu):</Text> 14 gün.{"\n"}<Text style={s.bold}>Şifre sıfırlama bağlantıları:</Text> 1 saat geçerlidir ve tek kullanımlıktır.{"\n"}<Text style={s.bold}>Yedekler:</Text> sunucuda 14 gün, Türkiye&apos;deki ayrı yedekte 30 gün; silinen hesabın verileri yedeklerden en geç 30 gün içinde kendiliğinden çıkar ve bu sürede yedekler yalnızca bir arızadan sonra sistemi geri yüklemek için kullanılır.{"\n"}<Text style={s.bold}>Onay ve başvuru kayıtları:</Text> talebin sonuçlandırılması ve olası uyuşmazlıklar için gerekli süre boyunca, en fazla 10 yıl.{"\n"}Süresi dolan veriler, Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik&apos;e uygun olarak silinir.</P>
        <Sub s={s}>1.8 Veri Güvenliği Tedbirleri</Sub>
        <P s={s}>Şifreniz geri döndürülemez biçimde hash&apos;lenerek saklanır ve tarafımızca dahi okunamaz. Uygulama ile sunucu arasındaki tüm iletişim şifrelenir (HTTPS/TLS). Veritabanı internete kapalıdır; sunucuya yalnızca veri sorumlusu, anahtar tabanlı kimlik doğrulamayla erişir. Yedekler şifrelenir; deneme sınırlaması ve günlük kullanım kotası kötüye kullanımı önler. Özel nitelikli kişisel veriler için Kişisel Verileri Koruma Kurulunun belirlediği yeterli önlemler esas alınır. Bir veri ihlali öğrenmemiz hâlinde Kurul&apos;a en geç 72 saat içinde, etkilenen kullanıcılara ise en kısa sürede bildirim yapılır. İnternet üzerinden hiçbir iletim veya saklama yönteminin yüzde yüz güvenli olmadığını hatırlatırız.</P>
        <Sub s={s}>1.9 Çerezler, Yerel Depolama ve Yaş Sınırı</Sub>
        <P s={s}>Uygulama reklam, analitik veya izleme amaçlı çerez kullanmaz. Oturumunuzu açık tutan giriş jetonları ile dil ve tema tercihiniz yalnızca cihazınızda (tarayıcı belleği veya mobil cihaz deposu) tutulur. PulseCoach 18 yaşından küçükler için tasarlanmamıştır; 18 yaşından küçüklerin uygulamayı kullanmasına izin verilmez. 18 yaş altı bir kullanıcıya ait veri fark edersek bu veriyi sileriz; bu konuda <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresinden bize ulaşabilirsiniz.</P>
        <Sub s={s}>1.10 Haklarınız ve Başvuru Usulü (KVKK md. 11)</Sub>
        <P s={s}>Bize başvurarak (a) kişisel verinizin işlenip işlenmediğini öğrenme, (b) işlenmişse buna ilişkin bilgi talep etme, (c) işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, (ç) yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, (d) eksik veya yanlış işlenmişse düzeltilmesini isteme, (e) KVKK md. 7 çerçevesinde silinmesini veya yok edilmesini isteme, (f) (d) ve (e) kapsamındaki işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, (g) münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve (ğ) kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</P>
        <P s={s}>Başvurunuzu, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca, <Text style={s.bold}>uygulamaya kayıtlı e-posta adresinizden</Text> <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine e-posta göndererek ya da güvenli elektronik imza, mobil imza veya kayıtlı elektronik posta (KEP) ile iletebilirsiniz. Başvuruda adınız, soyadınız, kimlik bilgileriniz, tebligata esas adresiniz veya e-posta adresiniz ve talebinizin konusu yer almalıdır. Başvurunuz talebin niteliğine göre en geç otuz gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul&apos;ca belirlenen tarifedeki ücret alınabilir. Başvurunuz reddedilir, cevabı yetersiz bulunur veya süresinde cevap verilmezse, cevabı öğrendiğiniz tarihten itibaren otuz gün ve her hâlde başvuru tarihinden itibaren altmış gün içinde Kişisel Verileri Koruma Kuruluna şikâyette bulunabilirsiniz. Ayrıca uygulamada Profil &gt; Verilerim bölümünden tüm verilerinizi indirebilir, Profil &gt; Hesabımı Sil bölümünden hesabınızı ve verilerinizi kalıcı olarak silebilirsiniz.</P>
        <Sub s={s}>1.11 Metin Güncellemeleri</Sub>
        <P s={s}>Bu metinde değişiklik yaptığımızda güncelleme tarihi yukarıda belirtilir ve önemli değişiklikler uygulama içinden duyurulur. Açık rızaya dayanan işlemelerde kapsam genişlerse rızanız yeniden istenir.</P>
      </Section>
      <Section id="saglik-verisi" title={"2. Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni"} onSectionRef={onSectionRef} s={s}>
        <P s={s}>PulseCoach&apos;u kullanırken paylaşacağım antrenman ve egzersiz kayıtlarımın, beslenme kayıtlarımın ve yemek fotoğraflarımın, kilo, boy, bel çevresi ve vücut yağ oranı gibi vücut ölçümlerimin, hedeflerimin, beslenme kısıtlamalarım ve alerjilerimin, ruh hâli kayıtlarımın ve bu verilere dayanarak yapay zekâ koç ile yaptığım sohbetlerin KVKK md. 6 kapsamında <Text style={s.bold}>özel nitelikli kişisel veri (sağlık verisi)</Text> olduğunu biliyorum.</P>
        <P s={s}>Aydınlatma Metni&apos;nde açıklandığı üzere bu verilerin, bana kişiselleştirilmiş antrenman ve beslenme takibi, ilerleme analizi ve yapay zekâ koçluk hizmeti sunulması amacıyla, Türkiye&apos;deki sunucuda veri sorumlusu Bora Eren Erdem tarafından işlenmesine, saklanmasına ve bu sunucunun barındırma hizmetini sağlayan veri işleyene emanet edilmesine <Text style={s.bold}>AÇIK RIZA VERİYORUM</Text>. Bu verilerin yurt dışına aktarılmayacağı, üçüncü taraf yapay zekâ hizmetlerine gönderilmeyeceği ve reklam/pazarlama amacıyla kullanılmayacağı konusunda bilgilendirildim.</P>
        <P s={s}>Açık rızamın özgür irademe dayandığını; ancak koçluk hizmetinin doğası gereği bu veriler işlenmeden uygulamanın temel işlevlerinin sunulamayacağını biliyorum. Rızamı dilediğim zaman Profil &gt; Hesabımı Sil bölümünden ya da <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> adresine yazarak geri çekebilirim; geri çekmem ileriye etkili olur, sağlık verilerim silinir ve hizmetin bu verilere dayanan bölümü sona erer.</P>
        <P s={s}>Yapay zekâ koçun önerilerinin genel bilgilendirme amaçlı olduğunu, tıbbi teşhis veya tedavi yerine geçmediğini ve sağlığımla ilgili kararlar için bir hekime veya diyetisyene danışmam gerektiğini biliyorum (bkz. Kullanım Koşulları).</P>
      </Section>
    </>
  );
}

function EnContent({ s, onSectionRef }: { s: Styles; onSectionRef: (id: string, node: View | null) => void }) {
  return (
    <>
      <Section id="aydinlatma" title={"1. Privacy Notice"} onSectionRef={onSectionRef} s={s}>
        <P s={s}>Last updated: October 5, 2026. This notice explains, in line with Article 10 of Turkey&apos;s Law No. 6698 on the Protection of Personal Data (&quot;KVKK&quot;) and the Communiqué on the Procedures and Principles for the Obligation to Inform, how your personal data is processed while you use PulseCoach. This notice is not a consent form; your explicit consent to the processing of your health data is requested separately in section 2.</P>
        <Sub s={s}>1.1 Data Controller</Sub>
        <P s={s}>PulseCoach is operated by Bora Eren Erdem, a natural person, as an individual, non-commercial project. Bora Eren Erdem is the data controller under KVKK (&quot;we&quot;). Contact and data protection requests: <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
        <Sub s={s}>1.2 Personal Data We Process and Legal Bases</Sub>
        <P s={s}><Text style={s.bold}>Identity and contact:</Text> your email address; optionally your display name, birth year and sex (the latter two only for the calorie suggestion). If you sign in with Google or Apple, the email address and account identifier that provider shares with us (with Apple&apos;s &quot;Hide My Email&quot;, Apple&apos;s relay address). Legal basis: establishment and performance of the contract (KVKK Art. 5/2-c).</P>
        <P s={s}><Text style={s.bold}>Account and transaction security:</Text> your password (stored irreversibly hashed), session tokens, sign-in and password reset attempts, your IP address and request times. Legal basis: performance of the contract (Art. 5/2-c), our legal obligation to keep data secure (Art. 5/2-ç, Art. 12), and our legitimate interest in protecting your account and the system against abuse (Art. 5/2-f).</P>
        <P s={s}><Text style={s.bold}>Health and lifestyle data (special category personal data):</Text> your workout and exercise records (sets, reps, weight, duration, cardio), nutrition logs and meal photos, body measurements (weight, height, waist circumference, body fat percentage), goals, dietary restrictions and allergies you enter in your profile, mood logs, your chat history with the AI coach, and coach messages based on this data (check-ins). Legal basis: <Text style={s.bold}>your explicit consent only</Text> (KVKK Art. 6/3-a; see section 2).</P>
        <P s={s}><Text style={s.bold}>App preferences and technical data:</Text> language, coach tone, notification preferences and reminder time, your time zone, daily usage counters and, if you enable notifications, your device&apos;s notification token. Legal basis: performance of the contract (Art. 5/2-c).</P>
        <P s={s}><Text style={s.bold}>Consent and request records:</Text> the date and text version of the confirmations you give at sign-up, your data protection requests and our correspondence. Legal basis: fulfilling our legal obligations (Art. 5/2-ç) and establishing, exercising or protecting a right (Art. 5/2-e).</P>
        <Sub s={s}>1.3 Purposes of Processing</Sub>
        <P s={s}>Creating and managing your account; providing workout, nutrition, body measurement and mood tracking; generating personalized feedback, summaries and recommendations through the AI coach; recognizing foods in your meal photos; sending reminders and notifications (if you enable them); securing your account and the system (authentication, rate limiting, password resets, daily usage quota); responding to your data protection requests; and complying with our legal obligations. Your data is not processed for advertising, marketing or sale through profiling.</P>
        <Sub s={s}>1.4 How Data Is Collected</Sub>
        <P s={s}>Your personal data is collected electronically, directly from you while you use the app (sign-up and profile forms, logging screens, chat, photo uploads); from Google or Apple if you sign in with them; and technical records such as IP address and request time are collected automatically by the system.</P>
        <Sub s={s}>1.5 AI Coach and Automated Processing</Sub>
        <P s={s}>The AI coach and meal photo analysis run on <Text style={s.bold}>open-source language and vision models hosted on our own server in Turkey</Text>. Your chats, photos and health data are <Text style={s.bold}>never sent</Text> to third-party AI services such as OpenAI or Google and are <Text style={s.bold}>not used</Text> to train models. The coach&apos;s recommendations are generated automatically from your data; however, no automated decision producing legal effects or similarly significantly affecting you is made. If you believe an exclusively automated analysis led to a result to your detriment, you can object (1.10).</P>
        <Sub s={s}>1.6 Data Transfers</Sub>
        <P s={s}><Text style={s.bold}>Within Turkey:</Text> The app, database and AI models run on a server located in a data center in Turkey and provided by <Text style={s.bold}>Cloudvist Bilişim Teknolojileri (Istanbul)</Text>; your account, health and chat data is stored and processed only on this server. The provider acts as a data processor under KVKK Art. 12 and supplies only the infrastructure (hardware, power, network). Database backups are encrypted before they leave the server and are kept on separate storage <Text style={s.bold}>in Turkey</Text>. Transactional emails (password resets, weekly check-in notice) are sent through an email service provider <Text style={s.bold}>established in Turkey</Text>. Data may be disclosed to competent public authorities and courts only upon a lawful request or obligation.</P>
        <P s={s}><Text style={s.bold}>Abroad (only if you enable notifications):</Text> Push notifications are delivered through the Expo notification service (650 Industries, Inc., USA) and, depending on your device, Apple&apos;s or Google&apos;s notification infrastructure. Only your device&apos;s notification token and a <Text style={s.bold}>generic</Text> notification text (e.g. &quot;New message from your coach&quot;) are transferred to these services; notification texts <Text style={s.bold}>never contain</Text> health data, weight, exercise or mood information. This transfer is made under KVKK Art. 9 on the basis of the standard contract announced by the Personal Data Protection Board. You can turn notifications off at any time in your device settings or in Profile &gt; Notifications; not enabling notifications does not affect any other feature.</P>
        <P s={s}><Text style={s.bold}>Email delivery and Google/Apple sign-in:</Text> Our emails are delivered to the address you give us; if your address is with a provider whose servers are abroad (e.g. Gmail, Outlook, iCloud or Apple&apos;s &quot;Hide My Email&quot; relay), the email reaches that provider&apos;s servers. For this reason we never put health data in emails; we only send password reset links and a &quot;your weekly message is ready&quot; notice. When you sign in with Google or Apple, we verify your identity using the public keys those providers publish; we do not send them any data about you. On the web version, the &quot;Continue with Google&quot; button on the sign-in screen is loaded from Google&apos;s servers; while it loads, your browser sends Google technical information such as your IP address, which is subject to Google&apos;s own privacy terms. If you prefer to avoid this, you can sign up with email and password.</P>
        <P s={s}>Your data is <Text style={s.bold}>never sold, rented or shared with third parties for advertising or marketing</Text>; the app contains no advertising, analytics or tracking tools.</P>
        <Sub s={s}>1.7 Retention Periods</Sub>
        <P s={s}><Text style={s.bold}>Account and health data:</Text> as long as your account is open; deleted immediately and permanently when you delete your account (Profile &gt; Delete My Account).{"\n"}<Text style={s.bold}>Meal photos:</Text> at most 12 months and the latest 200 photos per person; older ones are deleted automatically.{"\n"}<Text style={s.bold}>Sign-in and password reset attempts (email/IP):</Text> 7 days.{"\n"}<Text style={s.bold}>Server access logs (IP address, request time and path):</Text> 14 days.{"\n"}<Text style={s.bold}>Password reset links:</Text> valid for 1 hour and single-use.{"\n"}<Text style={s.bold}>Backups:</Text> 14 days on the server and 30 days in the separate backup in Turkey; data of a deleted account drops out of backups automatically within 30 days at the latest, and during that time backups are used only to restore the system after a failure.{"\n"}<Text style={s.bold}>Consent and request records:</Text> for as long as needed to resolve the request and any dispute, at most 10 years.{"\n"}Data whose retention period has expired is deleted in line with the Regulation on the Deletion, Destruction or Anonymization of Personal Data.</P>
        <Sub s={s}>1.8 Data Security Measures</Sub>
        <P s={s}>Your password is stored irreversibly hashed and cannot be read even by us. All communication between the app and the server is encrypted (HTTPS/TLS). The database is not reachable from the internet; only the data controller accesses the server, using key-based authentication. Backups are encrypted; rate limiting and a daily usage quota prevent abuse. The adequate measures set by the Personal Data Protection Board for special category data are applied. If we learn of a data breach, we notify the Board within 72 hours at the latest and the affected users as soon as possible. Please note that no method of transmission or storage over the internet is 100% secure.</P>
        <Sub s={s}>1.9 Cookies, Local Storage and Age Limit</Sub>
        <P s={s}>The app does not use cookies for advertising, analytics or tracking. The tokens that keep you signed in and your language and theme preference are stored only on your device (browser storage or mobile device storage). PulseCoach is not designed for children; users under 18 are not allowed to use the app. If we become aware of data belonging to a user under 18, we delete it; you can reach us about this at <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>.</P>
        <Sub s={s}>1.10 Your Rights and How to Apply (KVKK Art. 11)</Sub>
        <P s={s}>You may contact us to (a) learn whether your personal data is processed, (b) request information about it if so, (c) learn the purpose of processing and whether data is used accordingly, (d) know the third parties to whom it is transferred in Turkey or abroad, (e) request correction if it is incomplete or inaccurate, (f) request erasure or destruction under KVKK Art. 7, (g) request that actions under (e) and (f) be notified to third parties it was transferred to, (h) object to a result to your detriment arising exclusively from automated analysis, and (i) claim compensation for damage caused by unlawful processing.</P>
        <P s={s}>Under the Communiqué on the Procedures and Principles of Application to the Data Controller, you can apply by emailing <Text style={s.linkLike}>{CONTACT_EMAIL}</Text> <Text style={s.bold}>from the email address registered in the app</Text>, or by secure electronic signature, mobile signature or registered electronic mail (KEP). Your application should include your name, surname, identity details, an address or email address for notification and the subject of your request. We respond free of charge within thirty days at the latest depending on the nature of the request; if the action requires additional cost, a fee set by the Board may apply. If your application is rejected, the response is insufficient or no response is given in time, you can file a complaint with the Personal Data Protection Board within thirty days of learning the response and in any case within sixty days of the application date. You can also download all your data from Profile &gt; My Data and permanently delete your account and data from Profile &gt; Delete My Account.</P>
        <Sub s={s}>1.11 Changes to This Notice</Sub>
        <P s={s}>When we change this notice, the update date above changes and material changes are announced in the app. If the scope of processing based on explicit consent expands, your consent is requested again.</P>
      </Section>
      <Section id="saglik-verisi" title={"2. Explicit Consent for Processing Health Data"} onSectionRef={onSectionRef} s={s}>
        <P s={s}>I understand that the workout and exercise records, nutrition logs and meal photos, body measurements such as weight, height, waist circumference and body fat percentage, goals, dietary restrictions and allergies, mood logs, and chats with the AI coach based on this data that I share while using PulseCoach are <Text style={s.bold}>special category personal data (health data)</Text> under KVKK Art. 6.</P>
        <P s={s}>As explained in the Privacy Notice, I <Text style={s.bold}>GIVE MY EXPLICIT CONSENT</Text> for this data to be processed and stored by the data controller Bora Eren Erdem on the server in Turkey, and entrusted to the data processor providing that server&apos;s hosting, for the purpose of providing me with personalized workout and nutrition tracking, progress analysis and AI coaching. I have been informed that this data will not be transferred abroad, will not be sent to third-party AI services and will not be used for advertising or marketing.</P>
        <P s={s}>I understand that my consent is freely given, but that by the nature of the coaching service the app&apos;s core features cannot be provided without processing this data. I can withdraw my consent at any time from Profile &gt; Delete My Account or by writing to <Text style={s.linkLike}>{CONTACT_EMAIL}</Text>; withdrawal takes effect for the future, my health data is deleted and the part of the service relying on it ends.</P>
        <P s={s}>I understand that the AI coach&apos;s recommendations are for general information only, do not replace medical diagnosis or treatment, and that I should consult a physician or dietitian for decisions about my health (see the Terms of Service).</P>
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
