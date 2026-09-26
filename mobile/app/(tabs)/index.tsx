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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Link } from "expo-router";
import { ChevronDown, ChevronUp, MessageCircle, MoreVertical, RotateCcw, Send, Trash2 } from "lucide-react-native";
import Markdown from "react-native-markdown-display";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenGlow } from "@/components/screen-glow";
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
  localDateKey,
  MOOD_KEYS,
  streamChatMessage,
  type ConversationMessage,
  type DailyTip,
  type MoodKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";
import { displayNameOf, getMoodAwarePlaceholder, getMoodAwareSubtext, getTimeGreeting } from "@/lib/greeting";
import { useLanguage, useT } from "@/lib/language-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { ErrorBanner, FormInput, PrimaryButton, PulseMark, Reveal, SecondaryButton, TypingIndicator, useThemeColors } from "@/components/ui";
import { MoodPicker } from "@/components/mood-picker";
import { MiniRhythmRing, RhythmRing, rhythmEncouragement } from "@/components/rhythm-ring";
import { QuickAddMenu } from "@/components/quick-add-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dismissible } from "@/components/dismissible";
import { BottomSheet } from "@/components/bottom-sheet";
import { tapLight } from "@/lib/haptics";
import { useDebouncedFocusEffect } from "@/lib/use-debounced-focus-effect";
import { CHAT_ASSISTANT_TONE_DARK, CHAT_ASSISTANT_TONE_LIGHT, CHAT_ASSISTANT_TONE_TEXT_DARK, CHAT_ASSISTANT_TONE_TEXT_LIGHT, CHAT_HEADER_BG_DARK, CHAT_HEADER_BG_LIGHT, CHAT_HEADER_TEXT, CHAT_USER_BUBBLE, TODAY_PANEL_BG_LIGHT, TODAY_PANEL_BG_LIGHT_BASE } from "@/components/chat-identity";
import { buildMarkdownStyle, isSafeMarkdownHref, markdownItInstance, markdownStyleUser, tableRenderRules } from "@/components/chat-markdown";
import { Avatar } from "@/components/chat-avatar";
import { makeStyles } from "@/components/chat-styles";

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
  const isDark = theme === "dark";
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
  // Akışlı yanıt (2026-09-26): taslak metin ve araç çalışırken durum etiketi.
  const [draft, setDraft] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null);
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
  // bkz. lib/use-debounced-focus-effect.ts notu (2026-09-21) - sekmeler
  // arasında art arda hızlı geçişte sadece gerçekten durulan odaklanma
  // tetiklenir.
  useDebouncedFocusEffect(
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

  useDebouncedFocusEffect(refreshDailyTip);

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
  // Renkler (2026-09-20, kullanıcı isteği): boş ekrandaki ipucu artık tarih
  // çipine tıklayınca açılan "Bugün" panelinin arka planını AYNEN taşıyor
  // (koyu: `c.surface`->`CHAT_HEADER_BG_DARK` diyagonal gradyan, açık:
  // `TODAY_PANEL_BG_LIGHT` görseli) ve metin renkleri de panelle aynı
  // (`c.text`/`c.muted`). Önceden `c.insightBg` idi, panelle hiç ilgisi yoktu.
  // (İlk yorum "üst çubuk"u tarih çipi/Ritim rozeti sanıp `chatHeaderBg`
  // kullanmıştı - kullanıcı bunun PANEL olduğunu netleştirdi.)
  function renderTipBanner() {
    if (!dailyTip || isTipDismissed) return null;
    const content = (
      <>
        <Text style={s.tipIcon}>{dailyTip.icon}</Text>
        <Text style={s.tipText}>
          <Text style={s.tipCategory}>{dailyTipText(dailyTip, language).category}: </Text>
          {dailyTipText(dailyTip, language).tip}
        </Text>
        <Text style={s.tipSwipeHint}>{t("kaydır", "swipe")}</Text>
      </>
    );
    return (
      <Dismissible onDismiss={() => setIsTipDismissed(true)}>
        {theme === "dark" ? (
          <LinearGradient
            colors={[c.surface, CHAT_HEADER_BG_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.tipBanner}
          >
            {content}
          </LinearGradient>
        ) : (
          <ImageBackground
            source={TODAY_PANEL_BG_LIGHT}
            resizeMode="cover"
            style={[s.tipBanner, { backgroundColor: TODAY_PANEL_BG_LIGHT_BASE }]}
            imageStyle={s.tipBannerImage}
          >
            {content}
          </ImageBackground>
        )}
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
            {rhythmEncouragement(todayMood, movementPct, nutritionPct, user ? displayNameOf(profile, user.email) : undefined, t, ringReplayTick, streakDays)}
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
  // taramasında bulundu). useDebouncedFocusEffect ile sekmeye HER GERÇEK
  // dönüşte (art arda hızlı geçilenler DEĞİL, bkz. dosyası) tazeleniyor.
  useDebouncedFocusEffect(
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
  useDebouncedFocusEffect(
    useCallback(() => {
      if (!token) return;
      // 2026-09-23: backend'in days=1'i "dünden itibaren" demek (since =
      // bugün - 1) - önceki hali sadece listenin boş olup olmadığına bakıyordu,
      // DÜN antrenman yapan kullanıcıda bugünkü halka "Hareket %100"
      // gösteriyordu. Son oturumun tarihi cihazın YEREL bugünüyle
      // karşılaştırılıyor (backend de artık X-Timezone ile aynı günü kullanıyor).
      getWorkoutSessions(token, 1, 1)
        .then((sessions) => {
          const today = localDateKey();
          setMovementPct(sessions.some((session) => session.session_date === today) ? 100 : 0);
        })
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
  useDebouncedFocusEffect(
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
  }, [messages, isSending, draft, toolLabel]);

  async function handleSubmit() {
    if (!token || !input.trim() || isSending) return;

    const text = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: text }]);
    setIsSending(true);
    setDraft("");
    setToolLabel(null);
    let streamStarted = false;

    try {
      const response = await streamChatMessage(token, text, (streamEvent) => {
        streamStarted = true;
        if (streamEvent.type === "tool") setToolLabel(streamEvent.label);
        else if (streamEvent.type === "token") {
          setToolLabel(null);
          setDraft((prev) => prev + streamEvent.text);
        } else if (streamEvent.type === "reset") setDraft("");
      });
      setMessages((prev) => [
        ...prev,
        { id: `local-reply-${Date.now()}`, role: "assistant", content: response.reply },
      ]);
    } catch (err) {
      // Akış yarıda koptuysa sunucu turu yine tamamlayıp kaydediyor - geçmişi
      // yeniden yükleyince kesin yanıt ekrana gelir.
      if (streamStarted) {
        getChatHistory(token)
          .then((history) => setMessages(history.map(toDisplayMessage)))
          .catch(() => {});
      }
      setError(err instanceof ApiError ? err.message : t("Mesaj gönderilemedi, tekrar dener misin?", "Couldn't send the message, want to try again?"));
    } finally {
      setIsSending(false);
      setDraft("");
      setToolLabel(null);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Koyu modda tepe parıltısı - İlerleme'yle AYNI bileşen/üst renk (sekme
          geçişinde zemin sıçramasın), ama KISA: "Bugün" panelinin hizasında
          söner, mesaj listesinin ve giriş kutusunun arkasına inmez (kullanıcı
          isteği, 2026-09-19). Açık mod düz krem. */}
      <ScreenGlow height={300} strength={0.9} />
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
            <Pressable
              onPress={() => setIsManageSheetOpen(true)}
              style={s.iconButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("Sohbeti yönet", "Manage chat")}
            >
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
                    {greeting}, {displayNameOf(profile, user.email)}!
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
                  <View style={[s.bubble, s.bubbleAssistant]} accessibilityLiveRegion="polite">
                    {draft ? (
                      // Akış taslağı: sonda gelen kesin yanıt bunun yerine geçer.
                      <Markdown
                        markdownit={markdownItInstance}
                        style={markdownStyleAssistant}
                        rules={tableRenderRules}
                        onLinkPress={isSafeMarkdownHref}
                      >
                        {draft}
                      </Markdown>
                    ) : (
                      <View style={s.typingRow}>
                        {/* size=26 - avatardaki PulseMark'la (20px) aynı satırda
                            boyut tutarsızlığı yaşanmasın diye varsayılan 36'dan
                            küçültüldü, bkz. Avatar'ın üstündeki not. `color`
                            artık `assistantToneText` - balon/avatar dolgusuyla
                            AYNI renk ailesinden (bkz. dosya başı notu),
                            varsayılan `c.accent`'ten bağımsız. */}
                        <TypingIndicator size={26} color={assistantToneText} />
                        {toolLabel ? <Text style={[s.toolStatus, { color: assistantToneText }]}>{toolLabel}…</Text> : null}
                      </View>
                    )}
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
            accessibilityRole="button"
            accessibilityLabel={t("Gönder", "Send")}
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
      {/* Dark tema cilası (2026-09-22, kullanıcı isteği): kartlar ÖNCEDEN düz
          `c.surfaceMuted` (#232D31) zeminde `c.border` (#2C383C) kenarlıktı -
          ikisi birbirine çok yakın olduğu için koyu temada panel sheet'in
          zeminden ayrışmıyor, "silik/düz" duruyordu. Diğer sayfalarda (bkz.
          workouts.tsx::panelBorder, reference-pulsecoach-design-language §2)
          kurulu dilin AYNISI: koyu temada beyaz-alfa kenarlık + hafif beyaz
          overlay ile "cam panel" hissi, kimlik rozetlerine ince kenarlık. Açık
          temaya DOKUNULMADI (zaten yeterli kontrastta). */}
      <BottomSheet visible={isManageSheetOpen} onClose={closeManageSheet}>
        <View style={s.manageHeader}>
          <View
            style={[
              s.manageHeaderIcon,
              isDark ? { backgroundColor: `${c.accent}26`, borderColor: `${c.accent}66` } : null,
            ]}
          >
            <MoreVertical size={16} color={c.accent} />
          </View>
          <Text style={s.sheetTitle}>{t("Sohbeti Yönet", "Manage Chat")}</Text>
        </View>
        {manageError ? <ErrorBanner message={manageError} /> : null}

        <View style={[s.manageCard, isDark ? s.manageCardDark : null]}>
          <View style={s.manageCardHeader}>
            <View
              style={[
                s.manageIconBadge,
                { backgroundColor: `${c.accent}${isDark ? "26" : "1F"}` },
                isDark ? { borderColor: `${c.accent}66` } : null,
              ]}
            >
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

        <View style={[s.manageCard, isDark ? s.manageCardDark : null, isDark ? s.manageCardDangerDark : s.manageCardDanger]}>
          <View style={s.manageCardHeader}>
            <View
              style={[
                s.manageIconBadge,
                { backgroundColor: `${c.error}${isDark ? "26" : "1F"}` },
                isDark ? { borderColor: `${c.error}66` } : null,
              ]}
            >
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

