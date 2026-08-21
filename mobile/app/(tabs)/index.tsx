import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
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
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { Bot, ChevronDown, MessageCircle, MoreVertical, Send, Sparkles, Trash2, User } from "lucide-react-native";
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
  getWorkoutSessions,
  MOOD_KEYS,
  sendChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting, nameFromEmail } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { ErrorBanner, FormInput, MOOD_META, PrimaryButton, PulseMark, SecondaryButton, type ThemeColors, TypingIndicator, useThemeColors } from "@/components/ui";
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

function Avatar({ role, c }: { role: "user" | "assistant"; c: ThemeColors }) {
  const isUser = role === "user";
  return (
    <View
      style={[
        avatarBaseStyle,
        { backgroundColor: isUser ? c.surfaceMuted : `${c.accent}1F` },
      ]}
    >
      {isUser ? <User size={14} color={c.muted} /> : <Bot size={14} color={c.accent} />}
    </View>
  );
}

// Rengden bağımsız (sadece boyut/şekil) - tema değişince yeniden hesaplanmasına
// gerek yok, modül seviyesinde sabit kalabiliyor.
const avatarBaseStyle = StyleSheet.create({
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
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

  // "Bugün nasıl hissediyorsun / günün ipucu / Ritim" ARTIK FlatList'in
  // içinde DEĞİL (bkz. aşağıdaki BottomSheet) - konuşma uzadıkça bunlar
  // yukarıda gömülüp erişilemez hale geliyordu (kullanıcı bulgusu,
  // 2026-08-17). Üst bardaki "Bugün" rozetinden her zaman aynı yerden
  // erişilebiliyor.
  const [isTodaySheetOpen, setIsTodaySheetOpen] = useState(false);

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

  function openTodaySheet() {
    tapLight();
    setIsTodaySheetOpen(true);
    refreshDailyTip();
    // Sekmeye dönüşün ötesinde, AYNI ziyaret içinde sheet'i kapatıp tekrar
    // açsa bile bir sonraki cümle varyantı farklı gelsin diye (bkz.
    // ringReplayTick tanımındaki not).
    setRingReplayTick((n) => n + 1);
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

  // "Sayfaya oturmuyor" geri bildirimi (kullanıcı bulgusu, 2026-08-18):
  // yukarıdaki renderTipBanner() köşeleri yuvarlak, kendi arka planı olan
  // bir KART - kenarlara değmeden üst barın altında durunca "havada asılı"
  // görünüyordu. Bu, üst barın DEVAMI gibi tam genişlikte (kenardan kenara,
  // köşe yuvarlaması YOK) bir şerit - alt kenardaki ince çizgi başlık
  // bloğunu "kapatıyor", konuşma listesi ondan SONRA başlıyor gibi
  // hissettiriyor. SADECE bu konumda (üst barın altı) kullanılıyor - boş
  // ekrandaki nudge (renderTipBanner, kart hâliyle) ayrı, orada zaten
  // ortalanmış/içe girintili bir düzen var, kart orada daha tutarlı.
  function renderTipStrip() {
    if (!dailyTip || isTipDismissed) return null;
    return (
      <Dismissible onDismiss={() => setIsTipDismissed(true)}>
        <View style={s.tipStrip}>
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={s.topBar}>
          {/* "Bugün" (Mood/İpucu/Ritim) ARTIK burada, ayrı bir BottomSheet
              olarak - bkz. state tanımlarındaki not. Accent-tonlu dolgu +
              çerçeve ile diğer nötr üst bar ikonlarından bilerek AYRIŞIYOR -
              önceki nötr (surfaceMuted) hali "sırıtmıyordu ama fark
              edilmiyordu" da (kullanıcı geri bildirimi, 2026-08-17). Bugünkü
              mood seçiliyse emoji'si de görünüyor - sheet'i açmadan bir
              bakışta bilgi. Kapatılmamış bir ipucu varsa küçük bir nokta.
              openTodaySheet HER dokunuşta ipucunu da tazeler (bkz. tanımı). */}
          <Pressable onPress={openTodaySheet} style={s.todayChip} hitSlop={4}>
            <Sparkles size={14} color={c.accent} />
            <Text style={s.todayChipText}>{t("Bugün", "Today")}</Text>
            {todayMood ? <Text style={s.todayChipMoodEmoji}>{MOOD_META[todayMood].emoji}</Text> : null}
            {/* Ritim halkasının minyatür önizlemesi (kullanıcı isteği,
                2026-08-18) - ayrıntılı döküm hâlâ sadece sheet'te, bu sadece
                bir bakışta "bugün nasıl gidiyor" sinyali. */}
            <MiniRhythmRing
              movementPct={movementPct}
              nutritionPct={nutritionPct}
              moodPct={moodPct}
              replayKey={ringReplayTick}
            />
            {dailyTip && !isTipDismissed ? <View style={s.todayChipDot} /> : null}
          </Pressable>
          <View style={s.topBarRight}>
            <ThemeToggle />
            <Pressable onPress={() => setIsManageSheetOpen(true)} style={s.iconButton} hitSlop={8}>
              <MoreVertical size={18} color={c.muted} />
            </Pressable>
          </View>
        </View>

        {/* İpucu, "Bugün"e dokunmadan da görülsün diye (kullanıcı bulgusu,
            2026-08-18: "tıklamazsa boşa gidiyor") - mesaj listesinin
            İÇİNDE DEĞİL (17 Ağustos'taki gömülme sorununu tekrar
            yaratmasın), üst barın hemen altında tam genişlikte bir şerit
            (bkz. renderTipStrip notu - kart değil, başlığın devamı gibi),
            kaydırarak kapatılabiliyor. Sadece konuşma VARKEN gösteriliyor -
            boşken zaten ListEmptyComponent kendi "kullanmaya it" bloğunda
            (kart hâliyle, renderTipBanner) gösteriyor, ikisi birden ÇİFT
            görünmesin diye. */}
        {!isLoadingHistory && messages.length > 0 ? renderTipStrip() : null}

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
              <View style={s.emptyState}>
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
                    tam tersi bir izlenim bırakırdı. */}
                <View style={s.emptyNudge}>
                  <MoodPicker onMoodChange={setTodayMoodKey} />
                  {renderTipBanner()}
                </View>
              </View>
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
                {item.role === "user" ? <Avatar role="user" c={c} /> : null}
              </View>
            )}
            ListFooterComponent={
              isSending ? (
                <View style={[s.messageRow, s.messageRowAssistant]}>
                  <Avatar role="assistant" c={c} />
                  <View style={[s.bubble, s.bubbleAssistant]}>
                    <TypingIndicator />
                  </View>
                </View>
              ) : null
            }
          />
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
            style={[s.sendButton, (isSending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Send size={18} color={c.onAccentSolid} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={isTodaySheetOpen} onClose={() => setIsTodaySheetOpen(false)}>
        <Text style={s.sheetTitle}>{t("Bugün", "Today")}</Text>
        {/* Sıra: önce ruh hali seçici, sonra kişisel mesaj, en sonda Ritim
            (günün özet halkası) - en hızlı/en sık yapılan eylem (mood
            seçimi) en üstte (2026-08-17). Günün İpucu ARTIK burada DEĞİL
            (kullanıcı isteği, 2026-08-18: jenerik bir bilgi kırıntısı
            "bugün nasılsın" temasına oturmuyordu, ayrıca üstteki şeritle
            [bkz. renderTipStrip] TEKRAR ediyordu) - yerine DOĞRUDAN bugünkü
            ruh haline göre değişen kısa, sıcak bir cümle geldi (bkz.
            rhythm-ring.tsx::rhythmEncouragement, backend çağrısı gerekmez).
            İpucu özelliği KALDIRILMADI - hâlâ üstteki şeritte duruyor. */}
        <MoodPicker onMoodChange={setTodayMoodKey} />
        <Text style={s.todayEncouragement}>
          {rhythmEncouragement(todayMood, movementPct, nutritionPct, user ? nameFromEmail(user.email) : undefined, t, ringReplayTick)}
        </Text>
        <RhythmRing movementPct={movementPct} nutritionPct={nutritionPct} moodPct={moodPct} />
      </BottomSheet>

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
    // Üst barın altındaki sabit ipucu şeridi - bkz. renderTipStrip notu.
    // tipBanner'daki (kart hâli) borderRadius/marjlar BİLEREK YOK - kenardan
    // kenara (full-bleed) uzanıp alttaki ince çizgiyle başlık bloğunu
    // "kapatıyor", köşeli/yuvarlak bir kart gibi havada asılı durmuyor
    // (kullanıcı bulgusu: "sayfaya tam oturmuyor", 2026-08-18).
    tipStrip: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: `${c.accent}0D`,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    todayEncouragement: {
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
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
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
