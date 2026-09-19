import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ImageBackground,
  Keyboard,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { ChevronDown, ChevronUp, MessageCircle, MoreVertical, RotateCcw, Send, Trash2, User } from "lucide-react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { LinearGradient } from "expo-linear-gradient";
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
import { useTheme } from "@/lib/theme-context";
import { ErrorBanner, FormInput, PrimaryButton, PulseMark, Reveal, SecondaryButton, type ThemeColors, TypingIndicator, useThemeColors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";
import { MiniRhythmRing, RhythmRing, rhythmEncouragement } from "@/components/rhythm-ring";
import { QuickAddMenu } from "@/components/quick-add-menu";
import { getFloatingTabBarClearance } from "@/components/nav-icons";
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

// Sohbet balonu/avatar/üst bar rozeti renkleri - arkadaşın gönderdiği chat
// tasarımı (2026-09-18, "pulsecoach pngler/chat"). Kullanıcı tarafı
// (balon+avatar) her iki tema ekran görüntüsünde de (piksel örneklemesiyle
// doğrulandı) AYNI hex değerlerini kullanıyor - bilinçli, temadan BAĞIMSIZ
// SABİT bir marka rengi.
// Açık mod arkaplanı YİNE DE uygulamanın kendi düz krem rengine sabit
// kalıyor (kullanıcı talimatı) - bu sabitler SADECE balon/avatar/rozet
// içindir, sayfa zemini `c.background`'dan hiç etkilenmiyor.
const CHAT_USER_BUBBLE = "#FF5A1F";
const CHAT_USER_AVATAR_BG = "#525252";
const CHAT_HEADER_TEXT = "#F5F3EE";
// Asistan tarafı (balon+avatar arka planı+"düşünüyor" nabız animasyonu)
// ÖNCEDEN kullanıcı tarafıyla AYNI mantıkla sabit tek bir peach'ti - ama
// avatar arka planı (CHAT_AVATAR_BG, gri) balonun peach rengiyle hiç
// eşleşmiyordu, kullanıcı bunu "üçü de aynı renk olsun" diye bulguladı
// (2026-09-19). Artık üçü (balon dolgusu, asistan avatar dolgusu,
// TypingIndicator'ın rengi) TEK bir "assistantTone" çiftinden geliyor -
// açık temada ESKİ (beğenilen) peach korunuyor, koyu temada aynı peach'in
// düşük parlaklıklı/aynı ton ailesindeki karşılığı (HSL'de hue korunarak
// l/s düşürülerek türetildi) kullanılıyor - bkz. ChatTab içindeki
// `assistantTone`/`assistantToneText` hesaplaması.
const CHAT_ASSISTANT_TONE_LIGHT = "#FFCDBB";
const CHAT_ASSISTANT_TONE_DARK = "#382219";
const CHAT_ASSISTANT_TONE_TEXT_LIGHT = "#241D14";
const CHAT_ASSISTANT_TONE_TEXT_DARK = "#F5F3EE";
// Üst bardaki tarih çipi + Ritim rozetinin dolgusu - SABİT değil, tasarımın
// kendisi koyu/açık temada FARKLI iki ton kullanıyor (koyu: bir maroon/
// kahve, açık: canlı mercan) - bkz. dosyanın en altındaki chatHeaderBg
// hesaplaması.
const CHAT_HEADER_BG_DARK = "#3B1F15";
const CHAT_HEADER_BG_LIGHT = "#FD8D64";
// Açık modda "Bugün" panelinin arka planı (kullanıcı talimatı 2026-09-19:
// sayfa zemini düz krem kalır, SADECE bu panel mockup'taki beyaz+turuncu
// parıltı zeminini taşır). Klasörde ayrı bir arka plan dosyası yok, mockup
// (bilgilendirmeekranı/light) üzerinden yazılar/ikonlar temizlenerek
// üretildi. Renk yükleme anında/görsel şeffaf kalırsa görünür taban rengi.
const TODAY_PANEL_BG_LIGHT = require("@/assets/images/today-panel-light.png");
const TODAY_PANEL_BG_LIGHT_BASE = "#F8F8F8";

// 2026-08-30 güvenlik denetimi: web tarafı (chat/page.tsx) 2026-08-26'da
// `javascript:`/`data:` gibi güvensiz şemalı markdown linklerine karşı bir
// filtre almıştı, mobil aynı LLM çıktısını render eden karşılık gelen ekran
// atlanmıştı (parite eksikliği). react-native-markdown-display'in
// `onLinkPress` prop'u `true` dönerse linki kendisi `Linking.openURL` ile
// açıyor - `false` dönmek açmayı ENGELLIYOR (bkz. node_modules/
// react-native-markdown-display/src/lib/util/openUrl.js).
const _SAFE_HREF_SCHEMES = /^(https?:|mailto:)/i;
function isSafeMarkdownHref(href: string): boolean {
  if (!href) return false;
  if (!href.includes(":")) return true; // şema içermeyen (göreli) link
  return _SAFE_HREF_SCHEMES.test(href);
}

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

// Kullanıcı balonu dolgusu SABİT (bkz. dosya başındaki CHAT_USER_BUBBLE
// notu) - bu yüzden içindeki markdown metin rengi de modül seviyesinde
// SABİT. Asistan tarafı ARTIK TEMAYA GÖRE DEĞİŞTİĞİ için (bkz.
// CHAT_ASSISTANT_TONE_* notu) markdownStyleAssistant ChatTab İÇİNDE,
// `assistantToneText`e göre useMemo ile hesaplanıyor (bkz. aşağısı).
const markdownStyleUser = buildMarkdownStyle("#FFFFFF", "#FFFFFF33");

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
// Kullanıcı avatarı SABİT (gri) - ÖNCEDEN `c.surfaceMuted` kullanıyordu
// (temaya göre değişiyordu), 2026-09-18 turunda sabitlendi. Asistan avatarı
// ARTIK `assistantTone`/`assistantToneText` prop'larıyla ChatTab'dan
// besleniyor (bkz. dosya başındaki CHAT_ASSISTANT_TONE_* notu) - balonuyla
// AYNI renk, temaya göre değişiyor. Prop verilmezse (teorik olarak
// olmamalı, TypingIndicator/mesaj listesi her zaman geçiyor) açık temanın
// tonuna düşülüyor.
function Avatar({
  role,
  initial,
  assistantBg,
  assistantFg,
}: {
  role: "user" | "assistant";
  initial?: string;
  assistantBg?: string;
  assistantFg?: string;
}) {
  const isUser = role === "user";
  const bg = isUser ? CHAT_USER_AVATAR_BG : (assistantBg ?? CHAT_ASSISTANT_TONE_LIGHT);
  const fg = isUser ? CHAT_HEADER_TEXT : (assistantFg ?? CHAT_ASSISTANT_TONE_TEXT_LIGHT);
  return (
    <View style={[avatarBaseStyle, { backgroundColor: bg }]}>
      {isUser ? (
        initial ? (
          <Text style={[avatarInitialStyle, { color: fg }]}>{initial}</Text>
        ) : (
          <User size={17} color={fg} />
        )
      ) : (
        <PulseMark size={20} color={fg} />
      )}
    </View>
  );
}

const avatarInitialStyle = { fontSize: 14, fontFamily: "Inter_700Bold" } as const;

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
  const { theme } = useTheme();
  const chatHeaderBg = theme === "dark" ? CHAT_HEADER_BG_DARK : CHAT_HEADER_BG_LIGHT;
  // Asistan balonu + avatar dolgusu + "düşünüyor" nabız animasyonu - ÜÇÜ
  // DE bu TEK çiftten geliyor (bkz. dosya başındaki CHAT_ASSISTANT_TONE_*
  // notu, kullanıcı bulgusu 2026-09-19).
  const assistantTone = theme === "dark" ? CHAT_ASSISTANT_TONE_DARK : CHAT_ASSISTANT_TONE_LIGHT;
  const assistantToneText = theme === "dark" ? CHAT_ASSISTANT_TONE_TEXT_DARK : CHAT_ASSISTANT_TONE_TEXT_LIGHT;
  const insets = useSafeAreaInsets();
  // Klavye açıkken giriş satırının alt boşluğu (bkz. `inputRow` notu):
  // yüzen alt çubuk klavyenin ALTINDA kalıyor/gizleniyor, onun payını
  // korumak mesaj kutusu ile klavye arasında büyük bir boşluk bırakıyordu.
  // Klavye olayları web'de tetiklenmez (varsayılan false = eski davranış).
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const s = useMemo(
    () => makeStyles(c, assistantTone, insets.bottom, isKeyboardVisible),
    [c, assistantTone, insets.bottom, isKeyboardVisible]
  );
  const markdownStyleAssistant = useMemo(
    () => buildMarkdownStyle(assistantToneText, `${assistantToneText}14`),
    [assistantToneText]
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

  // Tasarım turu (2026-09-19, "bilgilendirme ekranı" mockup'ı): ipucu
  // ARTIK "💚 Sağlık Notu:" başlığı + tam metin - ÖNCEDEN backend'in
  // kendi kategori adı+ikonu (ör. "Spor:"/"🏋️") inline gösteriliyordu,
  // mockup TÜM kategoriler için TEK, jenerik bir başlık kullanıyor (kalp
  // emoji'si de mockup'ta SABİT yeşil kalp, kategoriye göre değişmiyor).
  // Kategori bilgisi KAYBOLMUYOR aslında - backend'in `tip` metni zaten
  // konusunu kendi içinde anlatıyor (ör. "Günlük su ihtiyacı..."), sadece
  // ayrı bir etiket olarak ÖNE ÇIKARILMIYOR. Kaydırarak kapatma
  // (Dismissible) davranışı KORUNDU, sadece görünür "kaydır" ipucu metni
  // mockup'ta yok diye kaldırıldı (boş ekrandaki `renderTipBanner`
  // BİLEREK DOKUNULMADI - o AYRI bir bağlam, kendi "kaydır" ipucuyla
  // kalmaya devam ediyor).
  function renderHealthNote() {
    if (!dailyTip || isTipDismissed) return null;
    return (
      <Dismissible onDismiss={() => setIsTipDismissed(true)}>
        <View style={s.healthNote}>
          <View style={s.healthNoteHeader}>
            <Text style={s.healthNoteIcon}>💚</Text>
            <Text style={s.healthNoteTitle}>{t("Sağlık Notu:", "Health Note:")}</Text>
          </View>
          <Text style={s.healthNoteText}>{dailyTipText(dailyTip, language).tip}</Text>
        </View>
      </Dismissible>
    );
  }

  // "Bugün" panelinin TÜM içeriği (mood seçici + kişisel cümle + sağlık
  // notu + Ritim halkası) - hem koyu (LinearGradient) hem açık (düz krem
  // View) kart sarmalayıcısı AYNI içeriği kullandığı için (bkz. JSX'teki
  // todayPanelCard notu) tek yerden. Düz bir fonksiyon (JSX bileşeni
  // DEĞİL) - renderTipBanner'daki AYNI gerekçe: her render'da yeni bir
  // bileşen kimliği MoodPicker/Dismissible'ın iç durumunu sıfırlardı.
  function renderTodayPanelContent() {
    return (
      <>
        <MoodPicker onMoodChange={setTodayMoodKey} variant="panel" />
        <View style={s.todayEncouragementCard}>
          <Text style={s.todayEncouragementIcon}>✨</Text>
          <Text style={s.todayEncouragement}>
            {rhythmEncouragement(todayMood, movementPct, nutritionPct, user ? nameFromEmail(user.email) : undefined, t, ringReplayTick, streakDays)}
          </Text>
        </View>
        {isTodayExpanded ? renderHealthNote() : null}
        <View style={s.todayRhythmRow}>
          <RhythmRing movementPct={movementPct} nutritionPct={nutritionPct} moodPct={moodPct} variantSeed={ringReplayTick} />
        </View>
      </>
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
        // 2026-09-19: eskiden iOS'ta 90 idi (Faz M2) - o günlerde alt çubuk
        // içerikle AKAN (yüksekliği kadar yer kaplayan) bir çubuktu ve 90 onu
        // telafi ediyordu. Çubuk `position:"absolute"` olunca ekran zaten
        // ekranın en altına kadar uzuyor, 90 klavye üstüne FAZLADAN ~90pt
        // boşluk ekliyordu (kullanıcı bulgusu: "mesaj kutusu ile klavye
        // arasında çok boşluk").
        keyboardVerticalOffset={0}
      >
        <View style={s.topBar}>
          {/* "Bugün" (Mood/Ritim) ARTIK bir sheet'in ARKASINDA DEĞİL - hemen
              altta, sabit bir panelde (bkz. aşağı) VARSAYILAN AÇIK duruyor
              (kullanıcı isteği, 2026-08-21 tasarım denetimi: "sheete
              tıklanmadan görünsün"). Şevron panelin açık/kapalı durumunu
              gösteriyor, kapatılmamış bir ipucu varsa küçük bir nokta.
              Tasarım turu (2026-09-18, arkadaşın chat mockup'ı): ÖNCEDEN
              tek bir çip içinde ikon+tarih+mood emoji+minyatür Ritim halkası
              hepsi bir aradaydı - tasarım bunu İKİYE ayırıyor: dolgulu bir
              tarih çipi + yanında ayrı, dairesel bir Ritim yüzdesi rozeti.
              Mood emoji'si BİLEREK kaldırıldı (mockup'ta yok, panel zaten
              MoodPicker'ı gösteriyor) - bilgi kaybı yok, sadece tekrar
              azaldı. */}
          <View style={s.topBarLeft}>
            <Pressable
              onPress={toggleTodayPanel}
              style={[s.dateChip, { backgroundColor: chatHeaderBg, borderColor: c.accent }]}
              hitSlop={4}
            >
              <Text style={s.dateChipText} numberOfLines={1}>{todayLabel}</Text>
              {dailyTip && !isTipDismissed ? <View style={s.todayChipDot} /> : null}
              {isTodayExpanded ? (
                <ChevronUp size={14} color={CHAT_HEADER_TEXT} />
              ) : (
                <ChevronDown size={14} color={CHAT_HEADER_TEXT} />
              )}
            </Pressable>
            {/* Bileşik "Ritim" yüzdesi artık kendi dairesel rozetinde - dolgu
                tarih çipiyle AYNI (`chatHeaderBg`), böylece halkanın DOLMAMIŞ
                kısmı rozetin kendi zeminiyle görsel olarak birleşiyor, sadece
                turuncu ilerleme yayı + beyaz/krem sayı öne çıkıyor (bkz.
                rhythm-ring.tsx'teki `trackColor`/`numberColor` notu). */}
            <Pressable
              onPress={toggleTodayPanel}
              style={[s.rhythmBadge, { backgroundColor: chatHeaderBg, borderColor: c.accent }]}
              hitSlop={4}
            >
              <MiniRhythmRing
                movementPct={movementPct}
                nutritionPct={nutritionPct}
                moodPct={moodPct}
                replayKey={ringReplayTick}
                size={38}
                trackColor={chatHeaderBg}
                numberColor={CHAT_HEADER_TEXT}
              />
            </Pressable>
          </View>
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
            {/* Tasarım turu (2026-09-19, arkadaşın "bilgilendirme ekranı"
                mockup'ı): mood seçici+kişisel cümle+ipucu+Ritim halkası
                ÖNCEDEN ayrı ayrı stillenmiş parçalardı (mood seçici çıplak,
                encouragement kendi kartında, ipucu ince bir çizgiyle
                ayrılmış) - artık HEPSİ TEK bir kartın İÇİNDE birleşiyor.
                `Reveal` dış sarmalayıcıda kalıyor (sekmeye dönüşte fade-in) -
                kartın KENDİSİ (arka plan/kenarlık) `todayPanelCard`'da, iki
                katman farklı işler görüyor. Koyu modda ince bir gradyan
                (mockup'ın diyagonal-çizgili dokusu yerine BASİT, bakımı
                kolay bir yaklaşım - iki sabit ton arası) + açık modda
                mockup'ın beyaz+turuncu-parıltı arka planı (kullanıcı
                talimatıyla SADECE bu panel için - sayfanın kendisi düz krem
                kalıyor; bkz. TODAY_PANEL_BG_LIGHT). */}
            <Reveal style={s.todayPanel}>
              {theme === "dark" ? (
                <LinearGradient
                  colors={[c.surface, CHAT_HEADER_BG_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.todayPanelCard}
                >
                  {renderTodayPanelContent()}
                </LinearGradient>
              ) : (
                <ImageBackground
                  source={TODAY_PANEL_BG_LIGHT}
                  resizeMode="cover"
                  style={[s.todayPanelCard, { backgroundColor: TODAY_PANEL_BG_LIGHT_BASE }]}
                  imageStyle={s.todayPanelCardImage}
                >
                  {renderTodayPanelContent()}
                </ImageBackground>
              )}
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
                {item.role === "assistant" ? (
                  <Avatar role="assistant" assistantBg={assistantTone} assistantFg={assistantToneText} />
                ) : null}
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
                    onLinkPress={isSafeMarkdownHref}
                  >
                    {item.content}
                  </Markdown>
                </View>
                {item.role === "user" ? (
                  <Avatar role="user" initial={user ? user.email.charAt(0).toUpperCase() : undefined} />
                ) : null}
              </View>
            )}
            ListFooterComponent={
              isSending ? (
                <View style={[s.messageRow, s.messageRowAssistant]}>
                  <Avatar role="assistant" assistantBg={assistantTone} assistantFg={assistantToneText} />
                  <View style={[s.bubble, s.bubbleAssistant]}>
                    {/* size=26 - avatardaki PulseMark'la (20px) aynı satırda
                        boyut tutarsızlığı yaşanmasın diye varsayılan 36'dan
                        küçültüldü, bkz. Avatar'ın üstündeki not. `color`
                        artık `assistantToneText` - balon/avatar dolgusuyla
                        AYNI renk ailesinden (bkz. dosya başı notu),
                        varsayılan `c.accent`'ten bağımsız. */}
                    <TypingIndicator size={26} color={assistantToneText} />
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
            style={[{ flex: 1 }, s.chatInput]}
            multiline
          />
          <Pressable
            onPress={handleSubmit}
            disabled={isSending || !input.trim()}
            hitSlop={4}
            style={[s.sendButton, (isSending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Send size={18} color={CHAT_USER_BUBBLE} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Tasarım turu (2026-09-19): panel içeriği ÖNCEDEN düz metin
          satırlarıydı (nötr/jenerik) - artık ekranın geri kalanıyla AYNI
          dilde: ikon rozetli başlık (bkz. üst bardaki todayChip/
          QuickAddMenu'nün ikon rozeti deseni) + her eylem KENDİ kartında
          (todayEncouragementCard'la AYNI ilke - dolgu+yuvarlak köşe).
          BottomSheet'in KENDİSİ (kabuk/animasyon) DEĞİŞMEDİ - o paylaşımlı
          bileşen, sadece BURADAKİ içerik reskin edildi. */}
      <BottomSheet visible={isManageSheetOpen} onClose={closeManageSheet}>
        <View style={s.manageHeader}>
          <View style={s.manageHeaderIcon}>
            <MoreVertical size={16} color={c.accent} />
          </View>
          <Text style={s.sheetTitle}>{t("Sohbeti Yönet", "Manage Chat")}</Text>
        </View>
        {manageError ? <ErrorBanner message={manageError} /> : null}

        <View style={s.manageCard}>
          <View style={s.manageCardHeader}>
            <View style={[s.manageIconBadge, { backgroundColor: `${c.accent}1F` }]}>
              <RotateCcw size={15} color={c.accent} />
            </View>
            <Text style={s.manageRowTitle}>{t("Sohbeti Sıfırla", "Reset Chat")}</Text>
          </View>
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

        <View style={[s.manageCard, s.manageCardDanger]}>
          <View style={s.manageCardHeader}>
            <View style={[s.manageIconBadge, { backgroundColor: `${c.error}1F` }]}>
              <Trash2 size={15} color={c.error} />
            </View>
            <Text style={[s.manageRowTitle, { color: c.error }]}>
              {t("Sohbeti Kalıcı Olarak Sil", "Permanently Delete Chat")}
            </Text>
          </View>
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

function makeStyles(c: ThemeColors, assistantTone: string, insetBottom: number, isKeyboardVisible: boolean) {
  return StyleSheet.create({
    // Tasarım turu (2026-09-19): alt gezinme çubuğu artık yüzen/absolute bir
    // pil (bkz. (tabs)/_layout.tsx) - giriş satırının pilin ALTINDA
    // kalmaması için gereken pay BURADA DEĞİL, `inputRow`'un kendi
    // `paddingBottom`'unda (bkz. oradaki not - web'de flex:1'e eklenen
    // padding sayfayı taşırıyordu).
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
    // Tarih çipi + Ritim rozeti BİRLİKTE tek bir sol grup (2026-09-18
    // tasarım turu) - `flexShrink` sayesinde dar ekranlarda tarih metni
    // (bkz. dateChipText numberOfLines) küçülüyor, rozet HER ZAMAN sabit
    // boyutunu koruyor, `topBarRight` (tema/menü) ekran dışına itilmiyor.
    topBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 1,
      marginRight: 8,
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
    // Dolgulu tarih çipi - tasarım turu (2026-09-18): ÖNCEDEN nötr bir
    // accent-tonlu ÇERÇEVE'ydi (`${c.accent}1F` dolgu), arkadaşın chat
    // mockup'ı tam dolgulu, koyu/açık temada FARKLI iki ton (`chatHeaderBg`,
    // JSX'te geçiliyor) + ince accent çerçeve kullanıyor.
    dateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    dateChipText: {
      flexShrink: 1,
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: CHAT_HEADER_TEXT,
    },
    // Bileşik "Ritim" yüzdesi - ÖNCEDEN tarih çipinin İÇİNDE minyatür bir
    // halkaydı, artık kendi dairesel rozeti (bkz. JSX'teki MiniRhythmRing
    // notu). Boyut tarih çipiyle AYNI yüksekliğe (~44) oturacak şekilde.
    rhythmBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
    },
    // Bugünün ipucu henüz kapatılmadıysa küçük bir nokta - "Bugün"
    // sohbet listesinden çıkınca (bkz. dosya başı not) kaybolan eski
    // keşfedilebilirliğin yerine geçen minimal bir sinyal.
    todayChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: CHAT_HEADER_TEXT,
    },
    // "Bugün" panelinin dış çerçevesi - üst bardan hemen sonra geliyor,
    // kendi kenar boşluğu var (görsel kart `todayPanelCard`'da, bkz. aşağı).
    todayPanel: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    // Tasarım turu (2026-09-19): mood seçici+cümle+sağlık notu+Ritim
    // halkasını SARAN TEK kart - mockup'ın "hepsi bir arada" hissi.
    // Koyu modda JSX'te bunun yerine `LinearGradient` kullanılıyor (bkz.
    // oradaki not), bu stil SADECE dolgu/kenarlık DIŞINDAKİ ortak
    // özellikleri taşıyor (radius/padding/gap) - `backgroundColor` açık
    // mod çağrısında JSX'te ayrıca ekleniyor.
    todayPanelCard: {
      borderRadius: 20,
      padding: 16,
      gap: 12,
      overflow: "hidden",
    },
    // ImageBackground'un iç görseli kartın köşe yarıçapını KENDİ kesmez.
    todayPanelCardImage: {
      borderRadius: 20,
    },
    // Panel açıkken mesaj listesinin üstüne binen karartma - bkz.
    // todayScrimStyle notu. Renk BottomSheet'in backdrop'uyla AYNI
    // (`#000000A6`'nın daha HAFİF bir versiyonu, opaklık zaten
    // `panelProgress*0.4` ile ayrıca sınırlanıyor) - temadan bağımsız sabit
    // siyah, bir "karartma katmanı" her iki temada da böyle okunur.
    todayScrim: {
      backgroundColor: "#000000",
    },
    // "💚 Sağlık Notu" - bkz. renderHealthNote notu. Panelin KENDİ zemini
    // zaten dolgulu olduğu için (todayPanelCard) burada AYRI bir arka plan/
    // kenarlık YOK, sadece üstteki ince çizgi encouragement metninden
    // ayırıyor (tipInline'ın eski deseniyle AYNI ilke).
    healthNote: {
      gap: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${c.text}1F`,
    },
    healthNoteHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    healthNoteIcon: {
      fontSize: 14,
    },
    healthNoteTitle: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    healthNoteText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 19,
    },
    // Ritim halkası artık panelin KENDİ zemininde oturuyor (RhythmRing'in
    // eski kendi kart dolgusu kaldırıldı, bkz. rhythm-ring.tsx notu) -
    // sadece bir üst çizgiyle sağlık notundan ayrılıyor.
    todayRhythmRow: {
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${c.text}1F`,
    },
    // Bkz. yukarıdaki JSX notu - InsightCard'ın AYNI görsel dili
    // (insightBg/insightAccent) ödünç alındı, tam bileşen değil (title
    // gerektiriyor, burada gereksiz). Tasarım turu (2026-09-19): panelin
    // KENDİSİ artık kart olduğu için bu satırın KENDİ ayrı dolgu/arka
    // planı KALDIRILDI (çifte-kart görünümü mockup'ta yok) - sadece
    // ikon+metin satırı kaldı.
    todayEncouragementCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
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
    manageHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    manageHeaderIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${c.accent}1F`,
    },
    // Her eylem (Sıfırla/Kalıcı Sil) artık KENDİ kartında - üst bardaki
    // todayEncouragementCard ile AYNI dolgu+yuvarlak köşe dili (2026-09-19).
    manageCard: {
      gap: 8,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    manageCardDanger: {
      borderColor: `${c.error}33`,
    },
    manageCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    manageIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
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
    // Tasarım turu (2026-09-18): balon köşe yarıçapı 16'dan 20'ye çıkarıldı
    // (arkadaşın chat mockup'ındaki daha "pilli" görünüm). Kullanıcı balonu
    // SABİT (CHAT_USER_BUBBLE), asistan balonu `assistantTone` parametresi
    // üzerinden TEMAYA GÖRE değişiyor (bkz. dosya başındaki
    // CHAT_ASSISTANT_TONE_* notu, 2026-09-19).
    bubble: {
      maxWidth: "75%",
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      backgroundColor: CHAT_USER_BUBBLE,
    },
    bubbleAssistant: {
      backgroundColor: assistantTone,
    },
    // `paddingBottom` (`safe`'e DEĞİL, buraya) giriş satırının pilin
    // ALTINDA kalmamasını sağlıyor - `safe`'e eklemek web'de TÜM sayfanın
    // (flex:1 zincirinin) viewport'tan taşmasına yol açıyordu (kök neden:
    // web'de flex:1'e eklenen fazladan padding, aradaki FlatList'in
    // ESNEMESİ yerine kök konteynerin GERÇEK YÜKSEKLİĞİNİ artırıyor -
    // native'de flex:1 çocukları taşmaz ama web'de bu garanti YOK).
    // `inputRow` flex:1 DEĞİL (sabit yükseklikli bir satır) - fazladan
    // padding'i FlatList'in (flex:1, aradaki) esnek alanından "çalıyor",
    // kök konteyneri BÜYÜTMÜYOR.
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: isKeyboardVisible ? 10 : 16 + getFloatingTabBarClearance(insetBottom),
    },
    // Mesaj kutusu artık tam pil şekli (radius 22, ÖNCEDEN FormInput'un
    // paylaşımlı kutu köşesi 10'du - burada SADECE bu ekrana özel bir
    // override, FormInput'un kendi varsayılanı diğer tüm formlarda
    // DEĞİŞMEDİ, bkz. JSX'teki inline style).
    chatInput: {
      borderRadius: 22,
      borderColor: `${c.accent}40`,
    },
    // Gönder düğmesi - ÖNCEDEN dolu `accentSolid` daire, tasarım turu
    // (2026-09-18): hafif turuncu-tonlu dolgu + belirgin turuncu çerçeve
    // (mockup'ın dark'taki outline / light'taki açık dolgu halini TEK bir
    // ara tonla her iki temada da karşılayan pragmatik seçim).
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: `${CHAT_USER_BUBBLE}1F`,
      borderWidth: 1.5,
      borderColor: CHAT_USER_BUBBLE,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
