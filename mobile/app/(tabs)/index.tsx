import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { ChevronDown, ChevronUp, MessageCircle, MoreVertical, Send, Sparkles, Trash2, User } from "lucide-react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import {
  ApiError,
  clearChatHistory,
  dailyTipText,
  deleteChatHistory,
  getChatHistory,
  getDailyNutritionSummary,
  getDailyTip,
  getTodayMood,
  getWeeklySummary,
  getWorkoutSessions,
  MOOD_KEYS,
  sendChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { ErrorBanner, FormInput, MOOD_META, PrimaryButton, PulseMark, Reveal, SecondaryButton, type ThemeColors, TypingIndicator, useThemeColors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";
import { MiniRhythmRing, RhythmRing, rhythmEncouragement } from "@/components/rhythm-ring";
import { QuickAddMenu } from "@/components/quick-add-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dismissible } from "@/components/dismissible";
import { BottomSheet } from "@/components/bottom-sheet";
import { tapLight } from "@/lib/haptics";

// web/src/app/(app)/chat/page.tsx'in mobil portu - Faz M2 çekirdek değer
// döngüsü. Aynı veri akışı (geçmiş+günün ipucu+bugünkü mood+profil kontrolü
// paralel yükleniyor). Koç yanıt üretirken 3 noktalı TypingIndicator
// gösteriliyor (bkz. ui.tsx, 2026-08-20 animasyon turu).
interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function toDisplayMessage(message: ConversationMessage): DisplayMessage {
  return {
    id: String(message.id),
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
  };
}

// Koç (LLM) cevapları markdown üretiyor (**kalın**, numaralı listeler vb.)
// ama eskiden {item.content} düz <Text> içine basılıyordu - kullanıcı
// ekranda yıldızları görüyordu (2026-08-14, kullanıcı canlı sohbette
// yakaladı). breaks:true tek satır sonlarını da satır kırılımı yapıyor ki
// eski görünümle tutarlı kalsın. Instance modül seviyesinde - her render'da
// yeniden oluşturulmasın.
const markdownItInstance = MarkdownIt({ typographer: true, breaks: true });

function buildMarkdownStyle(textColor: string, codeBackground: string) {
  // react-native-markdown-display'in heading1-6/hr varsayılanları (bkz.
  // node_modules/.../styles.js) renk TANIMLAMIYOR (heading'ler) ya da SABİT
  // siyah kullanıyor (hr) - koç artık uzun/detaylı cevaplarda "### Başlık"
  // üretebildiği için (bkz. backend MAX_REPLY_SENTENCES_DETAILED, 2026-08-14)
  // bunlara textColor'a bağlı EXPLICIT stil vermek gerekiyor, yoksa karanlık
  // modda ya da user balonunda (beyaz metin) başlık/ayraç görünmez kalabilirdi.
  const heading = { color: textColor, fontFamily: "Inter_700Bold", marginTop: 6, marginBottom: 4 };
  return {
    body: { fontSize: 14, color: textColor },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontFamily: "Inter_700Bold" },
    em: { fontStyle: "italic" as const },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { flexDirection: "row" as const },
    code_inline: {
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 12,
      backgroundColor: codeBackground,
      color: textColor,
    },
    heading1: { ...heading, fontSize: 18 },
    heading2: { ...heading, fontSize: 17 },
    heading3: { ...heading, fontSize: 16 },
    heading4: { ...heading, fontSize: 15 },
    heading5: { ...heading, fontSize: 14 },
    heading6: { ...heading, fontSize: 14 },
    hr: { backgroundColor: textColor, opacity: 0.2, height: 1, marginVertical: 8 },
    // Kütüphanenin varsayılan tablo stili borderColor'ı SABİT '#000000'
    // kullanıyor (bkz. node_modules/.../styles.js) - LLM detaylı cevaplarda
    // (bkz. backend MAX_REPLY_SENTENCES_DETAILED) bazen tablo da üretebiliyor
    // (canlı testte görüldü, 2026-08-14), sabit siyah kenarlık karanlık
    // modda/renkli balonda görünmez kalırdı.
    table: { borderWidth: 1, borderColor: `${textColor}4D`, borderRadius: 3, marginBottom: 8 },
    tr: { borderBottomWidth: 1, borderColor: `${textColor}33`, flexDirection: "row" as const },
    // flex:1 DEĞİL minWidth - kütüphanenin varsayılanı flex:1 kullanıyordu,
    // dar mobil ekranda bu her sütunu eşit/aşırı dar zorlayıp hücre metnini
    // kelime kelime alt alta kırıyor, tablo aşırı uzun bir dikey alan
    // kaplıyordu (canlı testte kullanıcı ekran görüntüsüyle gösterdi,
    // 2026-08-14). minWidth + aşağıdaki yatay ScrollView (bkz. tableRules)
    // ile sütunlar doğal genişliğinde kalır, taşarsa yana kaydırılır - web'in
    // overflow-x-auto çözümüyle aynı ilke.
    th: { minWidth: 110, padding: 5, color: textColor, fontFamily: "Inter_700Bold" },
    td: { minWidth: 110, padding: 5, color: textColor },
  };
}

// Kütüphanenin varsayılan table render kuralı sadece bir <View> döner (bkz.
// node_modules/.../renderRules.js) - dar mobil ekranda taşan/sıkışan bir
// tablo olduğunda yatay kaydırma imkanı yoktu. Bu override table'ı bir
// yatay ScrollView'a sarıyor (web'deki overflow-x-auto ile aynı ilke).
const tableRenderRules = {
  table: (node: unknown, children: React.ReactNode, _parent: unknown, styles: any) => (
    <ScrollView key={(node as { key: string }).key} horizontal showsHorizontalScrollIndicator>
      <View style={styles._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
};

// Kullanıcı balonunun rengi artık TEMAYA GÖRE DEĞİŞİYOR (accentSolid: açık
// temada koyu turuncu+beyaz metin, koyu temada parlak turuncu+koyu metin -
// bkz. ui.tsx'teki WCAG kontrast düzeltmesi, 2026-08-15). Bu yüzden
// markdownStyleUser artık modül seviyesinde SABİT değil, ChatTab içinde
// `c.onAccentSolid`e göre useMemo ile hesaplanıyor (bkz. aşağıdaki
// markdownStyleUser tanımı) - asistan balonunun stiliyle aynı desen.

// 2026-08-24 (Profil cilası devamı): kullanıcı balonundaki jenerik `User`
// ikonu, profil sekmesindeki kimlik kartıyla AYNI dilde (baş harf rozeti)
// konuşsun diye `initial`e çevrildi - kullanıcı bulgusu: "mobilde profil
// avatarı yerine kullanıcının isminin baş harfi yazsın". `initial` boşsa
// (ör. `user` henüz auth'tan gelmediyse) eski `User` ikonuna düşülüyor.
// Asistan tarafı da AYNI turda simetrik olarak değişti: jenerik `Bot`
// ikonu yerine markanın KENDİ kimliği (`PulseMark`, nabız motifi) - bu
// motif zaten uygulamanın her yerinde "AI/koç konuşuyor" anlamında
// kullanılıyor (giriş ekranı, sohbet geçmişi yüklenirken, InsightCard
// başlıkları). `animated`/`loop` BİLEREK verilmiyor (ikisi de default
// false) - her mesaj satırında sürekli dönen bir animasyon hem gereksiz
// performans yükü hem de dikkat dağıtıcı olurdu, burada durağan bir rozet
// yeterli.
// Boyut turu (2026-08-24, devam): kullanıcı gerçek cihazda avatardaki
// DURAĞAN PulseMark'ın (16px) hemen yanındaki "yazıyor" balonundaki
// ANİMASYONLU PulseMark'la (TypingIndicator, varsayılan 36px) aynı satırda
// göze çarpan bir büyüklük tutarsızlığı fark etti. İki yerin AYNI 36'ya
// çekilmesi burada mümkün değildi (36'lık bir işaret 28px'lik dairenin
// dışına taşardı) - bunun yerine HER İKİ uç yaklaştırıldı: avatar dairesi
// 28→34'e büyütüldü (içindeki PulseMark/baş harf/User ikonu da orantılı
// büyüdü) VE aşağıdaki TypingIndicator çağrısı kendi `size` prop'uyla
// 36'dan 26'ya küçültüldü (nutrition.tsx'teki fotoğraf analizi kullanımı
// - avatarsız, tek başına bir bağlam - varsayılan 36'da bırakıldı,
// ORADA büyük kalması doğru). Sonuç: 16 vs 36 (2,25x fark) yerine 20 vs
// 26 (1,3x fark) - aynı satırda iki nabız motifi artık aynı "aile"den
// okunuyor, birbirini yutmuyor.
function Avatar({ role, c, initial }: { role: "user" | "assistant"; c: ThemeColors; initial?: string }) {
  const isUser = role === "user";
  return (
    <View
      style={[
        avatarBaseStyle,
        { backgroundColor: isUser ? c.surfaceMuted : `${c.accent}1F` },
      ]}
    >
      {isUser ? (
        initial ? (
          <Text style={avatarInitialStyle(c)}>{initial}</Text>
        ) : (
          <User size={17} color={c.muted} />
        )
      ) : (
        <PulseMark size={20} color={c.accent} />
      )}
    </View>
  );
}

function avatarInitialStyle(c: ThemeColors) {
  return { fontSize: 14, fontFamily: "Inter_700Bold", color: c.text } as const;
}

// Rengden bağımsız (sadece boyut/şekil) - tema değişince yeniden hesaplanmasına
// gerek yok, modül seviyesinde sabit kalabiliyor.
const avatarBaseStyle = StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center" as const, justifyContent: "center" as const },
}).avatar;

export default function ChatTab() {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  // getProfile'ı burada AYRICA fetch etmiyoruz - ProfileProvider'ın
  // paylaşımlı cache'inden okuyoruz (2026-08-10 mimari borç raporu, bulgu
  // #7). Bonus: Profil ekranında hedef kaydedilince (useProfile().
  // updateProfile üzerinden) bu değer BURADA da aynı context'ten anında
  // güncellenir - eskiden bunun için ayrı bir useFocusEffect+fetch
  // gerekiyordu, artık paylaşımlı state reaktivitesi yeterli.
  const { profile } = useProfile();
  const needsProfileSetup = profile?.goal === null;
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const markdownStyleAssistant = useMemo(
    () => buildMarkdownStyle(c.text, `${c.text}14`),
    [c.text]
  );
  const markdownStyleUser = useMemo(
    () => buildMarkdownStyle(c.onAccentSolid, `${c.onAccentSolid}33`),
    [c.onAccentSolid]
  );
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayMood, setTodayMoodKey] = useState<MoodKey | null>(null);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);
  const [isTipDismissed, setIsTipDismissed] = useState(false);
  const [movementPct, setMovementPct] = useState<number | null>(null);
  const [nutritionPct, setNutritionPct] = useState<number | null>(null);
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  // İlk yüklemede FlatList'in konteyner boyutu (klavye/tab çubuğu vb.
  // yerleşimi oturmadan) İÇERİK boyutundan ayrı bir anda hazır olabiliyordu -
  // "bazen konuşma ortadan başlıyor" bug'ı (kullanıcı bulgusu, 2026-08-17).
  // onContentSizeChange (içerik değişince) TEK BAŞINA yeterli değildi çünkü
  // konteynerin kendisi geç yerleşirse bu olay hiç tetiklenmeyebiliyordu -
  // onLayout'ta bir kerelik EK bir en-alta-kaydırma bunu tamamlıyor. Sadece
  // İLK layout'ta (ref bayrağı) - her klavye açılış/kapanışında (o da bir
  // layout değişimi) kullanıcıyı yukarıda okurken zorla aşağı çekmemek için.
  const hasScrolledOnInitialLayoutRef = useRef(false);

  // "Bugün nasıl hissediyorsun / Ritim" FlatList'in İÇİNDE DEĞİL - konuşma
  // uzadıkça bunlar yukarıda gömülüp erişilemez hale geliyordu (kullanıcı
  // bulgusu, 2026-08-17). ÖNCEDEN bir BottomSheet'in ARKASINDAYDI (tıklamadan
  // görünmüyordu) - kullanıcı isteği (2026-08-21 tasarım denetimi): mood/Ritim
  // sheet'e girmeden görünsün. Artık üst barın hemen altında, sabit alanda
  // (FlatList'in DIŞINDA, o yüzden scroll'la gömülme sorunu YOK) açık bir
  // panel - varsayılan AÇIK (kullanıcı hiç dokunmadan görür), "Bugün"
  // rozetine dokununca daralıp genişleyebiliyor (sohbete daha çok yer
  // isteyen için).
  const [isTodayExpanded, setIsTodayExpanded] = useState(true);

  // Panel aç/kapa ANİMASYONU (kullanıcı isteği, 2026-08-21: "sheet açılırken
  // animasyon ekle"). Panelin içeriği (bkz. aşağıdaki render) HİÇ unmount
  // OLMUYOR (reload bug'ı - bkz. yukarıdaki not) - bu yüzden animasyon
  // `entering`/`exiting` DEĞİL, çıplak bir yükseklik+opaklık worklet'i:
  // `panelMeasuredHeight` içeriğin DOĞAL yüksekliğini (onLayout ile, aşağıda)
  // bir kere ölçer, `panelProgress` 0↔1 arası withTiming ile animasyonlanır,
  // görünen yükseklik ikisinin çarpımı. `overflow:"hidden"` sayesinde
  // 0 yükseklikte içerik hem görünmez HEM dokunulamaz (RN dokunuşu görünür
  // sınırların dışında iletmiyor) - ayrı bir pointerEvents yönetimine
  // gerek yok.
  const panelMeasuredHeight = useSharedValue<number | null>(null);
  const panelProgress = useSharedValue(isTodayExpanded ? 1 : 0);

  useEffect(() => {
    panelProgress.value = withTiming(isTodayExpanded ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [isTodayExpanded, panelProgress]);

  // Kullanıcı bulgusu (2026-08-21, telefon testi): "bir kere açıp
  // kapatınca bir daha açılmıyor ama arka plan kararıyor" - panel
  // DARALIRKEN (native tarafta, en azından Android'de) bu onLayout O
  // ANDA KÜÇÜLEN (nihai/doğal DEĞİL) yüksekliği de raporluyordu -
  // FİLTRESİZ her çağrıda üzerine yazınca `panelMeasuredHeight` neredeyse
  // sıfıra düşüyordu; bir sonraki açılışta `panelProgress` doğru şekilde
  // 1'e animasyonlanıyordu (bu yüzden arka plan karartması DOĞRU
  // tepki veriyordu, o `panelProgress`e bağlı) ama yükseklik hesabı
  // sıfıra-yakın * 1 = sıfıra-yakın kalıp panel görünmez kalıyordu.
  // Çözüm: SADECE panel GERÇEKTEN açıkken (`isTodayExpanded`) gelen
  // ölçümleri kabul et - kapanırken/kapalıyken gelen (yanlış/geçici)
  // raporlar YOK SAYILIYOR, önceki doğru ölçüm bozulmuyor.
  function handleTodayPanelLayout(e: LayoutChangeEvent) {
    if (!isTodayExpanded) return;
    const measured = e.nativeEvent.layout.height;
    if (measured > 0) panelMeasuredHeight.value = measured;
  }

  const todayPanelWrapperStyle = useAnimatedStyle(() => ({
    height: panelMeasuredHeight.value == null ? undefined : panelMeasuredHeight.value * panelProgress.value,
    overflow: "hidden",
  }));

  // Kullanıcı isteği (2026-08-22): yükseklik+opaklık akordeonu "sheet gibi"
  // hissettirmiyordu - AYRI bir iç katmana taşındı ki dıştaki yükseklik
  // kırpması bozulmasın: opaklık BURADA + hafif bir translateY (kapalıyken
  // içerik ~10px yukarıda/gizli, açılınca yerine "iniyor" - bir çekmece/sheet
  // gibi). Büyüklük bilerek küçük tutuldu ("zarif, abartısız" - bkz. proje
  // belleği), height animasyonuyla ÇAKIŞMIYOR çünkü o hâlâ dıştaki sarmalayıcıda.
  const todayPanelInnerStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value,
    transform: [{ translateY: (1 - panelProgress.value) * -10 }],
  }));

  // Panel açıkken mesaj listesinin üzerine binen hafif karartma (kullanıcı
  // isteği: "arka plana hafif bir blur ekle" - gerçek blur `expo-blur`
  // gerektirirdi, bu da yeni bir native bağımlılık/rebuild demek; kullanıcı
  // onayıyla bunun yerine BottomSheet'in ZATEN kullandığı yarı-saydam
  // karartma deseni kullanıldı, aynı `panelProgress`e bağlı - panelle TAM
  // SENKRON belirip kayboluyor). Dokununca panel kapanıyor - BottomSheet'in
  // backdrop'uyla AYNI "arka plana dokun, kapat" ilkesi.
  const todayScrimStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value * 0.4,
  }));

  // "Bugün" rozetindeki mini Ritim halkasının dolma animasyonunu sekmeye
  // HER girişte yeniden oynatmak için (kullanıcı isteği, 2026-08-18: "daha
  // canlı gözüksün") - movementPct/nutritionPct/moodPct'e bağlı kalmak
  // yeterli değildi, çünkü değerler önceki ziyaretle AYNIysa React aynı
  // state'e re-render yapmayıp animasyonu tetiklemiyordu. Sayaç deseni
  // (bkz. lib/quick-add-context.tsx'teki AYNI ilke) - her sekme girişinde
  // ARTIYOR, "aynı değer" sorunu bu şekilde ortadan kalkıyor.
  // AYNI sayaç artık rhythmEncouragement'ın cümle varyantı seçimini de
  // besliyor (kullanıcı isteği, 2026-08-19: "çeşitlilik olsun") - halka
  // animasyonu ile cümle çeşitliliği TAM AYNI anlarda ("Bugün"e her
  // girişte/dönüşte) tazelenmesi gerektiği için ayrı bir sayaç açmadık.
  const [ringReplayTick, setRingReplayTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRingReplayTick((n) => n + 1);
    }, [])
  );

  // Konuşma listesinin en altında değilken beliren "aşağı in" oku (kullanıcı
  // isteği, 2026-08-17) - scroll pozisyonu FlatList'in kendi onScroll'undan
  // izleniyor, ayrı bir kütüphaneye gerek yok.
  const SCROLL_BUTTON_THRESHOLD = 240;
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  function handleListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollToBottom(distanceFromBottom > SCROLL_BUTTON_THRESHOLD);
  }
  function scrollToLatest() {
    tapLight();
    setShowScrollToBottom(false);
    listRef.current?.scrollToEnd({ animated: true });
  }

  // "Sohbeti Yönet" - Sıfırla (geri alınabilir, veri sunucuda kalır) / Kalıcı
  // Sil (geri alınamaz) - kullanıcı isteği, 2026-08-17: çoklu sohbet yerine
  // TEK sürekli akan sohbeti temizleyip yeniden başlama kararı verildi (bkz.
  // proje belleği). İki eylem de profile-settings.tsx'teki "Tehlikeli Bölge"
  // deseniyle AYNI: önce trigger, sonra INLINE onay satırı - native Alert
  // kullanılmıyor.
  const [isManageSheetOpen, setIsManageSheetOpen] = useState(false);
  const [manageConfirm, setManageConfirm] = useState<"soft" | "hard" | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  function closeManageSheet() {
    setIsManageSheetOpen(false);
    setManageConfirm(null);
    setManageError(null);
  }

  async function handleSoftClear() {
    if (!token) return;
    setManageError(null);
    setIsManaging(true);
    try {
      await clearChatHistory(token);
      setMessages([]);
      closeManageSheet();
    } catch (err) {
      setManageError(
        err instanceof ApiError ? err.message : t("Sıfırlanamadı, tekrar dener misin?", "Couldn't reset, want to try again?")
      );
    } finally {
      setIsManaging(false);
    }
  }

  async function handleHardDelete() {
    if (!token) return;
    setManageError(null);
    setIsManaging(true);
    try {
      await deleteChatHistory(token);
      setMessages([]);
      closeManageSheet();
    } catch (err) {
      setManageError(
        err instanceof ApiError ? err.message : t("Silinemedi, tekrar dener misin?", "Couldn't delete, want to try again?")
      );
    } finally {
      setIsManaging(false);
    }
  }

  const greeting = getTimeGreeting(new Date(), language);
  // "Bugün" rozetindeki metin - kullanıcı isteği (2026-08-21): jenerik
  // "Bugün" kelimesi yerine gerçek tarih ("21 Ağustos Cuma" gibi) daha
  // bilgilendirici. useMemo YOK - gün değişimi ekranın açık kalma süresi
  // içinde önemsenmeyecek kadar nadir, her render'da yeniden hesaplamak
  // ucuz (tek Intl çağrısı).
  const todayLabel = formatDate(new Date().toISOString(), language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const moodPct = todayMood ? (MOOD_KEYS.indexOf(todayMood) + 1) * 20 : null;

  // web'de her Sohbet sayfası ziyaretinde bileşen yeniden mount olduğu için
  // (route değişimi) yeni bir ipucu otomatik geliyor - mobile'da tab'lar
  // unmount OLMADIĞI için (bkz. proje belleği) aynı davranışı elde etmek
  // için useFocusEffect kullanılıyor: sekmeye HER dönüşte (X ile kapatılmış
  // olsa da olmasa da) taze bir ipucu çekilip dismiss durumu sıfırlanıyor
  // (2026-08-08, kullanıcı isteği: web'deki "sekme değişince yeni ipucu"
  // davranışı mobile'da da olsun). language BİLEREK deps'te değil: backend
  // ipucunun hem tr hem en metnini birlikte döndürüyor (bkz. dailyTipText()).
  // refreshDailyTip fonksiyona çıkarıldı - "Bugün" rozetine her dokunuşta da
  // (bkz. openTodaySheet) AYNI tazeleme tetikleniyor (kullanıcı isteği,
  // 2026-08-17), sadece sekme odağında değil.
  const refreshDailyTip = useCallback(() => {
    if (!token) return;
    setIsTipDismissed(false);
    getDailyTip(token)
      .then((result) => setDailyTip(result))
      .catch(() => {});
  }, [token]);

  useFocusEffect(refreshDailyTip);

  // ÖNCEDEN genişlerken ringReplayTick'i de artırıyordu (mood/Ritim/ipucu
  // "baştan oynasın" diye) - ama panel o zaman `RevealOnMount` ile her
  // daralt/genişlette GERÇEKTEN mount/unmount oluyordu, bu da MoodPicker'ın
  // kendi useFocusEffect'ini tekrar tetikleyip bir an boş görünmesine, Ritim
  // halkasının sıfırdan dolmasına, cümlenin değişmesine yol açıyordu -
  // kullanıcı bulgusu (2026-08-21): "sohbet sayfası yeniden yükleniyor
  // gibi". Panel artık HİÇ unmount olmuyor (bkz. render'daki `display`
  // notu) - içindeki hiçbir şey sıfırlanmıyor, o yüzden burada YENİDEN
  // oynatmaya da gerek kalmadı. Sekmeye HER dönüşte zaten AYRI bir
  // useFocusEffect ringReplayTick'i artırıyor (bkz. yukarısı) - "taze"
  // hissi hâlâ var, sadece manuel aç/kapa'ya BAĞLI değil artık.
  function toggleTodayPanel() {
    tapLight();
    setIsTodayExpanded((prev) => !prev);
  }

  // Tip banner'ı hem "Bugün" BottomSheet'inde hem de boş sohbet ekranında
  // (bkz. ListEmptyComponent) göstermek için TEK yerden - ayrı bir
  // bileşen OLARAK TANIMLAMIYORUZ (function TipBanner() {...}) çünkü her
  // render'da yeni bir bileşen kimliği oluşturup Dismissible'ın jest/
  // animasyon durumunu sıfırlardı (ör. mesaj kutusuna her tuş vuruşunda);
  // düz bir fonksiyon çağrısı JSX'i doğrudan yerine yerleştirir, ayrı bir
  // bileşen sınırı açmaz.
  function renderTipBanner() {
    if (!dailyTip || isTipDismissed) return null;
    return (
      <Dismissible onDismiss={() => setIsTipDismissed(true)}>
        <View style={s.tipBanner}>
          <Text style={s.tipIcon}>{dailyTip.icon}</Text>
          <Text style={s.tipText}>
            <Text style={s.tipCategory}>{dailyTipText(dailyTip, language).category}: </Text>
            {dailyTipText(dailyTip, language).tip}
          </Text>
          <Text style={s.tipSwipeHint}>{t("kaydır", "swipe")}</Text>
        </View>
      </Dismissible>
    );
  }

  // ÖNCEDEN ("renderTipStrip") üst barın DEVAMI gibi tam genişlikte, kendi
  // accent-tonlu arka planı olan ayrı bir şerit olarak, Bugün panelinin
  // DIŞINDA (altında) render ediliyordu - o tasarımın gerekçesi "üst barın
  // hemen altında duruyor, sheet'e girmeden görünsün"dü (panel o zaman
  // varsayılan KAPALIYDI). Panel artık varsayılan AÇIK olduğu için (bkz.
  // isTodayExpanded), ipucu ARTIK panelin kendi İÇİNDE, ince/vurgusuz tek
  // bir satır - kullanıcı geri bildirimi (2026-08-21): ayrı şerit, araya
  // kart-görünümlü panel girince "üst barın devamı" gibi görünmekten
  // çıkıp yalnız/uyumsuz kalmıştı. Artık panel kapatılınca ipucu da
  // (mood/ritim gibi) birlikte gizleniyor - tutarlı, ayrı bir "tıklamazsa
  // boşa gidiyor" endişesi yok çünkü panel zaten varsayılan görünür.
  // Muted renk + kenarlık YOK (renderTipBanner'ın kart hâlinden BİLEREK
  // farklı) - kişisel mood/Ritim içeriğinin yanında jenerik bir bilgi
  // kırıntısı olduğu belli olsun, ikincil/dipnot gibi okunsun diye.
  function renderTipInline() {
    if (!dailyTip || isTipDismissed) return null;
    return (
      <Dismissible onDismiss={() => setIsTipDismissed(true)}>
        <View style={s.tipInline}>
          <Text style={s.tipIcon}>{dailyTip.icon}</Text>
          <Text style={s.tipInlineText}>
            <Text style={s.tipInlineCategory}>{dailyTipText(dailyTip, language).category}: </Text>
            {dailyTipText(dailyTip, language).tip}
          </Text>
          <Text style={s.tipSwipeHint}>{t("kaydır", "swipe")}</Text>
        </View>
      </Dismissible>
    );
  }

  // Tab'lar unmount OLMADIĞI için (bkz. proje belleği) düz useEffect burada
  // sadece İLK mount'ta çalışır - kullanıcı Profil'de mood/hedefini
  // değiştirip Sohbet'e geri dönse bile bu state'ler bayat kalırdı (aynı
  // dosyadaki günlük ipucu banner'ıyla AYNI bug sınıfı, 2026-08-10 pürüz
  // taramasında bulundu). useFocusEffect ile sekmeye HER dönüşte tazeleniyor.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getTodayMood(token)
        .then((mood) => setTodayMoodKey(mood?.mood_key ?? null))
        .catch(() => {});
    }, [token])
  );

  // "Ritim" bileşik skoru için (bkz. RhythmRing) - hareket+beslenme
  // girdileri, mood'un aksine ayrı state'e yazılıyor çünkü mood zaten
  // MoodPicker'ın kendi seçim akışında canlı tutuluyor (onMoodChange).
  // Hareket için özel bir "bugün antrenman var mı" endpoint'i yok - tek
  // günlük aralıkla (days=1) oturum listesi çekilip varlığına bakılıyor,
  // ek backend değişikliği gerekmiyor.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getWorkoutSessions(token, 1, 1)
        .then((sessions) => setMovementPct(sessions.length > 0 ? 100 : 0))
        .catch(() => setMovementPct(null));
      getDailyNutritionSummary(token)
        .then((summary) =>
          setNutritionPct(
            summary.calorie_goal ? Math.min(100, Math.round((summary.total_calories_kcal / summary.calorie_goal) * 100)) : null
          )
        )
        .catch(() => setNutritionPct(null));
    }, [token])
  );

  // Kişisel cümleye ara sıra eklenen streak notu için (kullanıcı isteği,
  // 2026-08-21 - bkz. rhythm-ring.tsx::rhythmEncouragement'taki not, ayrı
  // bir rozet YERİNE mevcut cümleye entegre edildi). İlerleme/Profil'in
  // kullandığı AYNI endpoint - yeni backend alanı gerekmiyor.
  const [streakDays, setStreakDays] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getWeeklySummary(token)
        .then((summary) => setStreakDays(summary.streak_days))
        .catch(() => {});
    }, [token])
  );

  // Kayıt sonrası profil bilgisi yoksa koç zayıf öneriler veriyor - zorla
  // yönlendirmek yerine boş sohbet ekranında nazik bir davet gösteriliyor
  // (web'deki aynı bilinçli kapsam kararı) - needsProfileSetup artık
  // yukarıda ProfileProvider'dan türetiliyor, ayrı bir fetch/state
  // gerekmiyor.

  useEffect(() => {
    if (!token) return;
    getChatHistory(token)
      .then((history) => setMessages(history.map(toDisplayMessage)))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("Geçmiş yüklenemedi.", "Couldn't load history.")))
      .finally(() => setIsLoadingHistory(false));
  }, [token, t]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages, isSending]);

  async function handleSubmit() {
    if (!token || !input.trim() || isSending) return;

    const text = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: text }]);
    setIsSending(true);

    try {
      const response = await sendChatMessage(token, text);
      setMessages((prev) => [
        ...prev,
        { id: `local-reply-${Date.now()}`, role: "assistant", content: response.reply },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Mesaj gönderilemedi, tekrar dener misin?", "Couldn't send the message, want to try again?"));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={s.topBar}>
          {/* "Bugün" (Mood/Ritim) ARTIK bir sheet'in ARKASINDA DEĞİL - hemen
              altta, sabit bir panelde (bkz. aşağı) VARSAYILAN AÇIK duruyor
              (kullanıcı isteği, 2026-08-21 tasarım denetimi: "sheete
              tıklanmadan görünsün"). Bu rozet artık panel için bir
              daralt/genişlet anahtarı - accent-tonlu dolgu+çerçeve ile diğer
              nötr üst bar ikonlarından bilerek AYRIŞIYOR (kullanıcı geri
              bildirimi, 2026-08-17). Bugünkü mood seçiliyse emoji'si de
              görünüyor - panel daraltılmışken bile bir bakışta bilgi.
              Kapatılmamış bir ipucu varsa küçük bir nokta. Şevron panelin
              açık/kapalı durumunu gösteriyor. */}
          <Pressable onPress={toggleTodayPanel} style={s.todayChip} hitSlop={4}>
            <Sparkles size={14} color={c.accent} />
            <Text style={s.todayChipText}>{todayLabel}</Text>
            {todayMood ? <Text style={s.todayChipMoodEmoji}>{MOOD_META[todayMood].emoji}</Text> : null}
            {/* Ritim halkasının minyatür önizlemesi (kullanıcı isteği,
                2026-08-18) - panel daralmışken de bir bakışta "bugün nasıl
                gidiyor" sinyali. */}
            <MiniRhythmRing
              movementPct={movementPct}
              nutritionPct={nutritionPct}
              moodPct={moodPct}
              replayKey={ringReplayTick}
            />
            {dailyTip && !isTipDismissed ? <View style={s.todayChipDot} /> : null}
            {isTodayExpanded ? (
              <ChevronUp size={14} color={c.accent} />
            ) : (
              <ChevronDown size={14} color={c.accent} />
            )}
          </Pressable>
          <View style={s.topBarRight}>
            <ThemeToggle />
            <Pressable onPress={() => setIsManageSheetOpen(true)} style={s.iconButton} hitSlop={8}>
              <MoreVertical size={18} color={c.muted} />
            </Pressable>
          </View>
        </View>

        {/* Ruh hali seçici + kişisel cümle + ipucu + Ritim halkası - ÖNCEDEN
            sadece "Bugün" rozetine dokununca açılan bir BottomSheet'in
            İÇİNDEYDİ, kullanıcı isteğiyle (2026-08-21) sabit/dokunmadan
            görünür bir panele taşındı. FlatList'in DIŞINDA (2026-08-17'deki
            "gömülme" sorununu tekrar YARATMAZ).
            İKİNCİ tur (aynı gün): panel önceden `RevealOnMount` ile
            GERÇEKTEN mount/unmount oluyordu - MoodPicker'ın useFocusEffect'i
            her seferinde yeniden tetiklenip bir an boş görünüyordu, Ritim
            sıfırdan doluyordu - "sayfa yeniden yükleniyor gibi" bulgusu.
            ÜÇÜNCÜ tur (kullanıcı isteği: "açılırken animasyon ekle"): panel
            artık HİÇ unmount OLMUYOR - dıştaki `Animated.View`
            (`todayPanelWrapperStyle`) `onLayout` ile ölçülen doğal
            yüksekliği `panelProgress`e (0↔1, withTiming) göre animasyonlu
            daraltıp genişletiyor, `overflow:"hidden"` ile taşan kısmı
            gizliyor - içindeki hiçbir state sıfırlanmıyor (bkz. yukarıdaki
            not). DÖRDÜNCÜ tur (kullanıcı isteği: "daha sheet gibi olsun"):
            opaklık + hafif translateY (`todayPanelInnerStyle`) AYRI bir iç
            katmana taşındı - dıştaki sarmalayıcı SADECE yüksekliği kırpıyor,
            içerik kendi katmanında hafifçe "iniyor/kalkıyor".
            `Reveal` İÇERDE kalmaya devam ediyor - o SEKMEYE dönüşte
            (useFocusEffect) ayrıca fade-in oynuyor, ikisi bağımsız/çakışmıyor. */}
        <Animated.View style={todayPanelWrapperStyle}>
          <Animated.View style={todayPanelInnerStyle} onLayout={handleTodayPanelLayout}>
            <Reveal style={s.todayPanel}>
              <MoodPicker onMoodChange={setTodayMoodKey} />
              {/* Kullanıcı bulgusu (2026-08-21): "dümdüz yazı gibi durmasın
                  çok soğuk ve developer aşaması gibi duruyor" - düz
                  <Text> yerine artık uygulamanın KENDİ "bunu oku" diline
                  oturan sıcak vurgu kartı (bkz. ui.tsx::InsightCard/
                  insightBg-insightAccent, haftalık özet içgörüsünde AYNI
                  dil kullanılıyor) - ad-hoc yeni bir stil İCAT ETMEK yerine
                  zaten kanıtlanmış bir görsel dil ödünç alındı. Tam
                  InsightCard bileşeni KULLANILMADI çünkü o title+message
                  ikilisi bekliyor - burada tek bir sıcak cümle var, ayrı bir
                  başlık satırı ("Bugün" zaten üst barda) fazlalık olurdu. */}
              <View style={s.todayEncouragementCard}>
                <Text style={s.todayEncouragementIcon}>✨</Text>
                <Text style={s.todayEncouragement}>
                  {rhythmEncouragement(todayMood, movementPct, nutritionPct, user ? nameFromEmail(user.email) : undefined, t, ringReplayTick, streakDays)}
                </Text>
              </View>
              {/* İpucu RhythmRing'den ÖNCE (kullanıcı bulgusu: "çok altta ve
                  sönük kalıyor") + okunaklı renk (bkz. tipInlineText notu).
                  `isTodayExpanded &&` İLE KOŞULLU render ediliyor - panelin
                  GERİ KALANINDAN (yukarıdaki yükseklik animasyonu) BİLEREK
                  FARKLI: `Dismissible` içindeki `GestureDetector` (react-
                  native-gesture-handler), bir görünüm sıfır yüksekliğe/
                  `display:none`'a küçülüp tekrar büyüyünce native jest
                  tanıyıcısını doğru yeniden ÖLÇEMİYOR - kullanıcı bulgusu:
                  "ipucuyu kaydıramıyorum, buglanmış". Dismissible'ın kendi
                  paylaşımlı değerleri (kaydırma sırasındaki geçici animasyon
                  durumu) zaten HER seferinde varsayılan konumda başladığı
                  için gerçek mount/unmount burada TAMAMEN güvenli - mood/
                  Ritim'in aksine kaybedilecek bir şey yok. */}
              {isTodayExpanded ? renderTipInline() : null}
              <RhythmRing movementPct={movementPct} nutritionPct={nutritionPct} moodPct={moodPct} variantSeed={ringReplayTick} />
            </Reveal>
          </Animated.View>
        </Animated.View>

        {isLoadingHistory ? (
          <View style={s.centerFill}>
            <PulseMark size={40} color={c.accent} animated loop />
            <Text style={s.loadingLabel}>{t("Sohbet geçmişi yükleniyor...", "Loading chat history...")}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => {
              // Sadece İLK layout'ta - bkz. hasScrolledOnInitialLayoutRef notu.
              if (!hasScrolledOnInitialLayoutRef.current) {
                hasScrolledOnInitialLayoutRef.current = true;
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            ListEmptyComponent={
              // Diğer tüm sekmelerin (İlerleme/Antrenman/Beslenme/Profil)
              // içeriği `Reveal` ile odaklanınca yumuşak bir kayma+opaklıkla
              // giriyor - Sohbet'in mesaj listesinin KENDİSİ bilerek buna
              // dahil DEĞİL (gerçek bir konuşmanın her sekme değişiminde
              // yeniden "içeri kayması" garip/bozuk hissettirirdi), ama boş
              // ekran (ilk kullanım/"Sohbeti Sıfırla" sonrası) tam da diğer
              // sekmelerdeki "kart" içeriğiyle aynı karakterde statik bir
              // blok - 2026-08-21 görsel tutarlılık taramasında bu ekranın
              // TEK animasyonsuz sekme olduğu fark edildi, buraya eklendi.
              <Reveal style={s.emptyState}>
                <View style={s.emptyIconWrap}>
                  <MessageCircle size={26} color={c.accent} />
                </View>
                {user ? (
                  <Text style={s.emptyGreeting}>
                    {greeting}, {nameFromEmail(user.email)}!
                  </Text>
                ) : null}
                <Text style={s.emptySubtext}>{getMoodAwareSubtext(todayMood, language)}</Text>
                {needsProfileSetup ? (
                  <Link href="/profile-settings" style={s.ctaLink}>
                    ✨ {t("Daha kişisel öneriler için hedefini/bilgilerini paylaş", "Share your goals/info for more personal suggestions")}
                  </Link>
                ) : null}
                {/* Boş ekranda (ilk kullanım YA DA "Sohbeti Sıfırla" sonrası)
                    kullanıcıyı sohbete İTMEK için mood seçici + günün ipucu
                    burada da beliriyor - kullanıcı isteği, 2026-08-18:
                    "Sohbeti Sıfırla" sonrası boş sayfa çok pasif kalıyordu.
                    Ritim halkası BİLEREK burada YOK - taze/sıfırlanmış bir
                    günde tüm segmentler %0 gösterip motive etmek yerine
                    tam tersi bir izlenim bırakırdı.
                    SADECE panel DARALTILMIŞKEN (2026-08-21, ipucu Bugün
                    panelinin içine taşındıktan sonra eklendi) - panel
                    AÇIKKEN üstte zaten kendi MoodPicker'ı + ipucu satırı
                    görünüyor, ikisini BİRDEN göstermek (aynı MoodPicker'ın
                    iki kopyası ekranda) gereksiz tekrar olurdu. */}
                {!isTodayExpanded ? (
                  <View style={s.emptyNudge}>
                    <MoodPicker onMoodChange={setTodayMoodKey} />
                    {renderTipBanner()}
                  </View>
                ) : null}
              </Reveal>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  s.messageRow,
                  item.role === "user" ? s.messageRowUser : s.messageRowAssistant,
                ]}
              >
                {item.role === "assistant" ? <Avatar role="assistant" c={c} /> : null}
                <View
                  style={[
                    s.bubble,
                    item.role === "user" ? s.bubbleUser : s.bubbleAssistant,
                  ]}
                >
                  <Markdown
                    markdownit={markdownItInstance}
                    style={item.role === "user" ? markdownStyleUser : markdownStyleAssistant}
                    rules={tableRenderRules}
                  >
                    {item.content}
                  </Markdown>
                </View>
                {item.role === "user" ? (
                  <Avatar role="user" c={c} initial={user ? user.email.charAt(0).toUpperCase() : undefined} />
                ) : null}
              </View>
            )}
            ListFooterComponent={
              isSending ? (
                <View style={[s.messageRow, s.messageRowAssistant]}>
                  <Avatar role="assistant" c={c} />
                  <View style={[s.bubble, s.bubbleAssistant]}>
                    {/* size=26 - avatardaki PulseMark'la (20px) aynı satırda
                        boyut tutarsızlığı yaşanmasın diye varsayılan 36'dan
                        küçültüldü, bkz. Avatar'ın üstündeki not. */}
                    <TypingIndicator size={26} />
                  </View>
                </View>
              ) : null
            }
          />
          {/* Panel açıkken mesaj listesinin üzerine hafif karartma (bkz.
              todayScrimStyle notu) - panelle TAM SENKRON (aynı
              `panelProgress`), odağı panele çeker. `isTodayExpanded` iken
              DEĞİL panel TAMAMEN kapalıyken de rendered kalıyor (opacity 0,
              pointerEvents "none") - koşullu mount/unmount YOK, sadece
              görünürlük/dokunabilirlik değişiyor. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, s.todayScrim, todayScrimStyle]}
            pointerEvents={isTodayExpanded ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={toggleTodayPanel} />
          </Animated.View>
          {showScrollToBottom ? (
            <Pressable onPress={scrollToLatest} style={s.scrollToBottomButton}>
              <ChevronDown size={20} color={c.onAccentSolid} />
            </Pressable>
          ) : null}
          </View>
        )}

        {error ? (
          <View style={{ paddingHorizontal: 16 }}>
            <ErrorBanner message={error} />
          </View>
        ) : null}

        <View style={s.inputRow}>
          <QuickAddMenu />
          <FormInput
            value={input}
            onChangeText={setInput}
            placeholder={getMoodAwarePlaceholder(todayMood, language)}
            editable={!isSending}
            style={{ flex: 1 }}
            multiline
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSending || !input.trim()}
            hitSlop={4}
            style={[s.sendButton, (isSending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Send size={18} color={c.onAccentSolid} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={isManageSheetOpen} onClose={closeManageSheet}>
        <Text style={s.sheetTitle}>{t("Sohbeti Yönet", "Manage Chat")}</Text>
        {manageError ? <ErrorBanner message={manageError} /> : null}

        <View style={s.manageRow}>
          <Text style={s.manageRowTitle}>{t("Sohbeti Sıfırla", "Reset Chat")}</Text>
          <Text style={s.manageRowDesc}>
            {t(
              "Ekranı ve koçun bağlamını temizler, sıfırdan başlarsın - geçmiş mesajların sunucuda saklanmaya devam eder.",
              "Clears the screen and the coach's context so you start fresh - your past messages stay saved on the server."
            )}
          </Text>
          {manageConfirm === "soft" ? (
            <View style={s.manageConfirmRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton onPress={handleSoftClear} disabled={isManaging} loading={isManaging}>
                  {isManaging ? t("Sıfırlanıyor...", "Resetting...") : t("Onayla, Sıfırla", "Confirm, Reset")}
                </PrimaryButton>
              </View>
              <SecondaryButton onPress={() => setManageConfirm(null)} disabled={isManaging}>
                {t("Vazgeç", "Cancel")}
              </SecondaryButton>
            </View>
          ) : (
            <SecondaryButton onPress={() => setManageConfirm("soft")}>{t("Sohbeti Sıfırla", "Reset Chat")}</SecondaryButton>
          )}
        </View>

        <View style={s.manageRow}>
          <Text style={[s.manageRowTitle, { color: c.error }]}>
            {t("Sohbeti Kalıcı Olarak Sil", "Permanently Delete Chat")}
          </Text>
          <Text style={s.manageRowDesc}>
            {t(
              "GERİ ALINAMAZ - tüm sohbet geçmişin sunucudan tamamen silinir.",
              "CANNOT BE UNDONE - your entire chat history is permanently removed from the server."
            )}
          </Text>
          {manageConfirm === "hard" ? (
            <View style={s.manageConfirmRow}>
              <View style={{ flex: 1 }}>
                <PrimaryButton onPress={handleHardDelete} disabled={isManaging} loading={isManaging}>
                  {isManaging ? t("Siliniyor...", "Deleting...") : t("Kalıcı Olarak Sil", "Delete Permanently")}
                </PrimaryButton>
              </View>
              <SecondaryButton onPress={() => setManageConfirm(null)} disabled={isManaging}>
                {t("Vazgeç", "Cancel")}
              </SecondaryButton>
            </View>
          ) : (
            <SecondaryButton onPress={() => setManageConfirm("hard")}>
              <Trash2 size={14} color={c.error} /> {"  "}
              <Text style={{ color: c.error, fontFamily: "Inter_600SemiBold" }}>{t("Kalıcı Olarak Sil", "Permanently Delete")}</Text>
            </SecondaryButton>
          )}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    topBarRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    // Accent-tonlu dolgu+çerçeve - önceki nötr (surfaceMuted) hali diğer üst
    // bar ikonlarından ayrışmıyordu, "Bugün"ün gerçek bir giriş noktası
    // olduğu belli olmuyordu (kullanıcı geri bildirimi, 2026-08-17).
    todayChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: `${c.accent}1F`,
      borderWidth: 1,
      borderColor: `${c.accent}40`,
    },
    todayChipText: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.accent,
    },
    todayChipMoodEmoji: {
      fontSize: 13,
    },
    // Bugünün ipucu henüz kapatılmadıysa küçük bir nokta - "Bugün"
    // sohbet listesinden çıkınca (bkz. dosya başı not) kaybolan eski
    // keşfedilebilirliğin yerine geçen minimal bir sinyal.
    todayChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.accent,
    },
    // "Bugün" panelinin dış çerçevesi - üst bardan hemen sonra geliyor,
    // kendi kenar boşluğu var (MoodPicker/RhythmRing'in kendi iç
    // desenleriyle çakışmasın).
    todayPanel: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 4,
    },
    // Panel açıkken mesaj listesinin üstüne binen karartma - bkz.
    // todayScrimStyle notu. Renk BottomSheet'in backdrop'uyla AYNI
    // (`#000000A6`'nın daha HAFİF bir versiyonu, opaklık zaten
    // `panelProgress*0.4` ile ayrıca sınırlanıyor) - temadan bağımsız sabit
    // siyah, bir "karartma katmanı" her iki temada da böyle okunur.
    todayScrim: {
      backgroundColor: "#000000",
    },
    // İpucu artık Bugün panelinin İÇİNDE, ince bir satır - bkz.
    // renderTipInline notu. ÖNCEDEN ("tipStrip") kendi accent-tonlu arka
    // planı olan, kenardan kenara ayrı bir şeritti - panel içine taşınca
    // o ağırlık gereksiz kaldı: üstteki ince çizgi encouragement metninden
    // görsel olarak ayırmaya yetiyor, arka plan/kenarlık YOK.
    tipInline: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingTop: 10,
      marginTop: 2,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    // Bkz. yukarıdaki JSX notu - InsightCard'ın AYNI görsel dili
    // (insightBg/insightAccent) ödünç alındı, tam bileşen değil (title
    // gerektiriyor, burada gereksiz).
    todayEncouragementCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderRadius: 12,
      padding: 12,
      backgroundColor: c.insightBg,
    },
    todayEncouragementIcon: {
      fontSize: 13,
      lineHeight: 18,
    },
    todayEncouragement: {
      flex: 1,
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
    // Konuşma en altta değilken beliren "aşağı in" oku (kullanıcı isteği,
    // 2026-08-17) - input satırının hemen üzerinde, sağ kenar hizasında.
    scrollToBottomButton: {
      position: "absolute",
      right: 16,
      bottom: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSolid,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: c.text },
    manageRow: { gap: 8 },
    manageRowTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: c.text },
    manageRowDesc: { fontSize: 12, color: c.muted, lineHeight: 17 },
    manageConfirmRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    tipBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.insightBg,
    },
    tipIcon: {
      fontSize: 14,
    },
    tipText: {
      flex: 1,
      fontSize: 12,
      color: c.text,
      lineHeight: 17,
    },
    tipCategory: {
      fontFamily: "Inter_700Bold",
    },
    // tipText/tipCategory'nin panel-içi varyantı - İLK sürümde c.muted
    // kullanıyordu ama kullanıcı bulgusu (2026-08-21): "çok altta ve sönük
    // kalıyor" - üstteki ince çizgi (bkz. tipInline) zaten "ikincil/dipnot"
    // ayrımını yapıyor, ayrıca metni de soluklaştırmak OKUNMASINI
    // zorlaştırıyordu. Artık c.text (todayEncouragement ile AYNI) - sadece
    // kategori etiketi accent tonuyla hafif öne çıkıyor.
    tipInlineText: {
      flex: 1,
      fontSize: 12,
      color: c.text,
      lineHeight: 17,
    },
    tipInlineCategory: {
      fontFamily: "Inter_700Bold",
      color: c.accent,
    },
    tipSwipeHint: {
      fontSize: 10,
      color: c.muted,
      alignSelf: "center",
    },
    centerFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingLabel: {
      fontSize: 13,
      color: c.muted,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 10,
      flexGrow: 1,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: `${c.accent}1F`,
      alignItems: "center",
      justifyContent: "center",
    },
    // Fraunces SADECE büyük punto (bkz. redesign planı) - karşılama metni bu
    // kuralın mobil karşılığı, web'deki .font-display'in RN eşdeğeri.
    emptyGreeting: {
      fontSize: 20,
      fontFamily: "Fraunces_600SemiBold",
      color: c.text,
    },
    emptySubtext: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
      maxWidth: 280,
    },
    ctaLink: {
      marginTop: 4,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: c.accent,
      textAlign: "center",
    },
    emptyNudge: {
      width: "100%",
      marginTop: 12,
      gap: 4,
    },
    // alignItems önceden "flex-end" idi - tek satırlık mesajlarda sorun
    // yaratmıyordu ama koçun çok satırlı (3-4 satır) cevaplarında 🤖
    // avatarı SON satırın hizasına düşüyordu, "kim konuşuyor" ipucu ilk
    // satırdan kopuk görünüyordu (2026-08-21 tasarım denetimi, Sohbet
    // yerleşimi turu). "flex-start" avatarı balonun İLK satırıyla
    // hizalar - WhatsApp/Telegram/iMessage'daki standart desen.
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    messageRowUser: {
      justifyContent: "flex-end",
    },
    messageRowAssistant: {
      justifyContent: "flex-start",
    },
    bubble: {
      maxWidth: "75%",
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    bubbleUser: {
      backgroundColor: c.accentSolid,
    },
    bubbleAssistant: {
      backgroundColor: c.surfaceMuted,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      padding: 16,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.accentSolid,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
